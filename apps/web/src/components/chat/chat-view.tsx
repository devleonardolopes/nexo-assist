"use client";

import type { ChatAction, ChatState, ConversationStatus, MessageDTO, SessionUser, StreamEvent, TraceStep } from "@nexo/shared";
import { ArrowUp, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, streamMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AgentMessage, AnalystMessage, PendingAgentMessage, SystemMessage, UserMessage } from "./messages";

const SUGGESTIONS = ["Qual o status do meu chamado?", "Meu notebook não conecta na VPN. Erro 809.", "Qual o horário do service desk?"];

type Pending = { steps: TraceStep[]; text: string };

export function StatusPill({ status, analyst }: { status: ConversationStatus | null; analyst?: string | null }) {
  const cfg =
    status === "waiting_analyst"
      ? { dot: "bg-warning", text: "text-warning-text", bg: "bg-warning-soft", label: "Aguardando atendente" }
      : status === "with_analyst"
        ? { dot: "bg-blue", text: "text-primary-text", bg: "bg-primary-soft", label: analyst ? `Com ${analyst.split(" ")[0]}` : "Com um analista" }
        : { dot: "bg-success", text: "text-success-text", bg: "bg-success-soft", label: "Assistente online" };
  return (
    <div className={cn("flex items-center gap-[7px] rounded-full px-2.5 py-[5px]", cfg.bg)} role="status">
      <span className={cn("size-[7px] rounded-full", cfg.dot)} />
      <span className={cn("whitespace-nowrap text-[12.5px] font-semibold", cfg.text)}>{cfg.label}</span>
    </div>
  );
}

