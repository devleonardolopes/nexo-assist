"use client";

import type { AnalystConversation, MessageDTO } from "@nexo/shared";
import { ArrowLeft, Bot, CheckCheck, ChevronDown, Hand, Headset, Loader2, PanelRight, SendHorizontal, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar46 } from "./conversation-list";
import { hhmm } from "@/lib/format";
import { cn } from "@/lib/utils";

const BUBBLE = "shadow-bubble px-3 pb-1.5 pt-2 text-[14.5px] leading-[1.45] text-ink";

function Time({ iso, ticks }: { iso: string; ticks?: boolean }) {
  return (
    <span className="mt-0.5 flex items-center justify-end gap-[3px] text-[11px] text-ink-3">
      {hhmm(iso)}
      {ticks && <CheckCheck className="size-3.5 text-blue" />}
    </span>
  );
}

function Message({ m, prev }: { m: MessageDTO; prev?: MessageDTO }) {
  if (m.role === "system") {
    return (
      <div className="flex items-center gap-3 pb-1 pt-[18px] text-[12px] font-medium text-ink-3">
        <span className="h-px flex-1 bg-[#1B243114]" />
        <span className="flex items-center gap-1.5 text-center">
          <Headset className="size-[13px]" />
          {m.content} · {hhmm(m.createdAt)}
        </span>
        <span className="h-px flex-1 bg-[#1B243114]" />
      </div>
    );
  }
  const sameAsPrev = prev?.role === m.role;
  const gap = sameAsPrev ? "pt-[3px]" : "pt-4";

  if (m.role === "user") {
    return (
      <div className={cn("flex flex-col items-start gap-1", gap)}>
        <div className={cn(BUBBLE, "max-w-[min(520px,88%)] bg-paper", sameAsPrev ? "rounded-xl" : "rounded-[4px_12px_12px_12px]")}>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <Time iso={m.createdAt} />
        </div>
      </div>
    );
  }
  const isAgent = m.role === "agent";
  return (
    <div className={cn("flex flex-col items-end gap-1", gap)}>
      {!sameAsPrev && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[12px] font-semibold text-ink-2">{isAgent ? "Nexo Assist" : m.authorName}</span>
          <span className={cn("rounded-md px-1.5 py-px text-[11px] font-semibold", isAgent ? "bg-primary-soft text-primary-text" : "bg-success-soft text-success-text")}>
            {isAgent ? "IA" : m.authorTag}
          </span>
        </div>
      )}
      <div className={cn(BUBBLE, "max-w-[min(520px,88%)] rounded-[12px_4px_12px_12px]", isAgent ? "bg-client-bubble" : "bg-[#E3F4EA]")}>
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        <Time iso={m.createdAt} ticks />
      </div>
    </div>
  );
}

const REASON = { user_request: "Pedido do funcionário", critical: "Caso crítico", overdue: "Chamado vencido", low_confidence: "Baixa confiança do agent" } as const;

