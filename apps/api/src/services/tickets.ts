import { and, desc, eq, inArray } from "drizzle-orm";
import type { Affected, Category, Priority, TicketDTO, TicketType } from "@nexo/shared";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import { now } from "../lib/clock";
import { uid } from "../lib/id";
import { daysSince, isActiveStatus, slaFor } from "./sla";

const { tickets, ticketUpdates, users } = schema;
type TicketRow = typeof tickets.$inferSelect;

export const REOPEN_WINDOW_DAYS = 7;

/** O sistema legado de chamados ficou indisponível. O agent trata com nova tentativa e degrada com elegância. */
export class TicketServiceUnavailable extends Error {
  constructor() {
    super("Sistema de chamados indisponível");
    this.name = "TicketServiceUnavailable";
  }
}
export class ReopenNotAllowed extends Error {
  constructor() {
    super(`Chamados resolvidos há mais de ${REOPEN_WINDOW_DAYS} dias não podem ser reabertos`);
    this.name = "ReopenNotAllowed";
  }
}

export interface CreateTicketInput {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  affected: Affected;
}

/**
 * Serviço de chamados simulado (sistema legado). Fica separado do agent: o agent só conversa
 * com esta interface. Toda consulta exige o `requesterId`, então o chamado de um funcionário
 * nunca é devolvido a outro (privacidade garantida na camada de dados, não só no prompt).
 */
export class TicketService {
  constructor(
    private db: Db,
    private opts: { failureRate?: number } = {},
  ) {}

  private flaky() {
    if (this.opts.failureRate && Math.random() < this.opts.failureRate) throw new TicketServiceUnavailable();
  }

  private async toDto(rows: TicketRow[]): Promise<TicketDTO[]> {
    const assigneeIds = [...new Set(rows.map((r) => r.assigneeId).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (assigneeIds.length) {
      for (const u of await this.db.select().from(users).where(inArray(users.id, assigneeIds))) names.set(u.id, u.name);
    }
    const at = now();
    return rows.map((r) => {
      const base = {
        priority: r.priority,
        status: r.status,
        updatedAt: r.updatedAt,
      };
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        description: r.description,
        category: r.category as Category,
        subcategory: r.subcategory,
        priority: r.priority,
        status: r.status,
        affected: r.affected,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        resolvedAt: r.resolvedAt,
        assigneeName: r.assigneeId ? (names.get(r.assigneeId) ?? null) : null,
        ...slaFor(base, at),
      };
    });
  }

  /** Chamados do funcionário, do mais recente para o mais antigo. */
  async listForUser(requesterId: string, opts: { onlyActive?: boolean } = {}): Promise<TicketDTO[]> {
    this.flaky();
    const rows = await this.db
      .select()
      .from(tickets)
      .where(eq(tickets.requesterId, requesterId))
      .orderBy(desc(tickets.updatedAt));
    const dtos = await this.toDto(rows);
    return opts.onlyActive ? dtos.filter((t) => isActiveStatus(t.status)) : dtos;
  }

  /** Devolve `null` tanto para chamado inexistente quanto para chamado de outra pessoa (sem vazar a diferença). */
  async getForUser(requesterId: string, ticketId: string): Promise<TicketDTO | null> {
    this.flaky();
    const [row] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId.toUpperCase()), eq(tickets.requesterId, requesterId)));
    if (!row) return null;
    return (await this.toDto([row]))[0] ?? null;
  }

  async create(requesterId: string, input: CreateTicketInput): Promise<TicketDTO> {
    this.flaky();
    const stamp = now().toISOString();
    const id = await this.nextId(input.type);
    await this.db.insert(tickets).values({
      id,
      type: input.type,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      affected: input.affected,
      status: "open",
      requesterId,
      createdAt: stamp,
      updatedAt: stamp,
    });
    return (await this.getForUser(requesterId, id))!;
  }

  /** Acrescenta informação a um chamado aberto (não duplica) e renova o prazo. */
  async addUpdate(requesterId: string, ticketId: string, note: string, priority?: Priority): Promise<TicketDTO> {
    this.flaky();
    const ticket = await this.getForUser(requesterId, ticketId);
    if (!ticket) throw new Error("Chamado não encontrado");
    const stamp = now().toISOString();
    await this.db.insert(ticketUpdates).values({ id: uid("upd_"), ticketId: ticket.id, authorId: requesterId, text: note, createdAt: stamp });
    await this.db
      .update(tickets)
      .set({ updatedAt: stamp, ...(priority ? { priority } : {}) })
      .where(eq(tickets.id, ticket.id));
    return (await this.getForUser(requesterId, ticket.id))!;
  }

  /** Reabre um chamado resolvido há até 7 dias. */
  async reopen(requesterId: string, ticketId: string, note: string): Promise<TicketDTO> {
    this.flaky();
    const ticket = await this.getForUser(requesterId, ticketId);
    if (!ticket) throw new Error("Chamado não encontrado");
    if (ticket.status !== "resolved" || !ticket.resolvedAt || daysSince(ticket.resolvedAt, now()) > REOPEN_WINDOW_DAYS) {
      throw new ReopenNotAllowed();
    }
    const stamp = now().toISOString();
    await this.db.insert(ticketUpdates).values({ id: uid("upd_"), ticketId: ticket.id, authorId: requesterId, text: `Reaberto: ${note}`, createdAt: stamp });
    await this.db.update(tickets).set({ status: "open", resolvedAt: null, updatedAt: stamp }).where(eq(tickets.id, ticket.id));
    return (await this.getForUser(requesterId, ticket.id))!;
  }

  /** Marca o chamado como aguardando analista (transferência). */
  async markTransferred(requesterId: string, ticketId: string): Promise<void> {
    this.flaky();
    const ticket = await this.getForUser(requesterId, ticketId);
    if (!ticket || !isActiveStatus(ticket.status)) return;
    await this.db
      .update(tickets)
      .set({ status: "waiting_analyst" })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.requesterId, requesterId)));
  }

  /** Visão do analista sobre os chamados de um funcionário (só usada por rotas protegidas pelo papel de analista). */
  async listForAnalyst(employeeId: string): Promise<TicketDTO[]> {
    const rows = await this.db.select().from(tickets).where(eq(tickets.requesterId, employeeId)).orderBy(desc(tickets.updatedAt));
    return this.toDto(rows);
  }

  async assign(ticketId: string, analystId: string | null, status?: "in_progress" | "waiting_analyst") {
    await this.db
      .update(tickets)
      .set({ assigneeId: analystId, ...(status ? { status } : {}), updatedAt: now().toISOString() })
      .where(eq(tickets.id, ticketId));
  }

  private async nextId(type: TicketType): Promise<string> {
    const rows = await this.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.type, type));
    const max = rows.reduce((m, r) => Math.max(m, Number(r.id.split("-")[1] ?? 0)), type === "INC" ? 20500 : 10400);
    return `${type}-${max + 1}`;
  }
}
