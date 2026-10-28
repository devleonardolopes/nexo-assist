import {
  AFFECTED_OPTION_LABEL,
  PRIORITY_LABEL,
  type Affected,
  type ChatAction,
  type DecisionDetail,
  type DraftDTO,
  type MessageCard,
  type MessageDTO,
  type StreamEvent,
  type TicketDTO,
  type TraceStep,
  type TransferReason,
} from "@nexo/shared";
import { config } from "../config";
import { now } from "../lib/clock";
import type { ConversationRow, ConversationStore } from "../services/conversations";
import { draftToDto } from "../services/conversations";
import type { KnowledgeBase } from "../services/kb";
import { tokenize } from "../services/kb";
import { SLA_LABEL, daysSince, describeDue, dueAt } from "../services/sla";
import {
  REOPEN_WINDOW_DAYS,
  ReopenNotAllowed,
  type TicketService,
  TicketServiceUnavailable,
} from "../services/tickets";
import type { UsageGuard } from "../services/usage";
import { type Decider, LlmNotConfigured, LlmUnavailable } from "./decider";
import { buildUserPrompt } from "./prompt";
import { classifyPriority } from "./priority";
import type { Decision } from "./schema";

export interface AgentUser {
  id: string;
  name: string;
  department: string | null;
  os: string | null;
}

export interface AgentDeps {
  tickets: TicketService;
  kb: KnowledgeBase;
  convos: ConversationStore;
  usage: UsageGuard;
  decider: Decider;
}

export type Emit = (event: StreamEvent) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O sistema de chamados é legado e oscila: repete poucas vezes antes de desistir. */
async function legacy<T>(fn: () => Promise<T>): Promise<T> {
  const waits = [150, 450];
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof TicketServiceUnavailable) || i >= waits.length) throw err;
      await sleep(waits[i]!);
    }
  }
}

const isActive = (t: TicketDTO) => t.status !== "resolved" && t.status !== "cancelled";
const canReopen = (t: TicketDTO, at: Date) =>
  t.status === "resolved" && !!t.resolvedAt && daysSince(t.resolvedAt, at) <= REOPEN_WINDOW_DAYS;

const QUESTION_AFFECTED = "Quem está sendo afetado?";
const QUESTION_URGENCY = "Isso impede você de trabalhar ou há algum compromisso em risco hoje?";
const AFFECTED_OPTIONS = (["self", "team", "company", "unknown"] as Affected[]).map((a) => ({
  label: AFFECTED_OPTION_LABEL[a],
  value: a,
}));
const URGENCY_OPTIONS = [
  "Não consigo trabalhar",
  "Tenho um compromisso hoje",
  "Atrapalha, mas tenho alternativa",
  "Sem urgência",
].map((label) => ({ label, value: label }));

const ticketActions = (t: TicketDTO, at: Date): MessageCard => ({
  kind: "actions",
  actions: [
    { label: "Falar com um analista", action: { type: "transfer" } },
    {
      label: canReopen(t, at) ? "Reabrir chamado" : "Adicionar informação",
      action: { type: "add_info", ticketId: t.id },
    },
    { label: "Não, obrigado", action: { type: "decline" } },
  ],
});

/** Texto de resultado ao apresentar um chamado: tudo calculado em código (prazos não vêm do LLM). */
function describeTicket(t: TicketDTO, at: Date): string {
  if (t.status === "resolved") {
    const d = t.resolvedAt ? daysSince(t.resolvedAt, at) : 0;
    return canReopen(t, at)
      ? `Esse chamado foi resolvido há ${d} dia${d === 1 ? "" : "s"}. Se o problema voltou, posso reabri-lo.`
      : `Esse chamado foi resolvido há ${d} dias. Se o problema voltou, abro um novo chamado para você.`;
  }
  if (t.status === "cancelled") return "Esse chamado foi cancelado.";
  const days = daysSince(t.updatedAt, at);
  const since = days <= 0 ? "hoje" : `há ${days} dia${days === 1 ? "" : "s"}`;
  if (t.overdue) {
    return `Está sem atualização ${since}, acima do prazo de ${SLA_LABEL[t.priority]} para prioridade ${PRIORITY_LABEL[t.priority].toLowerCase()}. Quer que eu chame um analista?`;
  }
  return t.dueAt
    ? `Última atualização ${since}, dentro do prazo. A próxima resposta é esperada até ${describeDue(new Date(t.dueAt), at)}. Quer fazer algo com ele?`
    : `Última atualização ${since}. Quer fazer algo com ele?`;
}

