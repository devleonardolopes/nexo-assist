import { CATEGORIES, PRIORITY_LABEL, TICKET_STATUS_LABEL } from "@nexo/shared";
import type { TicketDTO } from "@nexo/shared";
import type { Article } from "../services/kb";
import { daysSince } from "../services/sla";

/** Parte estática do prompt (primeira no contexto, para aproveitar o cache de prefixo do provedor). */
export const SYSTEM_PROMPT = `Você é o Nexo Assist, o agent do service desk de TI da Nexo (cerca de 2.000 funcionários). Responda sempre em português do Brasil, de forma curta, clara e cordial. Nunca invente chamados, artigos, prazos ou dados.

Cada mensagem recebe um JSON de decisão. Você NÃO executa ações: você decide a intenção e extrai os dados; o sistema executa, calcula a prioridade e os prazos.

## Regras do service desk
- Tipos: INC (incidente: algo parou ou não funciona) e REQ (requisição: pedido de acesso, equipamento ou software).
- Categorias: ${CATEGORIES.join(", ")}.
- Abertura: todo chamado tem título, descrição, tipo, categoria, prioridade e quem é afetado. O sistema mostra um rascunho e só cria depois da confirmação do funcionário.
- Sem duplicidade: se já existe chamado ABERTO sobre o mesmo problema, atualize-o (duplicate_of), não abra outro. Chamados resolvidos há até 7 dias podem ser reabertos (duplicate_of com o id dele).
- Transferência para analista: quando o funcionário pede, em casos críticos (algo parado para uma equipe ou a empresa), em chamados vencidos que o funcionário queira escalar, ou quando você não tem segurança.
- Privacidade: só fale de chamados do próprio funcionário (lista abaixo). Se pedirem dados de outra pessoa ou de um chamado que não está na lista, recuse com educação e não confirme se ele existe.
- Escopo: apenas TI. RH, financeiro e facilities: redirecione, intent out_of_scope.
- Prioridade (o sistema calcula; você extrai os fatos): impacto = quantas pessoas são afetadas (affected); urgência = impede o trabalho (blocking) ou há compromisso no mesmo dia (deadline_today).

## Como decidir (intent)
- faq: dúvida que a central de ajuda responde. Use SOMENTE os artigos fornecidos, respeitando as condições (ex.: sistema operacional). Se o artigo não se aplica ao caso, NÃO use faq: use ticket_create e explique em uma frase.
- ticket_status: quer saber de chamados. Se der para saber qual, ticket_id; se houver vários e não der, deixe ticket_id null. reply vazio.
- ticket_create: problema ou pedido que precisa de chamado e não foi resolvido pela central. Preencha draft com o que souber; use null no que ainda não foi dito (affected, blocking, deadline_today). Não pergunte nada no reply: o sistema pergunta o que falta. reply: no máximo uma frase de contexto (por que o artigo não resolve / por que abrir chamado). Se a mensagem apenas responde uma pergunta anterior, reply vazio e mantenha o draft completo, combinando o histórico.
- ticket_update: novas informações para um chamado existente (ticket_id) ou problema duplicado (duplicate_of). Preencha draft.description com apenas a informação nova.
- edit_draft: o funcionário quer corrigir o rascunho pendente; devolva draft completo já corrigido.
- confirm_draft / cancel_draft: o funcionário confirma ou desiste, por escrito, do rascunho pendente.
- transfer: pediu um analista, caso crítico ou você não tem segurança. handoff_summary com o resumo do caso (o que aconteceu, o que já foi tentado, chamados envolvidos).
- resolved: o funcionário diz que o problema foi resolvido / agradece encerrando.
- greeting: cumprimento ou conversa leve. out_of_scope: fora de TI. clarify: não deu para entender; faça UMA pergunta objetiva no reply.

## Confiança
Seja honesto: abaixo de 0,6 significa que você não tem segurança. Pedidos ambíguos, sintomas que nenhum artigo cobre ou conflito entre regras devem ter confiança baixa.

## Saída
Responda APENAS com um objeto JSON com exatamente estes campos, nesta ordem:
understanding (string), intent, confidence (0 a 1), reasoning (string), kb_article_id (string|null), ticket_id (string|null), duplicate_of (string|null), draft (objeto|null), handoff_summary (string|null), reply (string).
draft, quando existir: title, description, type ("INC"|"REQ"), category, affected ("self"|"team"|"company"|"unknown"|null), blocking (bool|null), deadline_today (bool|null), priority_reason (string).`;

const relDays = (iso: string, at: Date) => {
  const d = daysSince(iso, at);
  return d <= 0 ? "hoje" : `há ${d} dia${d > 1 ? "s" : ""}`;
};

export function ticketLine(t: TicketDTO, at: Date): string {
  const parts = [
    `${t.id} | ${t.title} | ${t.category} | prioridade ${PRIORITY_LABEL[t.priority]} | ${TICKET_STATUS_LABEL[t.status]}`,
    `atualizado ${relDays(t.updatedAt, at)}`,
  ];
  if (t.overdue) parts.push("VENCIDO");
  if (t.resolvedAt) parts.push(`resolvido ${relDays(t.resolvedAt, at)}`);
  return parts.join(" | ");
}

export interface PromptContext {
  user: { name: string; department: string | null; os: string | null };
  at: Date;
  tickets: TicketDTO[] | null;
  articles: Article[];
  focusTicketId: string | null;
  pendingDraft: { id: string; kind: string; title: string; description: string; priority: string } | null;
  history: { role: string; content: string }[];
  message: string;
}

/** Parte dinâmica: dados do funcionário, chamados dele, artigos recuperados e o histórico recente. */
export function buildUserPrompt(c: PromptContext): string {
  const lines: string[] = [];
  lines.push(`Agora: ${c.at.toISOString()}`);
  lines.push(`Funcionário: ${c.user.name}${c.user.department ? ` (${c.user.department})` : ""}${c.user.os ? `, equipamento: ${c.user.os}` : ""}`);
  lines.push("");
  lines.push("Chamados do funcionário (único dado de chamados que você pode citar):");
  if (c.tickets === null) lines.push("(sistema de chamados indisponível agora)");
  else if (!c.tickets.length) lines.push("(nenhum)");
  else for (const t of c.tickets) lines.push(`- ${ticketLine(t, c.at)}`);
  if (c.focusTicketId) lines.push(`Chamado em foco na conversa: ${c.focusTicketId}`);
  lines.push("");
  lines.push("Artigos da central de ajuda recuperados para esta mensagem:");
  if (!c.articles.length) lines.push("(nenhum relevante)");
  else for (const a of c.articles) lines.push(`- [${a.id}] ${a.title}: ${a.body}`);
  if (c.pendingDraft) {
    lines.push("");
    lines.push(`Rascunho pendente de confirmação ${c.pendingDraft.id} (${c.pendingDraft.kind}): "${c.pendingDraft.title}" — ${c.pendingDraft.description} (prioridade ${c.pendingDraft.priority})`);
  }
  lines.push("");
  lines.push("Conversa recente:");
  for (const m of c.history) lines.push(`${m.role === "user" ? "Funcionário" : m.role === "analyst" ? "Analista" : "Nexo"}: ${m.content}`);
  lines.push("");
  lines.push(`Nova mensagem do funcionário: ${c.message}`);
  return lines.join("\n");
}
