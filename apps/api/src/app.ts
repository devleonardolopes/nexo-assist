import { Elysia, t } from "elysia";
import type { ChatState, ConversationFilter, SendMessageBody, StreamEvent } from "@nexo/shared";
import { config } from "./config";
import type { Container } from "./container";
import { RateLimiter } from "./lib/rate-limit";
import { now } from "./lib/clock";
import { AnalystError } from "./services/analyst";
import { SESSION_COOKIE, toSessionUser } from "./services/auth";
import { daysSince } from "./services/sla";

function cookieOf(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

const clientIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";

const sse = (run: (emit: (e: StreamEvent) => void) => Promise<void>) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const emit = (e: StreamEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        try {
          await run(emit);
        } catch (err) {
          console.error("[chat] erro no stream", err);
          emit({ type: "error", code: "internal", message: "Algo deu errado. Tente novamente." });
        } finally {
          controller.close();
        }
      },
    }),
    { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } },
  );

export function createApp(c: Container) {
  const limiter = new RateLimiter(config.ipRatePerMinute);
  const loginLimiter = new RateLimiter(10);

  const authed = new Elysia({ name: "auth" })
    .onBeforeHandle(async () => {
      await c.ready;
    })
    .derive({ as: "scoped" }, async ({ request }) => {
      const found = await c.auth.resolve(cookieOf(request, SESSION_COOKIE));
      return { auth: found };
    });

  const requireUser = (auth: Awaited<ReturnType<Container["auth"]["resolve"]>>, set: { status?: number | string }, role?: "employee" | "analyst") => {
    if (!auth) {
      set.status = 401;
      return null;
    }
    if (role && auth.user.role !== role) {
      set.status = 403;
      return null;
    }
    return auth;
  };

  const chatState = async (userId: string, sessionId: string): Promise<ChatState> => {
    const row = await c.convos.getOrCreateActive(userId);
    const dto = await c.convos.toDto(row);
    dto.messages = await c.convos.hydrateDrafts(dto.messages);
    return { conversation: dto, messagesUsed: await c.auth.messagesUsed(sessionId), messagesLimit: config.messageLimit };
  };

  return new Elysia({ prefix: "/api" })
    .use(authed)
    .get("/health", () => ({ ok: true, time: now().toISOString() }))

    // --- Autenticação ---
    .post(
      "/auth/login",
      async ({ body, cookie, set, request }) => {
        if (!loginLimiter.allow(clientIp(request))) {
          set.status = 429;
          return { error: "Muitas tentativas. Aguarde um minuto." };
        }
        const result = await c.auth.login(body.email, body.password);
        if (!result) {
          set.status = 401;
          return { error: "E-mail ou senha inválidos." };
        }
        cookie[SESSION_COOKIE]!.set({
          value: result.token,
          httpOnly: true,
          sameSite: "lax",
          secure: Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production",
          path: "/",
          maxAge: config.sessionTtlHours * 3600,
        });
        return { user: result.user };
      },
      { body: t.Object({ email: t.String(), password: t.String() }) },
    )
    .post("/auth/logout", async ({ cookie, request }) => {
      await c.auth.logout(cookieOf(request, SESSION_COOKIE));
      cookie[SESSION_COOKIE]!.remove();
      return { ok: true };
    })
    .get("/auth/me", ({ auth, set }) => {
      const a = requireUser(auth, set);
      return a ? { user: toSessionUser(a.user) } : { error: "unauthenticated" };
    })

    // --- Perfil do funcionário ---
    .get("/me/profile", ({ auth, set }) => {
      const a = requireUser(auth, set);
      if (!a) return { error: "unauthenticated" };
      const changed = a.user.passwordChangedAt;
      return { user: toSessionUser(a.user), passwordChangedDaysAgo: changed ? daysSince(changed, now()) : null };
    })
    .post("/me/password-reset", ({ auth, set }) => {
      const a = requireUser(auth, set);
      if (!a) return { error: "unauthenticated" };
      // Simulado: em produção dispararia o e-mail do provedor de identidade.
      return { ok: true, sentTo: a.user.email };
    })

    // --- Chat do funcionário ---
    .get("/chat", async ({ auth, set }) => {
      const a = requireUser(auth, set, "employee");
      return a ? chatState(a.user.id, a.session.id) : { error: "forbidden" };
    })
    .post(
      "/chat/messages",
      async ({ auth, set, body, request }) => {
        const a = requireUser(auth, set, "employee");
        if (!a) return { error: "forbidden" };
        if (!limiter.allow(clientIp(request))) {
          set.status = 429;
          return { error: "Muitas requisições. Aguarde um instante." };
        }
        const text = body.text.trim().slice(0, 2000);
        if (!text) {
          set.status = 400;
          return { error: "Mensagem vazia" };
        }
        const conv = await c.convos.getOrCreateActive(a.user.id);
        return sse((emit) =>
          c.agent.handle(
            { user: { id: a.user.id, name: a.user.name, department: a.user.department, os: a.user.os }, sessionId: a.session.id, conversation: conv, consume: () => c.auth.consumeMessage(a.session.id) },
            { text, action: (body as SendMessageBody).action },
            emit,
          ),
        );
      },
      {
        body: t.Object({
          text: t.String(),
          action: t.Optional(
            t.Union([
              t.Object({ type: t.Literal("select_ticket"), ticketId: t.String() }),
              t.Object({ type: t.Literal("transfer") }),
              t.Object({ type: t.Literal("add_info"), ticketId: t.Optional(t.String()) }),
              t.Object({ type: t.Literal("decline") }),
              t.Object({ type: t.Literal("answer"), value: t.String() }),
            ]),
          ),
        }),
      },
    )
    .post("/chat/drafts/:id/confirm", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "employee");
      if (!a) return { error: "forbidden" };
      const conv = await c.convos.getOrCreateActive(a.user.id);
      const events: StreamEvent[] = [];
      await c.agent.confirmDraft(
        { user: { id: a.user.id, name: a.user.name, department: a.user.department, os: a.user.os }, conversation: conv, messagesUsed: await c.auth.messagesUsed(a.session.id) },
        params.id,
        (e) => events.push(e),
      );
      return { events };
    })
    .post("/chat/drafts/:id/cancel", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "employee");
      if (!a) return { error: "forbidden" };
      const conv = await c.convos.getOrCreateActive(a.user.id);
      const events: StreamEvent[] = [];
      await c.agent.cancelDraft(
        { user: { id: a.user.id, name: a.user.name, department: a.user.department, os: a.user.os }, conversation: conv, messagesUsed: await c.auth.messagesUsed(a.session.id) },
        params.id,
        (e) => events.push(e),
      );
      return { events };
    })

    // --- Console do analista ---
    .get(
      "/analyst/conversations",
      async ({ auth, set, query }) => {
        const a = requireUser(auth, set, "analyst");
        if (!a) return { error: "forbidden" };
        return c.analyst.list(a.user.id, (query.filter ?? "all") as ConversationFilter, query.q ?? "");
      },
      { query: t.Object({ filter: t.Optional(t.String()), q: t.Optional(t.String()) }) },
    )
    .get("/analyst/conversations/:id", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "analyst");
      if (!a) return { error: "forbidden" };
      try {
        return await c.analyst.detail(params.id, (m) => c.convos.hydrateDrafts(m));
      } catch (e) {
        return analystError(e, set);
      }
    })
    .post("/analyst/conversations/:id/claim", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "analyst");
      if (!a) return { error: "forbidden" };
      try {
        await c.analyst.claim(params.id, a.user);
        return { ok: true };
      } catch (e) {
        return analystError(e, set);
      }
    })
    .post("/analyst/conversations/:id/release", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "analyst");
      if (!a) return { error: "forbidden" };
      try {
        await c.analyst.release(params.id, a.user);
        return { ok: true };
      } catch (e) {
        return analystError(e, set);
      }
    })
    .post("/analyst/conversations/:id/close", async ({ auth, set, params }) => {
      const a = requireUser(auth, set, "analyst");
      if (!a) return { error: "forbidden" };
      try {
        await c.analyst.close(params.id, a.user);
        return { ok: true };
      } catch (e) {
        return analystError(e, set);
      }
    })
    .post(
      "/analyst/conversations/:id/messages",
      async ({ auth, set, params, body }) => {
        const a = requireUser(auth, set, "analyst");
        if (!a) return { error: "forbidden" };
        const text = body.text.trim().slice(0, 4000);
        if (!text) {
          set.status = 400;
          return { error: "Mensagem vazia" };
        }
        try {
          return { message: await c.analyst.send(params.id, a.user, text) };
        } catch (e) {
          return analystError(e, set);
        }
      },
      { body: t.Object({ text: t.String() }) },
    );
}

function analystError(e: unknown, set: { status?: number | string }) {
  if (e instanceof AnalystError) {
    set.status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 409;
    return { error: e.message };
  }
  throw e;
}

export type App = ReturnType<typeof createApp>;
