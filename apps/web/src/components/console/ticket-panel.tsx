"use client";

import type { AnalystConversation, TicketDTO } from "@nexo/shared";
import { PRIORITY_LABEL } from "@nexo/shared";
import { ArrowUpRight, ChevronRight, UserRoundCheck, ArrowRightLeft, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PRIORITY_DOT, STATUS_DOT, STATUS_TEXT, dateTime, hhmm, shortDate, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const closed = (t: TicketDTO) => t.status === "resolved" || t.status === "cancelled";

function metaFor(t: TicketDTO) {
  return t.status === "resolved" && t.resolvedAt ? `${t.id} · Resolvido em ${shortDate(t.resolvedAt)}` : `${t.id} · ${statusLabel(t.status)}`;
}

/** Painel "Chamados da <pessoa>": o chamado desta conversa em destaque e o histórico dos demais. */
export function TicketPanel({ data, onClose }: { data: AnalystConversation; onClose?: () => void }) {
  const { conversation: conv, tickets, employee } = data;
  const firstName = employee.name.split(" ")[0];
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const current = useMemo(() => tickets.find((t) => t.id === conv.relatedTicketId) ?? null, [tickets, conv.relatedTicketId]);
  const others = tickets.filter((t) => t.id !== current?.id);
  const visible = showAll ? others : others.slice(0, 4);
  const open = tickets.filter((t) => !closed(t)).length;
  const lastSystem = [...conv.messages].reverse().find((m) => m.role === "system");

  return (
    <div className="flex h-full flex-col bg-paper">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-rule pl-5 pr-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-semibold text-ink">Chamados da {firstName}</p>
          <p className="text-[12.5px] text-ink-3">
            {open} aberto{open === 1 ? "" : "s"} · {tickets.length - open} encerrado{tickets.length - open === 1 ? "" : "s"}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Fechar painel" className="flex size-9 items-center justify-center rounded-full text-ink-2 hover:bg-desk">
            <X className="size-[18px]" />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 pb-5 pt-6">
        {current && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[12.5px] font-semibold text-ink-3">Desta conversa</h2>
            <div className="flex flex-col gap-3.5 rounded-xl bg-desk p-4">
              <div className="flex flex-col gap-1.5">
                <span className={cn("text-[12.5px] font-semibold", conv.status === "with_analyst" ? "text-primary-text" : STATUS_TEXT[current.status])}>
                  {conv.status === "with_analyst" ? "Em atendimento" : statusLabel(current.status)}
                </span>
                <p className="text-[15.5px] font-semibold leading-[1.3] text-ink">{current.title}</p>
                <p className="text-[13.5px] text-ink-3">
                  {current.category} · prioridade {PRIORITY_LABEL[current.priority].toLowerCase()}
                </p>
              </div>
              {lastSystem && (
                <div className="flex items-center gap-2 border-t border-rule pt-3">
                  {conv.status === "with_analyst" ? <UserRoundCheck className="size-[15px] text-ink-3" /> : <ArrowRightLeft className="size-[15px] text-ink-3" />}
                  <span className="flex-1 text-[13.5px] text-ink-2">
                    {conv.status === "with_analyst" ? `Assumido por ${conv.analystName ?? "analista"}` : "Transferido para um analista"}
                  </span>
                  <span className="text-[12.5px] text-ink-3">{hhmm(lastSystem.createdAt)}</span>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-1">
          <h2 className="pb-2 text-[12.5px] font-semibold text-ink-3">{current ? "Outros chamados" : "Chamados"}</h2>
          {visible.length === 0 && <p className="text-[13.5px] text-ink-3">Nenhum outro chamado.</p>}
          {visible.map((t, i) => {
            const isOpen = openId === t.id;
            return (
              <div key={t.id} className={cn(i < visible.length - 1 && "border-b border-rule")}>
                <button onClick={() => setOpenId(isOpen ? null : t.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate text-[14.5px] font-medium text-ink">{t.title}</span>
                    <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                      <span className={cn("size-1.5 rounded-full", STATUS_DOT[t.status])} />
                      {metaFor(t)}
                    </span>
                  </span>
                  <ChevronRight className={cn("size-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen && (
                  <div className="mb-3 flex flex-col gap-2 rounded-lg bg-desk p-3 text-[13px] text-ink-2">
                    <p>{t.description}</p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-3">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[t.priority])} />
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                      <span>{t.category}</span>
                      <span>Aberto em {dateTime(t.createdAt)}</span>
                      {t.assigneeName && <span>Com {t.assigneeName}</span>}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {others.length > 0 && (
        <div className="shrink-0 border-t border-rule p-4">
          <button
            onClick={() => setShowAll((s) => !s)}
            className="flex h-9 w-full items-center justify-center gap-[7px] rounded-lg border border-[#1B24311F] text-[13.5px] font-medium text-ink-2 shadow-input hover:bg-desk"
          >
            {showAll ? "Mostrar menos" : `Ver todos os chamados da ${firstName}`}
            <ArrowUpRight className={cn("size-3.5 text-ink-3", showAll && "rotate-180")} />
          </button>
        </div>
      )}
    </div>
  );
}
