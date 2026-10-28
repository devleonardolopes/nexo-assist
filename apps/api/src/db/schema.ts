import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { MessageCard, DecisionDetail, TraceStep } from "@nexo/shared";

const id = () => text("id").primaryKey();
const ts = (name: string) => text(name).notNull();

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
  department: text("department"),
  /** Nível do analista (N1/N2). */
  level: text("level"),
  /** Sistema operacional do equipamento, usado pelo agent ao aplicar artigos. */
  os: text("os"),
  color: text("color").notNull().default("#0062C4"),
  passwordChangedAt: text("password_changed_at"),
});

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: ts("created_at"),
  expiresAt: ts("expires_at"),
  /** Mensagens enviadas ao agent nesta sessão (limite de 30). */
  messageCount: integer("message_count").notNull().default(0),
});

export const articles = sqliteTable("articles", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
});

export const tickets = sqliteTable(
  "tickets",
  {
    id: id(),
    type: text("type", { enum: ["INC", "REQ"] }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).notNull(),
    status: text("status", {
      enum: ["open", "in_progress", "waiting_analyst", "approved", "resolved", "cancelled"],
    }).notNull(),
    affected: text("affected", { enum: ["self", "team", "company", "unknown"] }).notNull(),
    requesterId: text("requester_id").notNull().references(() => users.id),
    assigneeId: text("assignee_id").references(() => users.id),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("tickets_requester_idx").on(t.requesterId)],
);

export const ticketUpdates = sqliteTable("ticket_updates", {
  id: id(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  authorId: text("author_id").references(() => users.id),
  text: text("text").notNull(),
  createdAt: ts("created_at"),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id),
    status: text("status", { enum: ["agent", "waiting_analyst", "with_analyst", "resolved"] })
      .notNull()
      .default("agent"),
    analystId: text("analyst_id").references(() => users.id),
    transferReason: text("transfer_reason", {
      enum: ["user_request", "critical", "overdue", "low_confidence"],
    }),
    transferSummary: text("transfer_summary"),
    transferredAt: text("transferred_at"),
    agentConfidence: integer("agent_confidence"),
    relatedTicketId: text("related_ticket_id"),
    resolvedBy: text("resolved_by", { enum: ["agent", "analyst"] }),
    /** Ticket que o usuário está discutindo (contexto curto entre turnos). */
    focusTicketId: text("focus_ticket_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
    /** Última vez que o analista abriu a conversa (para contagem de não lidas). */
    analystSeenAt: text("analyst_seen_at"),
  },
  (t) => [index("conversations_user_idx").on(t.userId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id),
    role: text("role", { enum: ["user", "agent", "analyst", "system"] }).notNull(),
    authorName: text("author_name"),
    authorTag: text("author_tag"),
    content: text("content").notNull(),
    createdAt: ts("created_at"),
    steps: text("steps", { mode: "json" }).$type<TraceStep[]>().notNull().$defaultFn(() => []),
    decision: text("decision", { mode: "json" }).$type<DecisionDetail | null>(),
    cards: text("cards", { mode: "json" }).$type<MessageCard[]>().notNull().$defaultFn(() => []),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const drafts = sqliteTable("drafts", {
  id: id(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["create", "update", "reopen"] }).notNull(),
  ticketId: text("ticket_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type", { enum: ["INC", "REQ"] }).notNull(),
  category: text("category").notNull(),
  priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).notNull(),
  priorityReason: text("priority_reason").notNull(),
  affected: text("affected", { enum: ["self", "team", "company", "unknown"] }).notNull(),
  status: text("status", { enum: ["pending", "confirmed", "cancelled"] }).notNull().default("pending"),
  createdAt: ts("created_at"),
});

/** Contadores de uso do LLM por dia, para o teto diário de custo. */
export const usage = sqliteTable("usage", {
  day: text("day").primaryKey(),
  llmCalls: integer("llm_calls").notNull().default(0),
});
