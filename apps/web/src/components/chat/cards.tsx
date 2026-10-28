"use client";

import { AFFECTED_LABEL, PRIORITY_LABEL, type DraftDTO, type QuickAction, type QuestionOption, type TicketDTO } from "@nexo/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { agoLabel, dateTime, dueLabel, PRIORITY_DOT, shortDate, STATUS_DOT, STATUS_TEXT, statusLabel } from "@/lib/format";

const CARD = "overflow-hidden rounded-2xl border border-[#1B243117] bg-paper shadow-card";

/** Opções rápidas de uma pergunta do agent (teclas 1–4 também respondem). */
export function QuestionOptions({
  question,
  options,
  disabled,
  selected,
  onPick,
}: {
  question: string;
  options: QuestionOption[];
  disabled: boolean;
  selected?: string;
  onPick: (o: QuestionOption) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14.5px] font-semibold text-ink">{question}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={question}>
        {options.map((o, i) => {
          const active = selected === o.label;
          return (
            <button
              key={o.value}
              disabled={disabled}
              onClick={() => onPick(o)}
              className={cn(
                "flex items-center gap-[7px] rounded-lg border px-3 py-[7px] text-left text-[13.5px] font-medium transition-colors disabled:cursor-default",
                active ? "border-blue bg-primary-soft text-primary-text" : "border-rule bg-paper text-ink enabled:hover:bg-desk",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-md text-[12.5px] font-normal",
                  active ? "bg-cta text-white" : "bg-desk text-ink-3",
                )}
              >
                {i + 1}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QuickActions({ actions, disabled, onPick }: { actions: QuickAction[]; disabled: boolean; onPick: (a: QuickAction) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <button
          key={a.label}
          disabled={disabled}
          onClick={() => onPick(a)}
          className="rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium text-ink transition-colors enabled:hover:bg-desk disabled:cursor-default disabled:opacity-60"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

/** Seleção entre os chamados abertos (Tela 3). */
export function TicketSelector({
  tickets,
  selectedId,
  disabled,
  onPick,
}: {
  tickets: TicketDTO[];
  selectedId?: string;
  disabled: boolean;
  onPick: (t: TicketDTO) => void;
}) {
  return (
    <div className={CARD} role="radiogroup" aria-label="Seus chamados abertos">
      {tickets.map((t, i) => {
        const selected = selectedId === t.id;
        return (
          <button
            key={t.id}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onPick(t)}
            className={cn(
              "flex min-h-[46px] w-full items-center gap-3.5 px-4 py-2 text-left transition-colors disabled:cursor-default sm:gap-3.5",
              i > 0 && "border-t border-rule",
              selected ? "bg-[#0062C40A]" : "enabled:hover:bg-desk",
            )}
          >
            <span className={cn("size-4 shrink-0 rounded-full bg-paper", selected ? "border-[5px] border-cta" : "border-[1.5px] border-[#1B243133]")} />
            <span className="hidden shrink-0 text-[12.5px] font-medium text-ink-3 sm:inline">{t.id}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-ink">{t.title}</span>
              <span className="text-[12px] text-ink-3 sm:hidden">{t.id}</span>
            </span>
            <span className="hidden shrink-0 items-center gap-1.5 text-[12.5px] text-ink-3 md:flex">
              <span className={cn("size-1.5 rounded-full", STATUS_DOT[t.status])} />
              {statusLabel(t.status)}
            </span>
            <span className="w-11 shrink-0 text-right text-[12.5px] text-ink-3">{shortDate(t.updatedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[14.5px] font-medium text-ink">{children}</div>
    </div>
  );
}

/** Card de chamado existente (Tela 3). */
export function TicketCard({ ticket }: { ticket: TicketDTO }) {
  const now = new Date();
  return (
    <article className={CARD}>
      <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-4">
        <div className="flex items-center gap-2 pb-0.5 text-[12.5px] text-ink-3">
          <span className="font-medium">Chamado</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span>{ticket.id}</span>
          <span className="flex-1" />
          <span className={cn("flex items-center gap-1.5 font-medium", STATUS_TEXT[ticket.status])}>
            <span className={cn("size-1.5 rounded-full", STATUS_DOT[ticket.status])} />
            {statusLabel(ticket.status)}
          </span>
        </div>
        <h3 className="text-lg font-semibold leading-tight tracking-[-0.2px] text-ink">{ticket.title}</h3>
        <p className="text-[13.5px] leading-normal text-ink-2">{ticket.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="grid gap-x-6 gap-y-3 border-t border-rule pt-3 sm:grid-cols-2">
          <Field label="Categoria">{ticket.subcategory ? `${ticket.category} › ${ticket.subcategory}` : ticket.category}</Field>
          <Field label="Prioridade">
            <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[ticket.priority])} />
            {PRIORITY_LABEL[ticket.priority]}
          </Field>
          <Field label="Aberto em">{dateTime(ticket.createdAt)}</Field>
          <Field label="Última atualização">
            <span className={cn(ticket.overdue && "text-warning-text")}>{agoLabel(ticket.updatedAt, now)}</span>
            {ticket.overdue && <span className="text-[13.5px] font-normal text-ink-3">· prazo vencido</span>}
            {!ticket.overdue && ticket.dueAt && <span className="text-[13.5px] font-normal text-ink-3">· resposta até {dueLabel(ticket.dueAt, now)}</span>}
          </Field>
        </div>
      </div>
    </article>
  );
}

const DRAFT_KIND = { create: "Novo chamado", update: "Atualização de chamado", reopen: "Reabertura de chamado" } as const;

/** Rascunho para confirmação (Tela 2): o chamado só é criado ou atualizado depois do Confirmar. */
export function DraftCard({
  draft,
  interactive,
  busy,
  onConfirm,
  onEdit,
  onCancel,
}: {
  draft: DraftDTO;
  interactive: boolean;
  busy: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const now = new Date();
  const pending = draft.status === "pending";
  const state =
    draft.status === "pending"
      ? { dot: "bg-warning", text: "text-warning-text", label: "Aguardando confirmação" }
      : draft.status === "confirmed"
        ? { dot: "bg-success", text: "text-success-text", label: draft.kind === "create" ? "Chamado criado" : "Confirmado" }
        : { dot: "bg-[#1B243155]", text: "text-ink-3", label: "Cancelado" };
  return (
    <article className={cn(CARD, !pending && "opacity-90")}>
      <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-0.5 text-[12.5px] text-ink-3">
          <span className="font-medium">{DRAFT_KIND[draft.kind]}</span>
          <span className="size-[3px] rounded-full bg-rule" />
          <span>{draft.ticketId ? draft.ticketId : `Rascunho ${draft.id}`}</span>
          <span className="flex-1" />
          <span className={cn("flex items-center gap-1.5 font-medium", state.text)}>
            <span className={cn("size-1.5 rounded-full", state.dot)} />
            {state.label}
          </span>
        </div>
        <h3 className="text-lg font-semibold leading-tight tracking-[-0.2px] text-ink">{draft.title}</h3>
        <p className="text-[13.5px] leading-normal text-ink-2">{draft.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="grid gap-x-6 gap-y-3 border-t border-rule pt-3 sm:grid-cols-3">
          <Field label="Categoria">{draft.category}</Field>
          <Field label="Prioridade">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[draft.priority])} />
              {PRIORITY_LABEL[draft.priority]}
            </span>
            {draft.dueAt && draft.kind === "create" && (
              <span className="text-[13.5px] font-normal text-ink-3">
                · {draft.priority === "critical" ? "resposta em até 1 h" : `resposta até ${dueLabel(draft.dueAt, now)}`}
              </span>
            )}
          </Field>
          <Field label="Afetados">{AFFECTED_LABEL[draft.affected]}</Field>
        </div>
      </div>
      {pending && interactive && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-desk py-2 pl-2 pr-3.5">
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="h-9 gap-2 rounded-lg bg-cta pl-3.5 pr-2.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Confirmar
            <kbd className="hidden rounded-md bg-white/15 px-[5px] py-px font-sans text-[11.5px] font-normal text-white/80 sm:inline">⌘↵</kbd>
          </Button>
          <Button
            variant="outline"
            onClick={onEdit}
            disabled={busy}
            className="h-9 rounded-lg border-[#1B24311F] bg-paper px-3.5 text-[13.5px] font-medium text-ink shadow-input"
          >
            Editar
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy} className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2">
            Cancelar
          </Button>
        </div>
      )}
    </article>
  );
}
