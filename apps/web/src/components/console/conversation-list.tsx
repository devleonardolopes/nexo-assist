"use client";

import type { ConversationFilter, ConversationListItem, ConversationListResponse } from "@nexo/shared";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { listTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const FILTERS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "for_you", label: "Para você" },
  { id: "agent", label: "Com o agent" },
  { id: "mine", label: "Minhas" },
];

const TONE: Record<ConversationListItem["tone"], string> = {
  danger: "text-danger-text",
  warning: "text-warning-text",
  primary: "text-primary-text",
  neutral: "text-ink-3",
};

export function Avatar46({ name, initials, color, size = 46 }: { name?: string; initials: string; color: string; size?: number }) {
  return (
    <span
      aria-label={name}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ width: size, height: size, backgroundColor: `${color}1F`, color, fontSize: size >= 46 ? 15.5 : 14.5 }}
    >
      {initials}
    </span>
  );
}

export function ConversationList({
  data,
  loading,
  error,
  filter,
  onFilter,
  q,
  onQuery,
  selectedId,
  onSelect,
  header,
}: {
  data: ConversationListResponse | null;
  loading: boolean;
  error: string | null;
  filter: ConversationFilter;
  onFilter: (f: ConversationFilter) => void;
  q: string;
  onQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-3 px-4 pb-2.5 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="flex-1 text-xl font-bold tracking-[-0.3px] text-ink">Conversas</h1>
          <span className="rounded-full bg-success-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-success-text">Disponível</span>
          {header}
        </div>
        <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3 focus-within:ring-2 focus-within:ring-cta/25">
          <Search className="size-[15px] text-ink-3" />
          <input
            value={q}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Pesquisar conversa ou chamado"
            aria-label="Pesquisar conversa ou chamado"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filtros">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = data?.counts[f.id];
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => onFilter(f.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] font-medium",
                  active ? "bg-primary-soft text-primary-text" : "bg-desk text-ink-2 hover:bg-rule/60",
                )}
              >
                {f.label}
                {f.id !== "all" && count !== undefined && <span className={cn("font-semibold", active ? "text-primary-text" : "text-ink-3")}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2" role="list">
        {loading && !data && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="my-2 h-[68px] rounded-xl" />)}
        {error && <p className="px-3 py-4 text-[13.5px] text-danger-text">{error}</p>}
        {data && data.items.length === 0 && (
          <p className="px-3 py-10 text-center text-[13.5px] text-ink-3">{q ? "Nenhuma conversa encontrada para essa busca." : "Nenhuma conversa neste filtro."}</p>
        )}
        {data?.items.map((c) => {
          const selected = c.id === selectedId;
          return (
            <button
              key={c.id}
              role="listitem"
              onClick={() => onSelect(c.id)}
              aria-current={selected}
              className={cn("flex w-full items-center gap-3 rounded-xl p-2.5 text-left", selected ? "bg-desk" : "hover:bg-desk/60")}
            >
              <Avatar46 name={c.userName} initials={c.initials} color={c.color} />
              <div className={cn("flex min-w-0 flex-1 flex-col gap-[3px] pb-2.5", !selected && "border-b border-rule")}>
                <div className="flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-[15.5px] text-ink", c.needsAttention ? "font-semibold" : "font-medium")}>{c.userName}</span>
                  <span className={cn("shrink-0 text-[12.5px]", c.unread > 0 ? "font-semibold text-cta" : "text-ink-3")}>{listTime(c.lastAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-3">{c.lastMessage}</span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cta px-1.5 text-[11.5px] font-bold text-white">{c.unread}</span>
                  )}
                </div>
                <span className={cn("flex items-center gap-[5px] text-[11.5px] font-medium", TONE[c.tone])}>
                  {c.status === "resolved" && <span className="size-1.5 rounded-full bg-[#1B243155]" />}
                  {c.statusLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
