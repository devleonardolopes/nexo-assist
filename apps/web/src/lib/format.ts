import { PRIORITY_LABEL, TICKET_STATUS_LABEL, type Priority, type TicketStatus } from "@nexo/shared";

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "16 out" */
export const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]}`;
};

/** "16 out, 14:20" */
export const dateTime = (iso: string) => `${shortDate(iso)}, ${hhmm(iso)}`;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Horário na lista de conversas: hh:mm hoje, "ontem" ou data. */
export const listTime = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  if (sameDay(d, now)) return hhmm(iso);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  return sameDay(d, y) ? "ontem" : shortDate(iso);
};

export const daysAgo = (iso: string, now = new Date()) => Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);

export const agoLabel = (iso: string, now = new Date()) => {
  const d = daysAgo(iso, now);
  if (d >= 1) return `há ${d} dia${d > 1 ? "s" : ""}`;
  const h = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (h >= 1) return `há ${h} h`;
  return "agora há pouco";
};

/** "resposta até 13:43" no mesmo dia, "30/10 às 10:00" nos demais. */
export const dueLabel = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  if (sameDay(d, now)) return hhmm(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${hhmm(iso)}`;
};

export const priorityLabel = (p: Priority) => PRIORITY_LABEL[p];
export const statusLabel = (s: TicketStatus) => TICKET_STATUS_LABEL[s];

/** Cores de ponto por prioridade e por status, conforme o protótipo. */
export const PRIORITY_DOT: Record<Priority, string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-[#1B243166]",
  low: "bg-[#1B243133]",
};

export const STATUS_DOT: Record<TicketStatus, string> = {
  open: "bg-blue",
  in_progress: "bg-blue",
  waiting_analyst: "bg-warning",
  approved: "bg-success",
  resolved: "bg-success",
  cancelled: "bg-[#1B243155]",
};

export const STATUS_TEXT: Record<TicketStatus, string> = {
  open: "text-primary-text",
  in_progress: "text-primary-text",
  waiting_analyst: "text-warning-text",
  approved: "text-success-text",
  resolved: "text-success-text",
  cancelled: "text-ink-3",
};
