import { z } from "zod";
import { CATEGORIES } from "@nexo/shared";

export const INTENTS = [
  "faq",
  "ticket_status",
  "ticket_create",
  "ticket_update",
  "transfer",
  "out_of_scope",
  "resolved",
  "clarify",
  "greeting",
  "confirm_draft",
  "cancel_draft",
  "edit_draft",
] as const;

const DraftFields = z.object({
  title: z.string().describe("Título curto do chamado (até 80 caracteres)"),
  description: z.string().describe("Descrição completa: sintomas, desde quando, equipamento/sistema operacional, mensagem de erro e impacto"),
  type: z.enum(["INC", "REQ"]).describe("INC: algo parou ou não funciona. REQ: pedido de acesso, equipamento ou software"),
  category: z.enum(CATEGORIES),
  affected: z.enum(["self", "team", "company", "unknown"]).nullable().describe("Quem é afetado; null se o usuário ainda não disse"),
  blocking: z.boolean().nullable().describe("Impede o trabalho de quem é afetado; null se não ficou claro"),
  deadline_today: z.boolean().nullable().describe("Há um compromisso em risco hoje; null se não ficou claro"),
  priority_reason: z.string().describe('Motivo curto da prioridade, ex.: "por causa da reunião às 14h". Vazio se desconhecido'),
});

/** Decisão do agent a cada mensagem. A ordem dos campos importa: a análise vem antes da resposta, que é transmitida por último. */
export const DecisionSchema = z.object({
  understanding: z.string().describe("O que o funcionário quer, em uma frase"),
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1).describe("Segurança sobre a intenção e a ação, de 0 a 1"),
  reasoning: z.string().describe("Por que escolheu essa ação, citando regras, artigos ou chamados usados"),
  kb_article_id: z.string().nullable().describe("Id do artigo da central usado na resposta, se algum"),
  ticket_id: z.string().nullable().describe("Id de um chamado DO FUNCIONÁRIO ao qual a mensagem se refere"),
  duplicate_of: z.string().nullable().describe("Id de chamado do funcionário (aberto ou resolvido há até 7 dias) sobre o MESMO problema"),
  draft: DraftFields.nullable().describe("Preencha para ticket_create, ticket_update ou edit_draft"),
  handoff_summary: z.string().nullable().describe("Resumo do caso para o analista, em intent transfer"),
  reply: z.string().describe("Texto para o funcionário"),
});

export type Decision = z.infer<typeof DecisionSchema>;
export type DraftFieldsT = z.infer<typeof DraftFields>;
