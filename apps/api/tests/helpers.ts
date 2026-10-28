import type { StreamEvent } from "@nexo/shared";
import type { Decider } from "../src/agent/decider";
import type { Decision } from "../src/agent/schema";
import { createContainer } from "../src/container";
import { createDb } from "../src/db/client";
import { setNow } from "../src/lib/clock";

export const dec = (o: Partial<Decision> = {}): Decision => ({
  understanding: "teste",
  intent: "clarify",
  confidence: 0.9,
  reasoning: "teste",
  kb_article_id: null,
  ticket_id: null,
  duplicate_of: null,
  draft: null,
  handoff_summary: null,
  reply: "",
  ...o,
});

export const draftOf = (o: Partial<NonNullable<Decision["draft"]>> = {}): NonNullable<Decision["draft"]> => ({
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook (Windows 11) mostra o erro 809 ao conectar na VPN.",
  type: "INC",
  category: "Rede e VPN",
  affected: null,
  blocking: null,
  deadline_today: null,
  priority_reason: "",
  ...o,
});

/** Decider roteirizado: devolve as decisões na ordem e guarda os prompts recebidos. */
export class ScriptedDecider implements Decider {
  prompts: string[] = [];
  constructor(private script: Decision[]) {}
  push(...d: Decision[]) {
    this.script.push(...d);
  }
  get calls() {
    return this.prompts.length;
  }
  async decide(prompt: string, onDelta?: (d: string) => void) {
    this.prompts.push(prompt);
    const decision = this.script.shift();
    if (!decision) throw new Error("ScriptedDecider sem decisões");
    if (decision.reply) onDelta?.(decision.reply);
    return { decision, latencyMs: 1, model: "fake" };
  }
}

let n = 0;
export async function setup(script: Decision[] = [], opts: { failureRate?: number; keepSeedTransfers?: boolean } = {}) {
  setNow(null);
  const db = createDb(`file:/tmp/nexo-test-${process.pid}-${n++}.db`);
  const decider = new ScriptedDecider(script);
  const c = createContainer({ db, decider, failureRate: opts.failureRate ?? 0 });
  await c.ready;
  // O seed deixa a conversa da Ana transferida (como no protótipo do console). Os testes do agent
  // precisam dela com o agent; os do console mantêm o estado original.
  if (!opts.keepSeedTransfers) {
    for (const id of ["conv_ana", "conv_carla", "conv_bruno"]) {
      await c.convos.update(id, { status: "agent", transferReason: null, transferSummary: null, transferredAt: null });
    }
  }
  return { c, decider };
}

export async function login(c: Awaited<ReturnType<typeof setup>>["c"], email: string) {
  const r = await c.auth.login(email, "qualquer");
  if (!r) throw new Error("login falhou");
  const resolved = (await c.auth.resolve(r.token))!;
  return { user: resolved.user, session: resolved.session, token: r.token };
}

export async function say(
  c: Awaited<ReturnType<typeof setup>>["c"],
  who: Awaited<ReturnType<typeof login>>,
  text: string,
  action?: Parameters<typeof c.agent.handle>[1]["action"],
) {
  const events: StreamEvent[] = [];
  const conv = await c.convos.getOrCreateActive(who.user.id);
  await c.agent.handle(
    {
      user: { id: who.user.id, name: who.user.name, department: who.user.department, os: who.user.os },
      sessionId: who.session.id,
      conversation: conv,
      consume: () => c.auth.consumeMessage(who.session.id),
    },
    { text, action },
    (e) => events.push(e),
  );
  const message = events.findLast((e) => e.type === "message");
  return { events, message: message?.type === "message" ? message.message : undefined, error: events.find((e) => e.type === "error") };
}
