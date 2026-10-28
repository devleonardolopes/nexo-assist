import { eq } from "drizzle-orm";
import type { SessionUser } from "@nexo/shared";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import { config } from "../config";
import { now } from "../lib/clock";
import { uid } from "../lib/id";

const { users, sessions } = schema;

export const SESSION_COOKIE = "nexo_session";

export const toSessionUser = (u: typeof users.$inferSelect): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  department: u.department,
  level: u.level,
});

export class AuthService {
  constructor(private db: Db) {}

  /**
   * Autentica pelo e-mail corporativo. Conforme o PRD, qualquer senha não vazia é aceita para os
   * funcionários cadastrados; a verificação real ficaria no provedor de identidade da empresa.
   */
  async login(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) return null;
    const [user] = await this.db.select().from(users).where(eq(users.email, normalized));
    if (!user) return null;
    const token = uid("ses_") + uid();
    const at = now();
    await this.db.insert(sessions).values({
      id: token,
      userId: user.id,
      createdAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + config.sessionTtlHours * 3_600_000).toISOString(),
    });
    return { token, user: toSessionUser(user) };
  }

  async resolve(token: string | undefined) {
    if (!token) return null;
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, token));
    if (!row || new Date(row.expiresAt) < now()) return null;
    const [user] = await this.db.select().from(users).where(eq(users.id, row.userId));
    if (!user) return null;
    return { session: row, user };
  }

  async logout(token: string | undefined) {
    if (token) await this.db.delete(sessions).where(eq(sessions.id, token));
  }

  /** Reserva uma mensagem da sessão; devolve false se o limite já foi atingido. */
  async consumeMessage(sessionId: string): Promise<{ ok: boolean; used: number }> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId));
    if (!row) return { ok: false, used: 0 };
    if (row.messageCount >= config.messageLimit) return { ok: false, used: row.messageCount };
    await this.db.update(sessions).set({ messageCount: row.messageCount + 1 }).where(eq(sessions.id, sessionId));
    return { ok: true, used: row.messageCount + 1 };
  }

  async messagesUsed(sessionId: string): Promise<number> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId));
    return row?.messageCount ?? 0;
  }

  async passwordInfo(userId: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId));
    return u?.passwordChangedAt ?? null;
  }
}
