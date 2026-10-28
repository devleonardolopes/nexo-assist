"use client";

import type { DecisionDetail, TraceStep } from "@nexo/shared";
import {
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  Brain,
  ClipboardList,
  Cog,
  Copy,
  FilePen,
  FilePlus2,
  Gauge,
  Search,
  Ticket,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const confidenceTone = (c: number) =>
  c >= 0.8 ? { label: "alta", bar: "bg-success", text: "text-success-text" } : c >= 0.6 ? { label: "média", bar: "bg-warning", text: "text-warning-text" } : { label: "baixa", bar: "bg-danger", text: "text-danger-text" };

const TOOL_ICON: Record<string, LucideIcon> = {
  list_tickets: ClipboardList,
  get_ticket: Ticket,
  search_kb: BookOpen,
  check_duplicates: Copy,
  classify_priority: Gauge,
  get_sla: Timer,
  build_draft: FilePen,
  create_ticket: FilePlus2,
  update_ticket: FilePen,
  reopen_ticket: FilePen,
  transfer: ArrowRightLeft,
  decide: Brain,
};

/** Ícone da ferramenta usada (ou alerta, se falhou). */
export function StepIcon({ step, className }: { step: TraceStep; className?: string }) {
  const Icon = step.ok ? (TOOL_ICON[step.tool] ?? Search) : AlertCircle;
  return <Icon className={className ?? "size-3.5"} />;
}

/** Chips de ações do agent (acima da resposta), como no protótipo; clicáveis para abrir o detalhe. */
export function StepChips({ steps, onToggle, expanded, canExpand }: { steps: TraceStep[]; onToggle?: () => void; expanded?: boolean; canExpand?: boolean }) {
  return (
    <>
      {steps.map((s, i) => (
        <button
          key={`${s.tool}-${i}`}
          type="button"
          onClick={onToggle}
          disabled={!canExpand}
          aria-expanded={canExpand ? expanded : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border border-rule bg-paper px-2.5 py-1 text-[12.5px] text-ink-2 enabled:hover:border-ink-3 enabled:hover:text-ink",
            !s.ok && "border-danger/30 bg-danger-soft text-danger-text enabled:hover:text-danger-text",
          )}
        >
          <StepIcon step={s} className="size-3.5 shrink-0" />
          {s.label}
        </button>
      ))}
    </>
  );
}

/** Detalhe da decisão: o que entendeu, que ação tomou, com que segurança e por quê. */
export function DecisionPanel({ decision, steps }: { decision: DecisionDetail | null; steps: TraceStep[] }) {
  if (!decision && !steps.length) return null;
  const tone = decision ? confidenceTone(decision.confidence) : null;
  const pct = decision ? Math.round(decision.confidence * 100) : 0;
  return (
    <div className="max-w-[600px] rounded-xl border border-rule bg-desk p-3.5 text-[13px] leading-[1.45] text-ink-2">
      {decision && tone && (
        <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5">
          <dt className="text-ink-3">Entendeu</dt>
          <dd className="text-ink">{decision.understanding}</dd>
          <dt className="text-ink-3">Ação</dt>
          <dd className="text-ink">{decision.action}</dd>
          <dt className="text-ink-3">Segurança</dt>
          <dd className="flex items-center gap-2.5">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-rule" role="img" aria-label={`Confiança ${pct}%`}>
              <span className={cn("block h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} />
            </span>
            <span className={cn("font-semibold", tone.text)}>
              {pct}% · {tone.label}
            </span>
          </dd>
          <dt className="text-ink-3">Por quê</dt>
          <dd className="text-ink">{decision.reasoning}</dd>
          {decision.missing && decision.missing.length > 0 && (
            <>
              <dt className="text-ink-3">Faltava</dt>
              <dd className="text-ink">{decision.missing.map((m) => (m === "affected" ? "quem é afetado" : m === "urgency" ? "urgência" : m)).join(", ")}</dd>
            </>
          )}
        </dl>
      )}

      {steps.length > 0 && (
        <ol className={cn("flex flex-col gap-1.5", decision && "mt-3 border-t border-rule pt-3")}>
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <StepIcon step={s} className={cn("mt-[2px] size-3.5 shrink-0", s.ok ? "text-primary-text" : "text-danger-text")} />
              <span>
                <span className="text-ink">{s.label}</span>
                {s.detail && <span className="text-ink-3"> · {s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {decision && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-rule pt-2.5 text-[12px] text-ink-3">
          {decision.source === "model" ? <Brain className="size-3.5" /> : <Cog className="size-3.5" />}
          {decision.source === "model"
            ? `Decidido pelo modelo${decision.model ? ` (${decision.model}${decision.latencyMs ? `, ${(decision.latencyMs / 1000).toFixed(1).replace(".", ",")} s` : ""})` : ""}`
            : "Regra fixa do sistema, sem consulta ao modelo"}
        </p>
      )}
    </div>
  );
}
