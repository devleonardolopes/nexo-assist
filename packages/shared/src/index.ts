// Contratos compartilhados entre web e api. Sem dependências de runtime.

export const TICKET_TYPES = ["INC", "REQ"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = ["Acesso", "Rede e VPN", "Hardware", "Software", "E-mail", "Outros"] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export const TICKET_STATUSES = ["open", "in_progress", "waiting_analyst", "approved", "resolved", "cancelled"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  waiting_analyst: "Aguardando analista",
  approved: "Aprovado",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

export const AFFECTED = ["self", "team", "company", "unknown"] as const;
export type Affected = (typeof AFFECTED)[number];
export const AFFECTED_LABEL: Record<Affected, string> = {
  self: "Somente você",
  team: "Sua equipe",
  company: "Toda a empresa",
  unknown: "Não informado",
};
export const AFFECTED_OPTION_LABEL: Record<Affected, string> = {
  self: "Só eu",
  team: "Minha equipe",
  company: "Toda a empresa",
  unknown: "Não sei",
};

export type Role = "employee" | "analyst";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  level: string | null;
}

export interface TicketDTO {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Prazo da próxima resposta/atualização (null para chamados encerrados). */
  dueAt: string | null;
  overdue: boolean;
  assigneeName: string | null;
}

export interface DraftDTO {
  id: string;
  kind: "create" | "update" | "reopen";
  ticketId: string | null;
  title: string;
  description: string;
  type: TicketType;
  category: Category;
  priority: Priority;
  priorityReason: string;
  affected: Affected;
  dueAt: string | null;
  status: "pending" | "confirmed" | "cancelled";
}

export interface TraceStep {
  tool: string;
  label: string;
  ok: boolean;
  /** Resumo curto do resultado, exibido no detalhe. */
  detail?: string;
}

export type Intent =
  | "faq"
  | "ticket_status"
  | "ticket_create"
  | "ticket_update"
  | "transfer"
  | "out_of_scope"
  | "resolved"
  | "clarify"
  | "greeting"
  | "confirm_draft"
  | "cancel_draft"
  | "edit_draft";

export interface DecisionDetail {
  /** O que o agent entendeu do pedido. */
  understanding: string;
  intent: Intent;
  /** Ação que o agent tomou. */
  action: string;
  /** 0 a 1. */
  confidence: number;
  /** Por que essa ação (e esses parâmetros). */
  reasoning: string;
  /** "model" quando o LLM decidiu; "rule" quando foi uma ação direta da interface ou regra fixa. */
  source: "model" | "rule";
  missing?: string[];
  latencyMs?: number;
  model?: string;
}

export interface QuestionOption {
  label: string;
  value: string;
}

export interface QuickAction {
  label: string;
  action: ChatAction;
}

export type MessageCard =
  | { kind: "ticket_list"; tickets: TicketDTO[] }
  | { kind: "ticket"; ticket: TicketDTO }
  | { kind: "question"; question: string; options: QuestionOption[]; answered?: string }
  | { kind: "draft"; draft: DraftDTO }
  | { kind: "actions"; actions: QuickAction[] }
  | { kind: "articles"; articles: { id: string; title: string }[] };

export type MessageRole = "user" | "agent" | "analyst" | "system";

export interface MessageDTO {
  id: string;
  conversationId: string;
  role: MessageRole;
  authorName: string | null;
  authorTag: string | null;
  content: string;
  createdAt: string;
  steps: TraceStep[];
  decision: DecisionDetail | null;
  cards: MessageCard[];
}

export const CONVERSATION_STATUSES = ["agent", "waiting_analyst", "with_analyst", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type TransferReason = "user_request" | "critical" | "overdue" | "low_confidence";

export interface ConversationDTO {
  id: string;
  status: ConversationStatus;
  analystName: string | null;
  transferReason: TransferReason | null;
  transferSummary: string | null;
  transferredAt: string | null;
  /** Confiança do agent no momento em que pediu ajuda. */
  agentConfidence: number | null;
  relatedTicketId: string | null;
  resolvedBy: "agent" | "analyst" | null;
  messages: MessageDTO[];
}

export interface ChatState {
  conversation: ConversationDTO;
  messagesUsed: number;
  messagesLimit: number;
}

/** Ações disparadas por botões da interface; executadas sem passar pelo LLM. */
export type ChatAction =
  | { type: "select_ticket"; ticketId: string }
  | { type: "transfer" }
  | { type: "add_info"; ticketId?: string }
  | { type: "decline" }
  | { type: "answer"; value: string };

export interface SendMessageBody {
  text: string;
  action?: ChatAction;
}

export type StreamEvent =
  | { type: "user_message"; message: MessageDTO }
  | { type: "step"; step: TraceStep }
  | { type: "token"; text: string }
  | { type: "message"; message: MessageDTO; messagesUsed: number }
  | { type: "conversation"; status: ConversationStatus }
  | { type: "error"; code: string; message: string };

// --- Console do analista ---

export type ConversationFilter = "all" | "for_you" | "agent" | "mine";

export interface ConversationListItem {
  id: string;
  userName: string;
  initials: string;
  color: string;
  lastMessage: string;
  lastAt: string;
  status: ConversationStatus;
  /** Rótulo de status exibido na lista. */
  statusLabel: string;
  tone: "danger" | "warning" | "primary" | "neutral";
  unread: number;
  /** Prioriza visualmente conversas que esperam uma pessoa. */
  needsAttention: boolean;
}

export interface ConversationListResponse {
  items: ConversationListItem[];
  counts: Record<ConversationFilter, number>;
}

export interface AnalystConversation {
  conversation: ConversationDTO;
  employee: { id: string; name: string; initials: string; color: string; department: string | null; online: boolean };
  tickets: TicketDTO[];
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}
