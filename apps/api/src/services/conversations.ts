import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type {
  ConversationDTO,
  DecisionDetail,
  DraftDTO,
  MessageCard,
  MessageDTO,
  MessageRole,
  TraceStep,
  TransferReason,
} from "@nexo/shared";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import { now } from "../lib/clock";
import { uid } from "../lib/id";
import { dueAt } from "./sla";

const { conversations, messages, drafts, users } = schema;
export type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type DraftRow = typeof drafts.$inferSelect;

export const messageToDto = (m: MessageRow): MessageDTO => ({
  id: m.id,
  conversationId: m.conversationId,
  role: m.role,
  authorName: m.authorName,
  authorTag: m.authorTag,
  content: m.content,
  createdAt: m.createdAt,
  steps: m.steps,
  decision: m.decision ?? null,
  cards: m.cards,
});

export const draftToDto = (d: DraftRow): DraftDTO => ({
  id: d.id,
  kind: d.kind,
  ticketId: d.ticketId,
  title: d.title,
  description: d.description,
  type: d.type,
  category: d.category as DraftDTO["category"],
  priority: d.priority,
  priorityReason: d.priorityReason,
  affected: d.affected,
  dueAt: dueAt(d.priority, new Date(d.createdAt)).toISOString(),
  status: d.status,
});

export interface NewMessage {
  role: MessageRole;
  content: string;
  authorName?: string | null;
  authorTag?: string | null;
  steps?: TraceStep[];
  decision?: DecisionDetail | null;
  cards?: MessageCard[];
}

/** Persistência das conversas, mensagens e rascunhos; o estado da conversa (agent/analista) sobrevive a reinícios. */
export class ConversationStore {
  constructor(private db: Db) {}

  /** Conversa ativa do funcionário (a mais recente não encerrada) ou uma nova. */
  async getOrCreateActive(userId: string): Promise<ConversationRow> {
    const [open] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), ne(conversations.status, "resolved")))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    if (open) return open;
    const stamp = now().toISOString();
    const row: ConversationRow = {
      id: uid("conv_"),
      userId,
      status: "agent",
      analystId: null,
      transferReason: null,
      transferSummary: null,
      transferredAt: null,
      agentConfidence: null,
      relatedTicketId: null,
      resolvedBy: null,
      focusTicketId: null,
      createdAt: stamp,
      updatedAt: stamp,
      analystSeenAt: null,
    };
    await this.db.insert(conversations).values(row);
    return row;
  }

  async get(id: string): Promise<ConversationRow | null> {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id));
    return row ?? null;
  }

  async update(id: string, patch: Partial<ConversationRow>) {
    await this.db
      .update(conversations)
      .set({ ...patch, updatedAt: now().toISOString() })
      .where(eq(conversations.id, id));
  }

  async addMessage(conversationId: string, m: NewMessage): Promise<MessageDTO> {
    const row: MessageRow = {
      id: uid("msg_"),
      conversationId,
      role: m.role,
      authorName: m.authorName ?? null,
      authorTag: m.authorTag ?? null,
      content: m.content,
      createdAt: now().toISOString(),
      steps: m.steps ?? [],
      decision: m.decision ?? null,
      cards: m.cards ?? [],
    };
    await this.db.insert(messages).values(row);
    await this.db.update(conversations).set({ updatedAt: row.createdAt }).where(eq(conversations.id, conversationId));
    return messageToDto(row);
  }

  async updateMessageCards(messageId: string, cards: MessageCard[]) {
    await this.db.update(messages).set({ cards }).where(eq(messages.id, messageId));
  }

  async listMessages(conversationId: string, limit?: number): Promise<MessageDTO[]> {
    if (limit) {
      const rows = await this.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt), desc(sql`rowid`))
        .limit(limit);
      return rows.reverse().map(messageToDto);
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(sql`rowid`));
    return rows.map(messageToDto);
  }

  async toDto(row: ConversationRow): Promise<ConversationDTO> {
    let analystName: string | null = null;
    if (row.analystId) {
      const [a] = await this.db.select().from(users).where(eq(users.id, row.analystId));
      analystName = a?.name ?? null;
    }
    return {
      id: row.id,
      status: row.status,
      analystName,
      transferReason: row.transferReason,
      transferSummary: row.transferSummary,
      transferredAt: row.transferredAt,
      agentConfidence: row.agentConfidence,
      relatedTicketId: row.relatedTicketId,
      resolvedBy: row.resolvedBy,
      messages: await this.listMessages(row.id),
    };
  }

  async transfer(
    conversationId: string,
    o: { reason: TransferReason; summary: string; confidence: number | null; relatedTicketId: string | null },
  ) {
    await this.update(conversationId, {
      status: "waiting_analyst",
      analystId: null,
      transferReason: o.reason,
      transferSummary: o.summary,
      transferredAt: now().toISOString(),
      agentConfidence: o.confidence === null ? null : Math.round(o.confidence * 100),
      relatedTicketId: o.relatedTicketId,
      analystSeenAt: null,
    });
  }

  // --- Rascunhos ---

  async createDraft(d: Omit<DraftRow, "id" | "createdAt" | "status">): Promise<DraftRow> {
    // Um rascunho pendente por conversa: o novo substitui o anterior.
    await this.db
      .update(drafts)
      .set({ status: "cancelled" })
      .where(and(eq(drafts.conversationId, d.conversationId), eq(drafts.status, "pending")));
    const row: DraftRow = { ...d, id: `D-${300 + Math.floor(Math.random() * 700)}`, status: "pending", createdAt: now().toISOString() };
    await this.db.insert(drafts).values(row);
    return row;
  }

  async pendingDraft(conversationId: string): Promise<DraftRow | null> {
    const [row] = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")))
      .orderBy(desc(drafts.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getDraft(id: string): Promise<DraftRow | null> {
    const [row] = await this.db.select().from(drafts).where(eq(drafts.id, id));
    return row ?? null;
  }

  async setDraftStatus(id: string, status: "confirmed" | "cancelled") {
    await this.db.update(drafts).set({ status }).where(eq(drafts.id, id));
  }

  /** Os cartões de rascunho guardam um retrato; aqui voltam com o estado atual (pendente, confirmado, cancelado). */
  async hydrateDrafts(msgs: MessageDTO[]): Promise<MessageDTO[]> {
    const ids = new Set<string>();
    for (const m of msgs) for (const c of m.cards) if (c.kind === "draft") ids.add(c.draft.id);
    if (!ids.size) return msgs;
    const rows = await this.db.select().from(drafts).where(inArray(drafts.id, [...ids]));
    const byId = new Map(rows.map((r) => [r.id, draftToDto(r)]));
    return msgs.map((m) => ({
      ...m,
      cards: m.cards.map((c) => (c.kind === "draft" ? { kind: "draft" as const, draft: byId.get(c.draft.id) ?? c.draft } : c)),
    }));
  }

  async userMessagesSince(conversationId: string, sinceIso: string): Promise<number> {
    const rows = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user"), gt(messages.createdAt, sinceIso)));
    return rows.length;
  }
}
