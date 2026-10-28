import type { Priority, TicketStatus } from "@nexo/shared";

// Horário comercial do service desk: seg a sex, 8h às 18h (America/Sao_Paulo, UTC-3 fixo).
const OFFSET_H = 3;
const OPEN_H = 8;
const CLOSE_H = 18;
const HOUR = 3_600_000;

/** Desloca para um "relógio de parede" em UTC que representa o horário de Brasília. */
const toLocal = (d: Date) => new Date(d.getTime() - OFFSET_H * HOUR);
const fromLocal = (d: Date) => new Date(d.getTime() + OFFSET_H * HOUR);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

function atHour(d: Date, hour: number): Date {
  const c = new Date(d);
  c.setUTCHours(hour, 0, 0, 0);
  return c;
}

function nextBusinessMorning(d: Date): Date {
  let c = atHour(d, OPEN_H);
  do c = new Date(c.getTime() + 24 * HOUR);
  while (isWeekend(c));
  return c;
}

/** Leva um instante (relógio local) para dentro do expediente. */
function clampToBusiness(d: Date): Date {
  let c = new Date(d);
  if (isWeekend(c)) {
    while (isWeekend(c)) c = new Date(c.getTime() + 24 * HOUR);
    return atHour(c, OPEN_H);
  }
  if (c.getUTCHours() < OPEN_H) return atHour(c, OPEN_H);
  if (c.getUTCHours() >= CLOSE_H) return nextBusinessMorning(c);
  return c;
}

export function addBusinessHours(from: Date, hours: number): Date {
  let cur = clampToBusiness(toLocal(from));
  let remaining = hours * HOUR;
  while (remaining > 0) {
    const end = atHour(cur, CLOSE_H);
    const room = end.getTime() - cur.getTime();
    if (remaining <= room) return fromLocal(new Date(cur.getTime() + remaining));
    remaining -= room;
    cur = nextBusinessMorning(cur);
  }
  return fromLocal(cur);
}

export function addBusinessDays(from: Date, days: number): Date {
  let cur = toLocal(from);
  let left = days;
  while (left > 0) {
    cur = new Date(cur.getTime() + 24 * HOUR);
    if (!isWeekend(cur)) left--;
  }
  return fromLocal(clampToBusiness(cur));
}

export const SLA_LABEL: Record<Priority, string> = {
  critical: "1 hora",
  high: "4 horas úteis",
  medium: "3 dias úteis",
  low: "5 dias úteis",
};

/** Prazo da próxima resposta/atualização a partir de `from`. A prioridade Crítica tem plantão 24h (hora corrida). */
export function dueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case "critical":
      return new Date(from.getTime() + HOUR);
    case "high":
      return addBusinessHours(from, 4);
    case "medium":
      return addBusinessDays(from, 3);
    case "low":
      return addBusinessDays(from, 5);
  }
}

/** Chamados em andamento sujeitos a prazo. Aprovados aguardam entrega e resolvidos/cancelados estão encerrados. */
const SLA_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_analyst"];
export const isSlaStatus = (s: TicketStatus) => SLA_STATUSES.includes(s);
export const isActiveStatus = (s: TicketStatus) => s !== "resolved" && s !== "cancelled";

export function slaFor(ticket: { priority: Priority; status: TicketStatus; updatedAt: string }, at: Date) {
  if (!isSlaStatus(ticket.status)) return { dueAt: null as string | null, overdue: false };
  const due = dueAt(ticket.priority, new Date(ticket.updatedAt));
  return { dueAt: due.toISOString(), overdue: at.getTime() > due.getTime() };
}

/** Como o prazo é descrito ao usuário ("resposta até 13:43", "amanhã às 10:00"). */
export function describeDue(due: Date, at: Date): string {
  const l = toLocal(due);
  const hhmm = `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
  const today = toLocal(at);
  const sameDay = l.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
  if (sameDay) return hhmm;
  const day = `${String(l.getUTCDate()).padStart(2, "0")}/${String(l.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${day} às ${hhmm}`;
}

/** Dias corridos desde uma data, arredondando para baixo. */
export const daysSince = (iso: string, at: Date) => Math.floor((at.getTime() - new Date(iso).getTime()) / (24 * HOUR));
