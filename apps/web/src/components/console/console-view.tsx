"use client";

import type { AnalystConversation, ConversationFilter, ConversationListResponse } from "@nexo/shared";
import { LogOut, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NexoMark } from "@/components/nexo-mark";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { ConversationPane } from "./conversation-pane";
import { TicketPanel } from "./ticket-panel";

const POLL_MS = 3000;

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ConsoleView() {
  const me = useMe("analyst");
  const router = useRouter();
  const [filter, setFilter] = useState<ConversationFilter>("for_you");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [list, setList] = useState<ConversationListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalystConversation | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const autoSelected = useRef(false);

  const loadList = useCallback(async () => {
    try {
      setList(await api.analyst.list(filter, dq));
      setListError(null);
    } catch (e) {
      setListError(e instanceof ApiError ? e.message : "Não foi possível carregar as conversas.");
    }
  }, [filter, dq]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api.analyst.detail(id));
      setDetailError(null);
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Não foi possível abrir a conversa.");
    }
  }, []);

  useEffect(() => {
    if (!me) return;
    void loadList();
    const t = setInterval(() => {
      if (!document.hidden) void loadList();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [me, loadList]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
    const t = setInterval(() => {
      if (!document.hidden) void loadDetail(selectedId);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadDetail]);

  // No desktop abre a primeira conversa que precisa de atendente; no celular começa pela lista.
  useEffect(() => {
    if (autoSelected.current || !list?.items.length) return;
    autoSelected.current = true;
    if (window.matchMedia("(min-width: 1024px)").matches) setSelectedId(list.items[0]!.id);
  }, [list]);

  async function act(run: () => Promise<unknown>, done?: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      await run();
      if (done) toast.success(done);
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir a ação.");
      await loadDetail(selectedId);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    router.replace("/login");
  }

  const initials = me ? me.name.split(" ").map((p, i, a) => (i === 0 || i === a.length - 1 ? p[0] : "")).join("") : "";
  const showChat = Boolean(selectedId);

  return (
    <div className="flex h-dvh bg-paper">
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-1.5 border-r border-rule bg-desk py-4 md:flex">
        <div className="flex size-10 items-center justify-center pb-2">
          <NexoMark size={22} />
        </div>
        <button aria-label="Conversas" className="relative flex size-10 items-center justify-center rounded-xl bg-paper shadow-[0_1px_2px_#1B24311A]">
          <MessageCircle className="size-[19px] text-ink" />
          {list && list.counts.for_you > 0 && (
            <span className="absolute left-6 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-desk bg-cta px-1 text-[10px] font-bold text-white">{list.counts.for_you}</span>
          )}
        </button>
        <div className="flex-1" />
        <button onClick={logout} aria-label="Sair" title="Sair" className="flex size-9 items-center justify-center rounded-full text-ink-3 hover:bg-paper">
          <LogOut className="size-4" />
        </button>
        <span title={me?.name} className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
          {initials}
        </span>
      </aside>

      <section className={cn("w-full shrink-0 border-r border-rule lg:block lg:w-[340px] xl:w-[380px]", showChat ? "hidden" : "block")}>
        <ConversationList
          data={list}
          loading={!list && !listError}
          error={listError}
          filter={filter}
          onFilter={setFilter}
          q={q}
          onQuery={setQ}
          selectedId={selectedId}
          onSelect={setSelectedId}
          header={
            <button onClick={logout} aria-label="Sair" className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-desk md:hidden">
              <LogOut className="size-4" />
            </button>
          }
        />
      </section>

      <main className={cn("min-w-0 flex-1", showChat ? "block" : "hidden lg:block")}>
        {!selectedId && (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-thread px-6 text-center">
            <MessageCircle className="size-8 text-ink-3" />
            <p className="text-[15px] font-semibold text-ink">Selecione uma conversa</p>
            <p className="max-w-xs text-[13.5px] text-ink-3">Escolha uma conversa na lista para ver o histórico, o resumo do agent e os chamados do funcionário.</p>
          </div>
        )}
        {selectedId && !detail && !detailError && (
          <div className="flex h-full flex-col gap-3 bg-thread p-6" aria-busy="true">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="h-16 w-1/2 self-end" />
          </div>
        )}
        {selectedId && detailError && !detail && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-thread px-6 text-center">
            <p className="text-[14px] text-danger-text">{detailError}</p>
            <button onClick={() => void loadDetail(selectedId)} className="rounded-lg border border-rule bg-paper px-3 py-1.5 text-[13.5px] font-medium text-ink hover:bg-desk">
              Tentar de novo
            </button>
          </div>
        )}
        {selectedId && detail && detail.conversation.id === selectedId && me && (
          <ConversationPane
            data={detail}
            analystName={me.name}
            busy={busy}
            onBack={() => {
              setSelectedId(null);
              setDetail(null);
            }}
            onToggleTickets={() => setTicketsOpen(true)}
            onClaim={() => void act(() => api.analyst.claim(selectedId), "Você assumiu a conversa. O agent está pausado.")}
            onRelease={() => void act(() => api.analyst.release(selectedId), "Conversa devolvida ao agent.")}
            onClose={() => void act(() => api.analyst.close(selectedId), "Atendimento encerrado.")}
            onSend={async (text) => {
              try {
                await api.analyst.send(selectedId, text);
                await loadDetail(selectedId);
              } catch (e) {
                toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar.");
                throw e;
              }
            }}
          />
        )}
      </main>

      {detail && selectedId && (
        <aside className="hidden w-[340px] shrink-0 border-l border-rule xl:block">
          <TicketPanel data={detail} />
        </aside>
      )}
      <Sheet open={ticketsOpen} onOpenChange={setTicketsOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-[340px] max-w-[92vw] gap-0 p-0">
          <SheetTitle className="sr-only">Chamados do funcionário</SheetTitle>
          {detail && <TicketPanel data={detail} onClose={() => setTicketsOpen(false)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