function overlap(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

export class Agent {
  constructor(private deps: AgentDeps) {}

  /** Ponto de entrada: uma mensagem do funcionário (texto ou ação de botão). */
  async handle(
    ctx: { user: AgentUser; sessionId: string; conversation: ConversationRow; consume: () => Promise<{ ok: boolean; used: number }> },
    body: { text: string; action?: ChatAction },
    emit: Emit,
  ): Promise<void> {
    const { convos } = this.deps;
    const conv = ctx.conversation;

    // Com um analista, o agent não responde (fica em silêncio); a mensagem só é registrada.
    if (conv.status === "waiting_analyst" || conv.status === "with_analyst") {
      const msg = await convos.addMessage(conv.id, { role: "user", content: body.text });
      emit({ type: "user_message", message: msg });
      return;
    }

    const used = await ctx.consume();
    if (!used.ok) {
      emit({ type: "error", code: "message_limit", message: `Limite de ${config.messageLimit} mensagens desta sessão atingido. Entre novamente para continuar.` });
      return;
    }
    const userMsg = await convos.addMessage(conv.id, { role: "user", content: body.text });
    emit({ type: "user_message", message: userMsg });

    const run = new Run(this.deps, ctx.user, conv, emit, used.used);
    try {
      if (body.action && body.action.type !== "answer") await run.action(body.action);
      else await run.llm(body.text);
    } catch (err) {
      if (err instanceof LlmNotConfigured) {
        emit({ type: "error", code: "llm_not_configured", message: "O agent não está configurado neste ambiente (DEEPSEEK_API_KEY ausente)." });
        return;
      }
      console.error("[agent] falha inesperada", err);
      emit({ type: "error", code: "internal", message: "Algo deu errado ao processar sua mensagem. Tente novamente." });
    }
  }

  /** Confirmação do rascunho pelo botão (sem LLM). */
  async confirmDraft(
    ctx: { user: AgentUser; conversation: ConversationRow; messagesUsed: number },
    draftId: string,
    emit: Emit,
  ) {
    const run = new Run(this.deps, ctx.user, ctx.conversation, emit, ctx.messagesUsed);
    await run.confirm(draftId);
  }

  async cancelDraft(
    ctx: { user: AgentUser; conversation: ConversationRow; messagesUsed: number },
    draftId: string,
    emit: Emit,
  ) {
    const run = new Run(this.deps, ctx.user, ctx.conversation, emit, ctx.messagesUsed);
    await run.cancel(draftId);
  }
}

/** Execução de um turno: acumula os passos (chips de transparência) e persiste a resposta. */
class Run {
  private steps: TraceStep[] = [];

  constructor(
    private deps: AgentDeps,
    private user: AgentUser,
    private conv: ConversationRow,
    private emit: Emit,
    private used: number,
  ) {}

  private step(tool: string, label: string, ok = true, detail?: string) {
    const s: TraceStep = { tool, label, ok, ...(detail ? { detail } : {}) };
    this.steps.push(s);
    this.emit({ type: "step", step: s });
  }

  private async reply(
    content: string,
    o: { decision?: DecisionDetail; cards?: MessageCard[] } = {},
  ): Promise<MessageDTO> {
    const msg = await this.deps.convos.addMessage(this.conv.id, {
      role: "agent",
      authorName: "Nexo Assist",
      authorTag: "IA",
      content,
      steps: this.steps,
      decision: o.decision ?? null,
      cards: o.cards ?? [],
    });
    this.emit({ type: "message", message: msg, messagesUsed: this.used });
    return msg;
  }

  // ---------------------------------------------------------------- ações diretas da interface

  async action(action: ChatAction) {
    const { tickets, convos } = this.deps;
    const at = now();
    const rule = (understanding: string, act: string, reasoning: string): DecisionDetail => ({
      understanding,
      intent: action.type === "transfer" ? "transfer" : "ticket_status",
      action: act,
      confidence: 1,
      reasoning,
      source: "rule",
    });

    switch (action.type) {
      case "select_ticket": {
        let ticket: TicketDTO | null;
        try {
          ticket = await legacy(() => tickets.getForUser(this.user.id, action.ticketId));
        } catch (err) {
          return this.unavailable(err);
        }
        if (!ticket) {
          this.step("get_ticket", `consultou o ${action.ticketId}`, false, "não encontrado entre os chamados do usuário");
          await this.reply("Não encontrei esse chamado entre os seus. Quer ver a lista dos seus chamados?", {
            decision: rule("O funcionário escolheu um chamado na lista.", "Informar que o chamado não foi encontrado", "O chamado não pertence ao funcionário ou não existe; nada é revelado sobre ele."),
          });
          return;
        }
        await this.presentTicket(ticket, at, rule(`O funcionário escolheu o ${ticket.id} na lista de chamados.`, `Mostrar o ${ticket.id} e avaliar o prazo`, "Ação direta da interface (seleção de chamado): consulta o serviço de chamados e calcula o prazo, sem passar pelo modelo."));
        return;
      }
      case "transfer": {
        const related = this.conv.focusTicketId;
        let reason: TransferReason = "user_request";
        if (related) {
          const t = await legacy(() => tickets.getForUser(this.user.id, related)).catch(() => null);
          if (t?.overdue) reason = "overdue";
        }
        await this.transfer({
          reason,
          summary: await this.fallbackSummary(related, "O funcionário pediu para falar com um analista."),
          confidence: 1,
          related,
          decision: rule("O funcionário pediu para falar com um analista.", "Transferir para um analista com resumo do caso", "Ação direta da interface (botão “Falar com um analista”); a transferência leva o resumo do caso."),
        });
        return;
      }
      case "add_info": {
        const id = action.ticketId ?? this.conv.focusTicketId;
        if (id) await convos.update(this.conv.id, { focusTicketId: id });
        await this.reply(
          id
            ? `Claro. Me conte o que mudou ou o que você descobriu sobre o ${id} e eu atualizo o chamado, sem abrir um novo.`
            : "Claro. Sobre qual chamado é, e o que você quer acrescentar?",
          { decision: rule("O funcionário quer complementar um chamado.", "Pedir a informação a ser acrescentada", "Ação direta da interface; o chamado fica em foco para a próxima mensagem.") },
        );
        return;
      }
      case "decline": {
        await this.reply("Tudo bem! Se precisar de algo, é só me chamar.", {
          decision: rule("O funcionário não quer seguir com a oferta.", "Encerrar a oferta sem executar nada", "Ação direta da interface (“Não, obrigado”)."),
        });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- caminho com LLM

  async llm(text: string) {
    const { tickets, kb, convos, decider, usage } = this.deps;
    const at = now();

    // 1) Contexto barato, vindo de código: chamados do funcionário e artigos da central.
    let myTickets: TicketDTO[] | null = null;
    try {
      myTickets = await legacy(() => tickets.listForUser(this.user.id));
      this.step("list_tickets", "consultou seus chamados", true, `${myTickets.filter(isActive).length} abertos, ${myTickets.length} no total`);
    } catch (err) {
      if (!(err instanceof TicketServiceUnavailable)) throw err;
      this.step("list_tickets", "sistema de chamados indisponível", false, "3 tentativas sem sucesso");
    }

    const recent = await convos.listMessages(this.conv.id, 9);
    const history = recent
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 400) }));
    // O último item é a mensagem atual (já salva); sai do histórico e vai em "nova mensagem".
    if (history.at(-1)?.role === "user") history.pop();
    const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
    const hits = await kb.search(`${text} ${lastUser}`, 2);
    const pending = await convos.pendingDraft(this.conv.id);

    const prompt = buildUserPrompt({
      user: this.user,
      at,
      tickets: myTickets,
      articles: hits.map((h) => h.article),
      focusTicketId: this.conv.focusTicketId,
      pendingDraft: pending
        ? { id: pending.id, kind: pending.kind, title: pending.title, description: pending.description, priority: PRIORITY_LABEL[pending.priority] }
        : null,
      history,
      message: text,
    });

    // 2) Uma chamada ao modelo por mensagem: decide a intenção, extrai os dados e redige a resposta.
    if (!(await usage.tryConsume())) {
      this.emit({ type: "error", code: "daily_cap", message: "O limite diário de uso do assistente foi atingido. Tente novamente amanhã ou fale com o service desk." });
      return;
    }
    let result;
    try {
      result = await decider.decide(prompt, (d) => this.emit({ type: "token", text: d }));
    } catch (err) {
      if (err instanceof LlmNotConfigured) throw err;
      try {
        result = await decider.decide(prompt); // uma nova tentativa, sem streaming
      } catch (err2) {
        if (err2 instanceof LlmNotConfigured) throw err2;
        this.step("decide", "modelo indisponível", false, err2 instanceof Error ? err2.message : undefined);
        await this.transfer({
          reason: "low_confidence",
          summary: await this.fallbackSummary(this.conv.focusTicketId, `Mensagem do funcionário: “${text}”. O agent não conseguiu processar (modelo indisponível).`),
          confidence: 0,
          related: this.conv.focusTicketId,
          decision: { understanding: text, intent: "transfer", action: "Transferir para um analista", confidence: 0, reasoning: "O modelo não respondeu após uma nova tentativa; o caso segue para uma pessoa para não deixar o funcionário sem resposta.", source: "rule" },
        });
        return;
      }
    }
    const { decision, latencyMs, model } = result;
    const detail = (action: string, extra: Partial<DecisionDetail> = {}): DecisionDetail => ({
      understanding: decision.understanding,
      intent: decision.intent,
      action,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
      source: "model",
      latencyMs,
      model,
      ...extra,
    });

    if (hits.length || decision.intent === "faq" || decision.intent === "ticket_create") {
      this.step("search_kb", "buscou na central de ajuda", true, hits.length ? hits.map((h) => h.article.title).join("; ") : "nenhum artigo relevante");
    }

    // 3) Confiança baixa: o agent não decide sozinho, pede um analista.
    const needsConfidence = !["greeting", "confirm_draft", "cancel_draft", "resolved"].includes(decision.intent);
    if (needsConfidence && decision.confidence < config.confidenceThreshold) {
      await this.transfer({
        reason: "low_confidence",
        summary: decision.handoff_summary ?? (await this.fallbackSummary(this.conv.focusTicketId, `${decision.understanding} (${decision.reasoning})`)),
        confidence: decision.confidence,
        related: this.conv.focusTicketId,
        decision: detail("Transferir para um analista por baixa confiança", {
          reasoning: `${decision.reasoning} Confiança ${Math.round(decision.confidence * 100)}%, abaixo do limite de ${Math.round(config.confidenceThreshold * 100)}%.`,
        }),
      });
      return;
    }

    // 4) Executa a intenção.
    switch (decision.intent) {
      case "faq": {
        const art = hits.find((h) => h.article.id === decision.kb_article_id)?.article;
        const content = decision.reply.trim() || art?.body || "Não encontrei um artigo para isso. Quer que eu abra um chamado?";
        await this.reply(content, {
          decision: detail(art ? `Respondeu com o artigo “${art.title}”` : "Respondeu a dúvida"),
          cards: art ? [{ kind: "articles", articles: [{ id: art.id, title: art.title }] }] : [],
        });
        return;
      }
      case "greeting":
      case "out_of_scope":
      case "clarify": {
        const fallback = {
          greeting: "Olá! Sou o Nexo Assist. Descreva o que está acontecendo e eu ajudo.",
          out_of_scope: "Esse assunto não é de TI, então não consigo ajudar por aqui. Procure o time responsável (RH, financeiro ou facilities).",
          clarify: "Pode me explicar com mais detalhes o que está acontecendo?",
        }[decision.intent];
        await this.reply(decision.reply.trim() || fallback, {
          decision: detail({ greeting: "Respondeu ao cumprimento", out_of_scope: "Redirecionou: assunto fora do escopo de TI", clarify: "Pediu mais informação" }[decision.intent]),
        });
        return;
      }
      case "resolved": {
        await convos.update(this.conv.id, { status: "resolved", resolvedBy: "agent" });
        this.emit({ type: "conversation", status: "resolved" });
        await this.reply(decision.reply.trim() || "Que bom que resolveu! Encerrei o atendimento. Se precisar de algo, é só chamar.", {
          decision: detail("Encerrou a conversa como resolvida"),
        });
        return;
      }
      case "ticket_status":
        return this.status(decision, myTickets, detail);
      case "transfer": {
        const related = this.relatedTicket(decision, myTickets);
        const t = myTickets?.find((x) => x.id === related);
        await this.transfer({
          reason: t?.overdue ? "overdue" : "user_request",
          summary: decision.handoff_summary ?? (await this.fallbackSummary(related, decision.understanding)),
          confidence: decision.confidence,
          related,
          decision: detail("Transferir para um analista com resumo do caso"),
        });
        return;
      }
      case "confirm_draft": {
        if (!pending) {
          await this.reply("Não há nada pendente de confirmação. Quer abrir um chamado?", { decision: detail("Informou que não há rascunho pendente") });
          return;
        }
        await this.confirm(pending.id, detail("Confirmou o rascunho pelo texto da conversa"));
        return;
      }
      case "cancel_draft": {
        if (pending) await this.cancel(pending.id, detail("Cancelou o rascunho a pedido do funcionário"));
        else await this.reply("Tudo bem. Não havia nada pendente.", { decision: detail("Sem rascunho pendente") });
        return;
      }
      case "ticket_create":
      case "ticket_update":
      case "edit_draft":
        return this.propose(decision, myTickets, detail);
    }
  }

  private relatedTicket(decision: Decision, mine: TicketDTO[] | null): string | null {
    const id = decision.ticket_id ?? this.conv.focusTicketId;
    return id && mine?.some((t) => t.id === id) ? id : null;
  }

  // ---------------------------------------------------------------- consulta de chamados

  private async status(decision: Decision, mine: TicketDTO[] | null, detail: (a: string) => DecisionDetail) {
    if (!mine) return this.unavailable(new TicketServiceUnavailable());
    const at = now();
    const active = mine.filter(isActive);

    const wanted = decision.ticket_id?.toUpperCase();
    if (wanted) {
      const ticket = mine.find((t) => t.id === wanted);
      if (!ticket) {
        // Privacidade: não diferencia "não existe" de "é de outra pessoa".
        this.step("get_ticket", `consultou o ${wanted}`, false, "não encontrado entre os chamados do funcionário");
        await this.reply("Não encontrei esse chamado entre os seus. Só consigo falar dos chamados que você abriu. Quer ver a lista deles?", {
          decision: detail("Informou que o chamado não foi encontrado entre os do funcionário"),
        });
        return;
      }
      await this.presentTicket(ticket, at, detail(`Mostrar o ${ticket.id} e avaliar o prazo`));
      return;
    }
    if (active.length === 0) {
      await this.reply("Você não tem chamados abertos no momento. Quer abrir um?", { decision: detail("Informou que não há chamados abertos") });
      return;
    }
    if (active.length === 1) {
      await this.presentTicket(active[0]!, at, detail(`Mostrar o único chamado aberto (${active[0]!.id})`));
      return;
    }
    await this.reply(`Você tem ${active.length} chamados abertos. Sobre qual deles quer saber?`, {
      decision: detail("Listar os chamados abertos para o funcionário escolher"),
      cards: [{ kind: "ticket_list", tickets: active }],
    });
  }

  private async presentTicket(ticket: TicketDTO, at: Date, decision: DecisionDetail) {
    this.step("get_ticket", `consultou o ${ticket.id}`);
    this.step(
      "compute_sla",
      "calculou o prazo",
      true,
      ticket.dueAt ? `prazo ${describeDue(new Date(ticket.dueAt), at)}${ticket.overdue ? " (vencido)" : ""}` : "chamado sem prazo ativo",
    );
    await this.deps.convos.update(this.conv.id, { focusTicketId: ticket.id });
    this.conv = { ...this.conv, focusTicketId: ticket.id };
    await this.reply(describeTicket(ticket, at), {
      decision,
      cards: [{ kind: "ticket", ticket }, ticketActions(ticket, at)],
    });
  }

  // ---------------------------------------------------------------- abertura / atualização (rascunho)

  private async propose(decision: Decision, mine: TicketDTO[] | null, detail: (a: string, e?: Partial<DecisionDetail>) => DecisionDetail) {
    const { convos } = this.deps;
    const at = now();
    const d = decision.draft;
    if (!d) {
      await this.reply(decision.reply.trim() || "Pode me contar com mais detalhes o que está acontecendo?", { decision: detail("Pediu mais informação para montar o chamado") });
      return;
    }
    if (!mine) return this.unavailable(new TicketServiceUnavailable());

    // Sem duplicidade: o modelo aponta, e o código valida e ainda procura sozinho.
    const candidateId = decision.duplicate_of ?? (decision.intent === "ticket_update" ? (decision.ticket_id ?? this.conv.focusTicketId) : null);
    let target = candidateId ? mine.find((t) => t.id === candidateId.toUpperCase()) : undefined;
    if (target && !(isActive(target) || canReopen(target, at))) target = undefined;
    let foundBy = "o modelo";
    if (!target && decision.intent !== "ticket_update") {
      target = mine.find((t) => (isActive(t) || canReopen(t, at)) && t.category === d.category && overlap(`${d.title} ${d.description}`, `${t.title} ${t.description}`) >= 0.6);
      foundBy = "a verificação por similaridade";
    }
    this.step("check_duplicates", "verificou duplicidade", true, target ? `${target.id} já cobre o problema (${foundBy})` : "nenhum chamado igual");

    if (target) {
      const kind = isActive(target) ? "update" : "reopen";
      const row = await convos.createDraft({
        conversationId: this.conv.id,
        userId: this.user.id,
        kind,
        ticketId: target.id,
        title: target.title,
        description: d.description,
        type: target.type,
        category: target.category,
        priority: target.priority,
        priorityReason: "",
        affected: target.affected,
      });
      this.step("build_draft", "montou o rascunho", true, kind === "update" ? `atualização do ${target.id}` : `reabertura do ${target.id}`);
      const days = target.resolvedAt ? daysSince(target.resolvedAt, at) : 0;
      const text =
        kind === "update"
          ? `Você já tem o ${target.id} aberto sobre isso, então vou atualizá-lo em vez de abrir outro. Confira:`
          : `O ${target.id} foi resolvido há ${days} dia${days === 1 ? "" : "s"}, então posso reabri-lo com a nova informação. Confira:`;
      await this.reply([decision.reply.trim(), text].filter(Boolean).join(" "), {
        decision: detail(kind === "update" ? `Montar atualização do ${target.id} (sem duplicar)` : `Montar reabertura do ${target.id}`),
        cards: [{ kind: "draft", draft: draftToDto(row) }],
      });
      return;
    }

    // Informações que faltam para abrir (Anexo A): pergunta uma coisa por vez, com opções rápidas.
    const asked = (await convos.listMessages(this.conv.id, 6)).filter((m) => m.cards.some((c) => c.kind === "question")).length;
    const missing: string[] = [];
    if (d.affected === null) missing.push("affected");
    if (d.type === "INC" && d.blocking === null && d.deadline_today === null) missing.push("urgency");

    if (missing.length && asked < 2) {
      const first = missing[0]!;
      const question = first === "affected" ? QUESTION_AFFECTED : QUESTION_URGENCY;
      const options = first === "affected" ? AFFECTED_OPTIONS : URGENCY_OPTIONS;
      await this.reply(decision.reply.trim() || "Preciso de mais um detalhe para abrir o chamado.", {
        decision: detail("Perguntar o que falta para completar o chamado", { missing }),
        cards: [{ kind: "question", question, options }],
      });
      return;
    }

    const affected = d.affected ?? "self";
    const { priority, rule } = classifyPriority({ type: d.type, affected, blocking: d.blocking, deadlineToday: d.deadline_today });
    this.step("classify_priority", "classificou a prioridade", true, `${PRIORITY_LABEL[priority]}: ${rule}`);
    const due = dueAt(priority, at);
    this.step("get_sla", "consultou o SLA", true, `${PRIORITY_LABEL[priority]}: ${SLA_LABEL[priority]}`);
    const row = await convos.createDraft({
      conversationId: this.conv.id,
      userId: this.user.id,
      kind: "create",
      ticketId: null,
      title: d.title.slice(0, 120),
      description: d.description,
      type: d.type,
      category: d.category,
      priority,
      priorityReason: d.priority_reason || rule,
      affected,
    });
    this.step("build_draft", "montou o rascunho", true, `rascunho ${row.id}`);
    const reason = d.priority_reason ? ` ${d.priority_reason.trim()}` : "";
    const dueText = priority === "critical" ? `em até ${SLA_LABEL[priority]}` : `até ${describeDue(due, at)}`;
    const text = `Coloquei prioridade ${PRIORITY_LABEL[priority].toLowerCase()}${reason} — a resposta chega ${dueText}. Confira antes de eu criar:`;
    await this.reply([decision.reply.trim(), text].filter(Boolean).join(" "), {
      decision: detail("Montar o rascunho do chamado para confirmação", { missing: [] }),
      cards: [{ kind: "draft", draft: draftToDto(row) }],
    });
  }

  // ---------------------------------------------------------------- confirmação / cancelamento

  async confirm(draftId: string, decision?: DecisionDetail) {
    const { convos, tickets } = this.deps;
    const at = now();
    const draft = await convos.getDraft(draftId);
    if (!draft || draft.userId !== this.user.id || draft.status !== "pending") {
      this.emit({ type: "error", code: "draft_gone", message: "Esse rascunho não está mais disponível." });
      return;
    }
    const ruleDecision =
      decision ??
      ({
        understanding: "O funcionário confirmou o rascunho.",
        intent: "confirm_draft",
        action: "Executar o rascunho confirmado",
        confidence: 1,
        reasoning: "Ação direta da interface (botão Confirmar): o chamado só é criado ou atualizado depois da confirmação.",
        source: "rule",
      } satisfies DecisionDetail);

    try {
      let ticket: TicketDTO;
      let text: string;
      if (draft.kind === "create") {
        ticket = await legacy(() =>
          tickets.create(this.user.id, { type: draft.type, title: draft.title, description: draft.description, category: draft.category as TicketDTO["category"], priority: draft.priority, affected: draft.affected }),
        );
        this.step("create_ticket", "criou um chamado", true, ticket.id);
        const wait = draft.priority === "critical" ? "em até 1 hora" : `em até ${SLA_LABEL[draft.priority]}`;
        text = `Pronto: abri o chamado ${ticket.id} com prioridade ${PRIORITY_LABEL[draft.priority].toLowerCase()}. Um analista fala com você ${wait}.`;
      } else if (draft.kind === "update") {
        ticket = await legacy(() => tickets.addUpdate(this.user.id, draft.ticketId!, draft.description));
        this.step("update_ticket", "atualizou o chamado", true, ticket.id);
        text = `Atualizei o ${ticket.id} com a nova informação e o prazo foi renovado${ticket.dueAt ? `: resposta até ${describeDue(new Date(ticket.dueAt), at)}` : ""}.`;
      } else {
        ticket = await legacy(() => tickets.reopen(this.user.id, draft.ticketId!, draft.description));
        this.step("reopen_ticket", "reabriu o chamado", true, ticket.id);
        text = `Reabri o ${ticket.id} com a nova informação${ticket.dueAt ? `. Resposta até ${describeDue(new Date(ticket.dueAt), at)}` : ""}.`;
      }
      await convos.setDraftStatus(draft.id, "confirmed");
      await convos.update(this.conv.id, { focusTicketId: ticket.id });
      this.conv = { ...this.conv, focusTicketId: ticket.id };

      // Caso crítico: o chamado já nasce com um analista chamado (regra de transferência).
      if (draft.kind === "create" && draft.priority === "critical") {
        await this.transfer({
          reason: "critical",
          summary: `Chamado ${ticket.id} crítico: ${ticket.title}. ${ticket.description}`,
          confidence: 1,
          related: ticket.id,
          decision: ruleDecision,
          preface: `${text} Como o caso é crítico, já chamei um analista.`,
          cards: [{ kind: "ticket", ticket }],
        });
        return;
      }
      await this.reply(text, { decision: ruleDecision, cards: [{ kind: "ticket", ticket }] });
    } catch (err) {
      if (err instanceof ReopenNotAllowed) {
        await convos.setDraftStatus(draft.id, "cancelled");
        await this.reply(`${err.message}. Posso abrir um novo chamado no lugar, se quiser.`, { decision: ruleDecision });
        return;
      }
      return this.unavailable(err, "Seu rascunho continua salvo: tente confirmar de novo em instantes.");
    }
  }

  async cancel(draftId: string, decision?: DecisionDetail) {
    const { convos } = this.deps;
    const draft = await convos.getDraft(draftId);
    if (!draft || draft.userId !== this.user.id || draft.status !== "pending") {
      this.emit({ type: "error", code: "draft_gone", message: "Esse rascunho não está mais disponível." });
      return;
    }
    await convos.setDraftStatus(draft.id, "cancelled");
    await this.reply("Tudo bem, não criei nada. Se mudar de ideia ou quiser corrigir algo, é só me dizer.", {
      decision: decision ?? { understanding: "O funcionário cancelou o rascunho.", intent: "cancel_draft", action: "Descartar o rascunho", confidence: 1, reasoning: "Ação direta da interface (botão Cancelar): nada é criado sem confirmação.", source: "rule" },
    });
  }

  // ---------------------------------------------------------------- transferência

  private async fallbackSummary(ticketId: string | null, lead: string): Promise<string> {
    const recent = (await this.deps.convos.listMessages(this.conv.id, 6)).filter((m) => m.role === "user").map((m) => `“${m.content.slice(0, 160)}”`);
    return [lead, ticketId ? `Chamado envolvido: ${ticketId}.` : null, recent.length ? `Últimas mensagens do funcionário: ${recent.join("; ")}.` : null].filter(Boolean).join(" ");
  }

  private async transfer(o: {
    reason: TransferReason;
    summary: string;
    confidence: number | null;
    related: string | null;
    decision: DecisionDetail;
    preface?: string;
    cards?: MessageCard[];
  }) {
    const { convos, tickets } = this.deps;
    const level = o.reason === "critical" || o.reason === "overdue" || o.reason === "low_confidence" ? "Suporte N2" : "Suporte N1";
    const wait = o.reason === "critical" ? "1 hora" : "2 h úteis";
    await convos.transfer(this.conv.id, { reason: o.reason, summary: o.summary, confidence: o.confidence, relatedTicketId: o.related });
    if (o.related) await legacy(() => tickets.markTransferred(this.user.id, o.related!)).catch(() => undefined);
    this.step("transfer", "transferiu para um analista", true, `${level} · resumo do caso enviado`);
    const text =
      o.preface ??
      (o.reason === "low_confidence"
        ? `Não tenho segurança para resolver isso sozinho, então chamei um analista (${level}). Passei um resumo do caso para você não precisar repetir tudo. Ele fala com você em até ${wait}.`
        : `Encaminhei para o ${level}. Um analista vai falar com você em até ${wait}.`);
    await this.reply(text, { decision: { ...o.decision, action: o.decision.action }, cards: o.cards });
    await this.deps.convos.addMessage(this.conv.id, { role: "system", content: `Transferida para ${level}` });
    this.emit({ type: "conversation", status: "waiting_analyst" });
  }

  private async unavailable(err: unknown, extra = "") {
    if (!(err instanceof TicketServiceUnavailable)) throw err;
    this.step("tickets", "sistema de chamados indisponível", false, "o sistema legado não respondeu");
    await this.reply(`O sistema de chamados está instável neste momento e não consegui concluir isso. ${extra || "Tente de novo em alguns segundos ou, se for urgente, posso chamar um analista."}`.trim(), {
      decision: {
        understanding: "O serviço de chamados não respondeu.",
        intent: "clarify",
        action: "Avisar sobre a indisponibilidade e oferecer alternativa",
        confidence: 1,
        reasoning: "O sistema legado oscila; após novas tentativas automáticas o agent informa em vez de inventar uma resposta.",
        source: "rule",
      },
      cards: [{ kind: "actions", actions: [{ label: "Falar com um analista", action: { type: "transfer" } }, { label: "Não, obrigado", action: { type: "decline" } }] }],
    });
  }
}

export type { DraftDTO };