export function ChatView({ user, onStatus }: { user: SessionUser | null; onStatus: (s: ConversationStatus, analyst: string | null) => void }) {
  const [chat, setChat] = useState<ChatState | null>(null);
  const [carried, setCarried] = useState<MessageDTO[]>([]);
  const [optimistic, setOptimistic] = useState<MessageDTO | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [used, setUsed] = useState(0);
  const [status, setStatus] = useState<ConversationStatus>("agent");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busyDraft, setBusyDraft] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const convId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.chat();
      // Se o analista encerrou e a conversa mudou, mantém o histórico na tela e começa uma nova.
      if (convId.current && s.conversation.id !== convId.current) {
        setCarried((c) => [...c, ...(chatRef.current?.conversation.messages ?? [])]);
      }
      convId.current = s.conversation.id;
      chatRef.current = s;
      setChat(s);
      setUsed(s.messagesUsed);
      setStatus(s.conversation.status);
      onStatus(s.conversation.status, s.conversation.analystName);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Não foi possível carregar a conversa.");
    }
  }, [onStatus]);
  const chatRef = useRef<ChatState | null>(null);

  async function startNew() {
    if (sending) return;
    try {
      const s = await api.newChat();
      convId.current = s.conversation.id;
      chatRef.current = s;
      setCarried([]);
      setOptimistic(null);
      setPending(null);
      setChat(s);
      setUsed(s.messagesUsed);
      setStatus(s.conversation.status);
      onStatus(s.conversation.status, s.conversation.analystName);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Não foi possível iniciar um novo atendimento.");
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  // Com um analista (ou esperando por um), a conversa muda no servidor: acompanha por polling.
  useEffect(() => {
    if (status === "agent" || sending) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [status, sending, load]);

  const messages = useMemo(() => {
    const base = [...carried, ...(chat?.conversation.messages ?? [])];
    return optimistic ? [...base, optimistic] : base;
  }, [carried, chat, optimistic]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending?.steps.length, pending?.text]);

  const limit = chat?.messagesLimit ?? 30;
  const limitReached = used >= limit;
  const inAgentMode = status === "agent";

  const send = useCallback(
    async (text: string, action?: ChatAction) => {
      const body = text.trim();
      if (!body || sending || limitReached) return;
      setSending(true);
      setInput("");
      let stored = false;
      setOptimistic({ id: "tmp", conversationId: "", role: "user", authorName: null, authorTag: null, content: body, createdAt: new Date().toISOString(), steps: [], decision: null, cards: [] });
      if (inAgentMode) setPending({ steps: [], text: "" });
      let failure: string | null = null;
      try {
        await streamMessage({ text: body, action }, (e: StreamEvent) => {
          if (e.type === "user_message") stored = true;
          else if (e.type === "step") setPending((p) => (p ? { ...p, steps: [...p.steps, e.step] } : p));
          else if (e.type === "token") setPending((p) => (p ? { ...p, text: p.text + e.text } : p));
          else if (e.type === "message") setUsed(e.messagesUsed);
          else if (e.type === "conversation") setStatus(e.status);
          else if (e.type === "error") {
            failure = e.message;
            if (e.code === "message_limit") setUsed(limit);
          }
        });
      } catch (err) {
        failure = err instanceof ApiError ? err.message : "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
      }
      setPending(null);
      setOptimistic(null);
      if (failure) {
        toast.error(failure);
        if (!stored) setInput(body); // nada foi enviado: devolve o texto para o campo
      }
      await load();
      setSending(false);
      inputRef.current?.focus();
    },
    [sending, limitReached, inAgentMode, limit, load],
  );

  const applyDraftResult = useCallback(
    async (run: () => Promise<{ events: StreamEvent[] }>, id: string) => {
      setBusyDraft(id);
      try {
        const { events } = await run();
        const err = events.find((e) => e.type === "error");
        if (err && err.type === "error") toast.error(err.message);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir. Tente de novo.");
      }
      await load();
      setBusyDraft(null);
    },
    [load],
  );

  const handlers = useMemo(
    () => ({
      send: (t: string, a?: ChatAction) => void send(t, a),
      confirmDraft: (id: string) => void applyDraftResult(() => api.confirmDraft(id), id),
      cancelDraft: (id: string) => void applyDraftResult(() => api.cancelDraft(id), id),
      editDraft: () => {
        setInput("Quero corrigir: ");
        inputRef.current?.focus();
      },
      busyDraft,
    }),
    [send, applyDraftResult, busyDraft],
  );

  const lastMsg = messages.at(-1);
  const interactiveId = !sending && inAgentMode && lastMsg?.role === "agent" ? lastMsg.id : null;
  const pendingDraft = useMemo(() => {
    if (!interactiveId || !lastMsg) return null;
    const c = lastMsg.cards.find((x) => x.kind === "draft");
    return c && c.kind === "draft" && c.draft.status === "pending" ? c.draft : null;
  }, [interactiveId, lastMsg]);
  const activeQuestion = useMemo(() => {
    if (!interactiveId || !lastMsg) return null;
    const c = lastMsg.cards.find((x) => x.kind === "question");
    return c && c.kind === "question" ? c : null;
  }, [interactiveId, lastMsg]);

  // Atalhos: ⌘/Ctrl+Enter confirma o rascunho; 1–4 escolhem uma opção rápida.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && pendingDraft && !busyDraft) {
        e.preventDefault();
        handlers.confirmDraft(pendingDraft.id);
      } else if (activeQuestion && !input && /^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const opt = activeQuestion.options[Number(e.key) - 1];
        if (opt) {
          e.preventDefault();
          handlers.send(opt.label, { type: "answer", value: opt.value });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDraft, activeQuestion, input, busyDraft, handlers]);

  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Conversa com o Nexo Assist">
        <div className="mx-auto flex min-h-full w-full max-w-[860px] flex-col justify-end gap-5 px-4 pb-1 pt-7 sm:px-8">
          {!chat && !loadError && <LoadingMessages />}
          {loadError && (
            <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-[13.5px] text-danger-text">
              {loadError}{" "}
              <button className="font-semibold underline" onClick={() => void load()}>
                Tentar de novo
              </button>
            </div>
          )}
          {chat && messages.length === 0 && !pending && (
            <div className="flex flex-col gap-4 pb-6">
              <div className="flex max-w-[600px] flex-col gap-2">
                <h2 className="font-display text-[34px] leading-[1.1] tracking-[-0.6px] text-ink">Olá, {firstName}.</h2>
                <p className="text-[15.5px] leading-normal text-ink-3">Descreva o que está acontecendo com suas próprias palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando precisa.</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium text-ink hover:bg-desk"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") return <UserMessage key={m.id} message={m} />;
            if (m.role === "system") return <SystemMessage key={m.id} message={m} />;
            if (m.role === "analyst") return <AnalystMessage key={m.id} message={m} />;
            return <AgentMessage key={m.id} message={m} all={messages} interactive={m.id === interactiveId} handlers={handlers} />;
          })}
          {pending && <PendingAgentMessage steps={pending.steps} text={pending.text} />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[860px] shrink-0 px-4 pb-[18px] pt-2.5 sm:px-8">
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => void startNew()}
            disabled={sending}
            className="flex items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-desk disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Novo atendimento
          </button>
        </div>
        {!inAgentMode && (
          <p className="mb-2 rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-[14px] font-medium text-warning-text">
            {status === "waiting_analyst"
              ? "Seu caso foi encaminhado a um analista. O assistente não responde enquanto isso; suas mensagens ficam registradas para o analista."
              : "Você está conversando com um analista. O assistente está pausado."}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className={cn("flex h-12 items-center gap-2 rounded-xl border border-[#1B24311F] bg-paper pl-4 pr-1.5 shadow-input focus-within:border-cta focus-within:ring-2 focus-within:ring-cta/20", limitReached && "bg-desk")}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={limitReached}
            maxLength={2000}
            placeholder={limitReached ? `Limite de ${limit} mensagens da sessão atingido` : status === "waiting_analyst" ? "Aguardando um analista… você pode deixar mais detalhes" : "Escreva para o Nexo…"}
            aria-label="Mensagem para o Nexo"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || limitReached}
            className="flex h-9 items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white transition-colors enabled:hover:bg-cta-hover disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
        <div className="mt-1.5 flex justify-end">
          <span className={cn("text-[12.5px]", limitReached ? "font-semibold text-danger-text" : used >= limit - 5 ? "text-warning-text" : "text-ink-3")}>
            {used}/{limit} mensagens nesta sessão
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingMessages() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Carregando conversa">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-64 rounded-xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-20 w-full max-w-[600px] rounded-xl" />
      </div>
    </div>
  );
}
