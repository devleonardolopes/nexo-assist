"use client";

import type { ChatAction, MessageCard, MessageDTO, QuestionOption, TicketDTO, TraceStep } from "@nexo/shared";
import { Headset, Info, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DecisionPanel, StepIcon } from "./decision-panel";
import { DraftCard, QuestionOptions, QuickActions, TicketCard, TicketSelector } from "./cards";
import { hhmm } from "@/lib/format";

export interface ChatHandlers {
  send: (text: string, action?: ChatAction) => void;
  confirmDraft: (id: string) => void;
  cancelDraft: (id: string) => void;
  editDraft: () => void;
  busyDraft: string | null;
}

export function UserMessage({ message }: { message: MessageDTO }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(520px,90%)] whitespace-pre-wrap break-words rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] text-white">
        {message.content}
      </div>
    </div>
  );
}

export function SystemMessage({ message }: { message: MessageDTO }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12px] font-medium text-ink-3">
      <span className="h-px flex-1 bg-[#1B243114]" />
      <span className="flex items-center gap-1.5 text-center">
        <Headset className="size-3.5" />
        {message.content} · {hhmm(message.createdAt)}
      </span>
      <span className="h-px flex-1 bg-[#1B243114]" />
    </div>
  );
}

export function AnalystMessage({ message }: { message: MessageDTO }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-ink">{message.authorName}</span>
        {message.authorTag && <span className="rounded-md bg-success-soft px-1.5 py-px text-[11px] font-semibold text-success-text">{message.authorTag}</span>}
        <span className="text-ink-3">{hhmm(message.createdAt)}</span>
      </div>
      <div className="max-w-[600px] whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px] leading-normal text-ink">
        {message.content}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Nexo Assist está digitando" role="status">
      {[0, 1, 2].map((i) => (
        <span key={i} className="nexo-dot size-1.5 rounded-full bg-ink-3" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

/** Card único que troca de texto a cada passo que o agent conclui, enquanto ele ainda trabalha. */
function LiveStep({ steps }: { steps: TraceStep[] }) {
  const last = steps[steps.length - 1];
  return (
    <span key={steps.length} className="nexo-fade flex items-center gap-1.5 rounded-lg border border-rule bg-paper px-2.5 py-1 text-[12.5px] text-ink-2" role="status">
      {last ? <StepIcon step={last} className="size-3.5 shrink-0 text-primary-text" /> : <Loader2 className="size-3.5 shrink-0 animate-spin text-primary-text" />}
      {last ? last.label : "pensando…"}
      {last && <Loader2 className="size-3 animate-spin text-ink-3" />}
    </span>
  );
}

/** Resposta do agent em andamento: passos que chegam em tempo real e, depois, o texto em streaming. */
export function PendingAgentMessage({ steps, text }: { steps: TraceStep[]; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">Nexo Assist</span>
        {!text && <LiveStep steps={steps} />}
      </div>
      <div className="max-w-[600px] whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px] leading-normal text-ink">
        {text || <Dots />}
      </div>
    </div>
  );
}

const lastUserAfter = (all: MessageDTO[], id: string) => {
  const i = all.findIndex((m) => m.id === id);
  return all.slice(i + 1).find((m) => m.role === "user")?.content;
};

export function AgentMessage({
  message,
  all,
  interactive,
  handlers,
}: {
  message: MessageDTO;
  all: MessageDTO[];
  interactive: boolean;
  handlers: ChatHandlers;
}) {
  const [open, setOpen] = useState(false);
  const canExpand = Boolean(message.decision) || message.steps.length > 0;
  const next = lastUserAfter(all, message.id);

  const inline: MessageCard[] = message.cards.filter((c) => c.kind === "question" || c.kind === "actions" || c.kind === "articles");
  const standalone: MessageCard[] = message.cards.filter((c) => c.kind === "ticket_list" || c.kind === "ticket" || c.kind === "draft");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">{message.authorName ?? "Nexo Assist"}</span>
        {canExpand && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Ocultar detalhes" : "Ver detalhes"}
            title={open ? "Ocultar detalhes" : "Ver detalhes"}
            className={cn("flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-desk hover:text-primary-text", open && "bg-primary-soft text-primary-text")}
          >
            <Info className="size-4" />
          </button>
        )}
      </div>
      {open && <DecisionPanel decision={message.decision} steps={message.steps} />}

      {(message.content || inline.length > 0) && (
        <div className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
          {message.content && <p className="whitespace-pre-wrap break-words text-[14.5px] leading-normal text-ink">{message.content}</p>}
          {inline.map((c, i) => {
            if (c.kind === "question") {
              const selected = next ? c.options.find((o) => next.startsWith(o.label))?.label : undefined;
              return (
                <QuestionOptions
                  key={i}
                  question={c.question}
                  options={c.options}
                  selected={selected}
                  disabled={!interactive}
                  onPick={(o: QuestionOption) => handlers.send(o.label, { type: "answer", value: o.value })}
                />
              );
            }
            if (c.kind === "actions") {
              return <QuickActions key={i} actions={c.actions} disabled={!interactive} onPick={(a) => handlers.send(a.label, a.action)} />;
            }
            if (c.kind === "articles") {
              return (
                <p key={i} className="text-[12.5px] text-ink-3">
                  Fonte: {c.articles.map((a) => a.title).join(", ")}
                </p>
              );
            }
            return null;
          })}
        </div>
      )}

      {standalone.map((c, i) => {
        if (c.kind === "ticket_list") {
          const selectedId = next ? c.tickets.find((t) => next.startsWith(t.id))?.id : undefined;
          return (
            <TicketSelector
              key={i}
              tickets={c.tickets}
              selectedId={selectedId}
              disabled={!interactive}
              onPick={(t: TicketDTO) => handlers.send(`${t.id} · ${t.title}`, { type: "select_ticket", ticketId: t.id })}
            />
          );
        }
        if (c.kind === "ticket") return <TicketCard key={i} ticket={c.ticket} />;
        if (c.kind === "draft") {
          return (
            <DraftCard
              key={i}
              draft={c.draft}
              interactive={interactive}
              busy={handlers.busyDraft === c.draft.id}
              onConfirm={() => handlers.confirmDraft(c.draft.id)}
              onCancel={() => handlers.cancelDraft(c.draft.id)}
              onEdit={handlers.editDraft}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

export function RetryNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13.5px] text-danger-text">
      <RefreshCw className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="font-semibold underline-offset-2 hover:underline">
        Fechar
      </button>
    </div>
  );
}