export function ConversationPane({
  data,
  analystName,
  onBack,
  onToggleTickets,
  onClaim,
  onRelease,
  onClose,
  onSend,
  busy,
}: {
  data: AnalystConversation;
  analystName: string;
  onBack: () => void;
  onToggleTickets: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const { conversation: conv, employee } = data;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const firstName = employee.name.split(" ")[0];
  const waiting = conv.status === "waiting_analyst";
  const withMe = conv.status === "with_analyst" && conv.analystName === analystName;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conv.id, conv.messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-thread">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pl-3 pr-3 sm:pl-5 sm:pr-4">
        <button onClick={onBack} aria-label="Voltar para a lista" className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk lg:hidden">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar46 name={employee.name} initials={employee.initials} color={employee.color} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold text-ink">{employee.name}</p>
          <p className="truncate text-[12.5px] text-ink-3">
            {[employee.online ? "online" : "offline", employee.department, conv.relatedTicketId].filter(Boolean).join(" · ")}
          </p>
        </div>
        {waiting && <span className="hidden text-[12.5px] font-semibold text-warning-text sm:block">Aguardando atendente</span>}
        {withMe && (
          <div className="flex items-center gap-2">
            <button
              onClick={onRelease}
              disabled={busy}
              aria-label="Devolver ao agent"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[#1B24311F] pl-2.5 pr-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk disabled:opacity-60 md:pr-3"
            >
              <Undo2 className="size-3.5" />
              <span className="hidden md:inline">Devolver ao agent</span>
            </button>
            <button
              onClick={onClose}
              disabled={busy}
              aria-label="Encerrar atendimento"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-danger-soft pl-2.5 pr-2.5 text-[13.5px] font-semibold text-danger-text hover:bg-danger/20 disabled:opacity-60 md:pr-3"
            >
              <X className="size-3.5" />
              <span className="hidden md:inline">Encerrar atendimento</span>
            </button>
          </div>
        )}
        <button onClick={onToggleTickets} aria-label="Chamados do funcionário" className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk xl:hidden">
          <PanelRight className="size-[18px]" />
        </button>
      </header>

      {conv.transferSummary && conv.status !== "resolved" && (
        <div className="shrink-0 border-b border-rule bg-paper px-4 py-2.5 sm:px-5">
          <button onClick={() => setSummaryOpen((o) => !o)} aria-expanded={summaryOpen} className="flex w-full flex-wrap items-center gap-2 text-left text-[12.5px] font-semibold text-ink-2">
            <Bot className="size-3.5 text-primary-text" />
            Resumo do agent
            {conv.transferReason && <span className="rounded-md bg-desk px-1.5 py-px text-[11.5px] font-medium text-ink-3">{REASON[conv.transferReason]}</span>}
            {conv.agentConfidence !== null && <span className="text-[11.5px] font-medium text-ink-3">confiança {conv.agentConfidence}%</span>}
            <ChevronDown className={cn("ml-auto size-3.5 text-ink-3 transition-transform", summaryOpen && "rotate-180")} />
          </button>
          {summaryOpen && <p className="mt-1.5 text-[13.5px] leading-normal text-ink-2">{conv.transferSummary}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 sm:px-10" role="log" aria-label={`Conversa com ${employee.name}`}>
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-end">
          <div className="flex justify-center pb-1">
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-medium text-ink-3">Hoje</span>
          </div>
          {conv.messages.map((m, i) => (
            <Message key={m.id} m={m} prev={conv.messages[i - 1]} />
          ))}
          <div ref={bottom} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-rule bg-paper px-4 pb-3.5 pt-3 sm:px-5">
        {waiting && (
          <div className="mb-2.5 flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warning-soft">
              <Hand className="size-[17px] text-warning-text" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">{firstName} espera um atendente</p>
              <p className="text-[12.5px] text-ink-3">Agent pausado{conv.transferredAt ? ` · desde ${hhmm(conv.transferredAt)}` : ""}</p>
            </div>
            <button
              onClick={onRelease}
              disabled={busy}
              className="flex h-9 items-center gap-[7px] rounded-lg border border-[#1B24311F] pl-3 pr-3.5 text-[13.5px] font-medium text-ink-2 shadow-input hover:bg-desk disabled:opacity-60"
            >
              <Undo2 className="size-[15px]" />
              Devolver ao agent
            </button>
            <button
              onClick={onClaim}
              disabled={busy}
              className="flex h-9 items-center gap-[7px] rounded-lg bg-cta pl-3.5 pr-4 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />}
              Assumir atendimento
            </button>
          </div>
        )}
        {conv.status === "agent" && (
          <div className="mb-2.5 flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft">
              <Bot className="size-[17px] text-primary-text" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">O agent está atendendo</p>
              <p className="text-[12.5px] text-ink-3">Assuma se quiser conversar diretamente.</p>
            </div>
            <button
              onClick={onClaim}
              disabled={busy}
              className="flex h-9 items-center gap-[7px] rounded-lg bg-cta pl-3.5 pr-4 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-60"
            >
              <Hand className="size-4" />
              Assumir atendimento
            </button>
          </div>
        )}
        {conv.status === "with_analyst" && !withMe && <p className="mb-2.5 text-[13.5px] text-ink-3">Esta conversa está com {conv.analystName ?? "outro analista"}.</p>}
        {conv.status === "resolved" && <p className="mb-2.5 text-[13.5px] text-ink-3">{conv.resolvedBy === "analyst" ? "Atendimento encerrado." : "Conversa resolvida pelo agent."}</p>}

        <form onSubmit={submit} className={cn("flex items-center gap-3", !withMe && "opacity-55")}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!withMe || sending}
            maxLength={4000}
            aria-label="Resposta ao funcionário"
            placeholder={withMe ? `Escreva para ${firstName}…` : "Assuma o atendimento para responder"}
            className="h-11 min-w-0 flex-1 rounded-xl bg-desk px-3.5 text-[14.5px] text-ink outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-cta/30 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!withMe || !text.trim() || sending}
            aria-label="Enviar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cta text-white enabled:hover:bg-cta-hover disabled:opacity-60"
          >
            {sending ? <Loader2 className="size-[18px] animate-spin" /> : <SendHorizontal className="size-[18px]" />}
          </button>
        </form>
      </footer>
    </div>
  );
}
