import { desc, eq } from "drizzle-orm";
import {
  initialsOf,
  type AnalystConversation,
  type ConversationFilter,
  type ConversationListItem,
  type ConversationListResponse,
  type MessageDTO,
} from "@nexo/shared";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import { now } from "../lib/clock";
import { type ConversationRow, type ConversationStore } from "./conversations";
import { addBusinessHours } from "./sla";
import type { TicketService } from "./tickets";

const { conversations, users, sessions, tickets } = schema;

export class AnalystError extends Error {
  constructor(
    public code: "not_found" | "conflict" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

/** Console do analista: lista, assumir, devolver ao agent, encerrar e responder. */
export class AnalystService {
  constructor(
    private db: Db,
    private convos: ConversationStore,
    private tickets: TicketService,
  ) {}

  private lastText(msgs: MessageDTO[]): string {
    const m = [...msgs].reverse().find((x) => x.role !== "system");
    if (!m) return "";
    return m.role === "agent" ? `Nexo: ${m.content}` : m.content;
  }

  async list(analystId: string, filter: ConversationFilter, q: string): Promise<ConversationListResponse> {
    const rows = await this.db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    const userRows = await this.db.select().from(users);
    const byId = new Map(userRows.map((u) => [u.id, u]));
    const ticketRows = await this.db.select({ id: tickets.id, title: tickets.title, requesterId: tickets.requesterId }).from(tickets);
    const needle = q.trim().toLowerCase();
    const at = now();

    const all: { item: ConversationListItem; row: ConversationRow }[] = [];
    for (const row of rows) {
      const u = byId.get(row.userId);
      if (!u) continue;
      const msgs = await this.convos.listMessages(row.id, 8);
      const lastMsg = [...msgs].reverse().find((m) => m.role !== "system");
      const lastText = this.lastText(msgs);

      let statusLabel = "Agent atendendo";
      let tone: ConversationListItem["tone"] = "neutral";
      if (row.status === "waiting_analyst") {
        if (row.transferReason === "low_confidence") {
          statusLabel = `Agent pediu ajuda · confiança ${row.agentConfidence ?? 0}%`;
          tone = "warning";
        } else if (row.relatedTicketId) {
          statusLabel = `Transferida · ${row.relatedTicketId}`;
          tone = "danger";
        } else {
          const base = new Date(row.transferredAt ?? row.updatedAt);
          const due = row.transferReason === "critical" ? new Date(base.getTime() + 3_600_000) : addBusinessHours(base, 2);
          const mins = Math.round((due.getTime() - at.getTime()) / 60_000);
          statusLabel = mins > 0 ? `Transferida · contato em ${mins} min` : "Transferida · contato atrasado";
          tone = "danger";
        }
      } else if (row.status === "with_analyst") {
        const mine = row.analystId === analystId;
        statusLabel = mine ? "Você está atendendo" : `Com ${byId.get(row.analystId ?? "")?.name.split(" ")[0] ?? "outro analista"}`;
        tone = mine ? "primary" : "neutral";
      } else if (row.status === "resolved") {
        statusLabel = row.resolvedBy === "analyst" ? "Encerrada pelo analista" : "Resolvida pelo agent";
      }

      const since = row.analystSeenAt ?? new Date(new Date(row.transferredAt ?? row.updatedAt).getTime() - 3 * 60_000).toISOString();
      const unread =
        row.status === "waiting_analyst" || row.status === "with_analyst" ? await this.convos.userMessagesSince(row.id, since) : 0;

      const item: ConversationListItem = {
        id: row.id,
        userName: u.name,
        initials: initialsOf(u.name),
        color: u.color,
        lastMessage: lastText,
        lastAt: lastMsg?.createdAt ?? row.updatedAt,
        status: row.status,
        statusLabel,
        tone,
        unread,
        needsAttention: row.status === "waiting_analyst",
      };

      if (needle) {
        const hay = [u.name, lastText, ...ticketRows.filter((t) => t.requesterId === u.id).flatMap((t) => [t.id, t.title])].join(" ").toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push({ item, row });
    }

    const matches = (f: ConversationFilter, row: ConversationRow) =>
      f === "all" ? true : f === "for_you" ? row.status === "waiting_analyst" : f === "agent" ? row.status === "agent" : row.status === "with_analyst" && row.analystId === analystId;

    const rank = (i: ConversationListItem) => (i.needsAttention ? 0 : 1);
    const items = all
      .filter((x) => matches(filter, x.row))
      .map((x) => x.item)
      .sort((a, b) => rank(a) - rank(b) || b.lastAt.localeCompare(a.lastAt));
    const counts = Object.fromEntries((["all", "for_you", "agent", "mine"] as const).map((f) => [f, all.filter((x) => matches(f, x.row)).length])) as ConversationListResponse["counts"];
    return { items, counts };
  }

  private async load(id: string): Promise<ConversationRow> {
    const row = await this.convos.get(id);
    if (!row) throw new AnalystError("not_found", "Conversa não encontrada");
    return row;
  }

  async detail(id: string, hydrate: (m: MessageDTO[]) => Promise<MessageDTO[]>): Promise<AnalystConversation> {
    const row = await this.load(id);
    await this.convos.update(id, { analystSeenAt: now().toISOString() });
    const [u] = await this.db.select().from(users).where(eq(users.id, row.userId));
    const sess = await this.db.select().from(sessions).where(eq(sessions.userId, row.userId));
    const online = sess.some((s) => now().getTime() - new Date(s.createdAt).getTime() < 60 * 60_000 && new Date(s.expiresAt) > now());
    const dto = await this.convos.toDto(row);
    dto.messages = await hydrate(dto.messages);
    return {
      conversation: dto,
      employee: { id: u!.id, name: u!.name, initials: initialsOf(u!.name), color: u!.color, department: u!.department, online },
      tickets: await this.tickets.listForAnalyst(row.userId),
    };
  }

  async claim(id: string, analyst: { id: string; name: string; level: string | null }) {
    const row = await this.load(id);
    if (row.status === "resolved") throw new AnalystError("conflict", "A conversa já foi encerrada");
    if (row.status === "with_analyst" && row.analystId !== analyst.id) throw new AnalystError("conflict", "Outro analista já assumiu esta conversa");
    if (row.status === "with_analyst") return;
    await this.convos.update(id, { status: "with_analyst", analystId: analyst.id, analystSeenAt: now().toISOString() });
    await this.convos.addMessage(id, { role: "system", content: `${analyst.name} assumiu · agent pausado` });
    if (row.relatedTicketId) await this.tickets.assign(row.relatedTicketId, analyst.id, "in_progress");
  }

  async release(id: string, analyst: { id: string; name: string }) {
    const row = await this.load(id);
    if (row.status === "resolved") throw new AnalystError("conflict", "A conversa já foi encerrada");
    if (row.status === "with_analyst" && row.analystId !== analyst.id) throw new AnalystError("forbidden", "A conversa está com outro analista");
    await this.convos.update(id, { status: "agent", analystId: null, transferReason: null, transferSummary: null, transferredAt: null, agentConfidence: null });
    await this.convos.addMessage(id, { role: "system", content: `${analyst.name} devolveu a conversa ao agent` });
    await this.convos.addMessage(id, { role: "agent", authorName: "Nexo Assist", authorTag: "IA", content: "Voltei a atender por aqui. Posso ajudar com mais alguma coisa?" });
  }

  async close(id: string, analyst: { id: string; name: string }) {
    const row = await this.load(id);
    if (row.status === "resolved") return;
    if (row.status === "with_analyst" && row.analystId !== analyst.id) throw new AnalystError("forbidden", "A conversa está com outro analista");
    await this.convos.update(id, { status: "resolved", resolvedBy: "analyst" });
    await this.convos.addMessage(id, { role: "system", content: `Atendimento encerrado por ${analyst.name}` });
  }

  async send(id: string, analyst: { id: string; name: string; level: string | null }, text: string): Promise<MessageDTO> {
    const row = await this.load(id);
    if (row.status !== "with_analyst" || row.analystId !== analyst.id) {
      throw new AnalystError("conflict", "Assuma o atendimento para responder");
    }
    return this.convos.addMessage(id, { role: "analyst", authorName: analyst.name, authorTag: `Suporte ${analyst.level ?? "N1"}`, content: text });
  }
}
