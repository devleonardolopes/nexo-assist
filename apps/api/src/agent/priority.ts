import type { Affected, Priority, TicketType } from "@nexo/shared";

export interface PriorityInput {
  type: TicketType;
  affected: Affected | null;
  blocking: boolean | null;
  deadlineToday: boolean | null;
}

/**
 * Prioridade = impacto (quantas pessoas) x urgência (impede o trabalho ou há compromisso hoje), conforme o Anexo A.
 * É regra de negócio determinística: o LLM só extrai os fatos, nunca escolhe a prioridade.
 */
export function classifyPriority(i: PriorityInput): { priority: Priority; rule: string } {
  const wide = i.affected === "team" || i.affected === "company";
  const blocking = i.blocking === true;
  const deadline = i.deadlineToday === true;

  if (wide && blocking) return { priority: "critical", rule: "algo parado para uma equipe ou para a empresa" };
  if (blocking) return { priority: "high", rule: "impede uma pessoa de trabalhar" };
  if (deadline) return { priority: "high", rule: "há um compromisso no mesmo dia" };
  if (i.type === "REQ") return { priority: "low", rule: "pedido sem urgência" };
  return { priority: "medium", rule: "atrapalha, mas há alternativa" };
}
