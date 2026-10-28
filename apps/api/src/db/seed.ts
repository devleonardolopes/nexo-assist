import { count } from "drizzle-orm";
import type { DecisionDetail, TraceStep } from "@nexo/shared";
import { now } from "../lib/clock";
import { type Db, createDb, schema } from "./client";
import { ARTICLES } from "./seed-data";
import { runMigrations } from "./migrate";

const min = 60_000;
const day = 24 * 60 * min;

type Seed = {
  role: "user" | "agent" | "analyst" | "system";
  text: string;
  /** minutos atrás */
  ago: number;
  steps?: TraceStep[];
  decision?: DecisionDetail;
};

const step = (tool: string, label: string, detail?: string): TraceStep => ({ tool, label, ok: true, detail });

/** Popula usuários, central de ajuda, chamados e conversas de exemplo. Idempotente (só roda em banco vazio). */
export async function seed(db: Db, at: Date = now()): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(schema.users) as [{ n: number }];
  if (n > 0) return false;

  const ago = (ms: number) => new Date(at.getTime() - ms).toISOString();

  await db.insert(schema.users).values([
    { id: "usr_ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", role: "employee", department: "Financeiro", os: "Windows 11", color: "#0062C4", passwordChangedAt: ago(42 * day) },
    { id: "usr_carla", name: "Carla Mendes", email: "carla.mendes@nexo.com.br", role: "employee", department: "Comercial", os: "Windows 11", color: "#9A4A12", passwordChangedAt: ago(30 * day) },
    { id: "usr_bruno", name: "Bruno Tavares", email: "bruno.tavares@nexo.com.br", role: "employee", department: "Engenharia", os: "Windows 10", color: "#5B3FC4", passwordChangedAt: ago(12 * day) },
    { id: "usr_diego", name: "Diego Ramos", email: "diego.ramos@nexo.com.br", role: "employee", department: "Marketing", os: "macOS", color: "#1E7A4C", passwordChangedAt: ago(70 * day) },
    { id: "usr_elisa", name: "Elisa Prado", email: "elisa.prado@nexo.com.br", role: "employee", department: "Recursos Humanos", os: "Windows 11", color: "#A3324F", passwordChangedAt: ago(5 * day) },
    { id: "usr_fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", role: "employee", department: "Logística", os: "Windows 10", color: "#3D4656", passwordChangedAt: ago(20 * day) },
    { id: "usr_gabriela", name: "Gabriela Rocha", email: "gabriela.rocha@nexo.com.br", role: "employee", department: "Jurídico", os: "Windows 11", color: "#8A6100", passwordChangedAt: ago(44 * day) },
    { id: "usr_rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", role: "analyst", department: "Service desk", level: "N2", color: "#0062C4" },
    { id: "usr_marina", name: "Marina Alves", email: "marina.alves@nexo.com.br", role: "analyst", department: "Service desk", level: "N1", color: "#1E7A4C" },
  ]);

  await db.insert(schema.articles).values(ARTICLES);

  const t = (
    id: string,
    requesterId: string,
    o: {
      type: "INC" | "REQ";
      title: string;
      description: string;
      category: string;
      subcategory?: string;
      priority: "critical" | "high" | "medium" | "low";
      status: "open" | "in_progress" | "waiting_analyst" | "approved" | "resolved" | "cancelled";
      affected?: "self" | "team" | "company" | "unknown";
      createdAgo: number;
      updatedAgo: number;
      resolvedAgo?: number;
      assignee?: string;
    },
  ) => ({
    id,
    requesterId,
    type: o.type,
    title: o.title,
    description: o.description,
    category: o.category,
    subcategory: o.subcategory ?? null,
    priority: o.priority,
    status: o.status,
    affected: o.affected ?? "self",
    assigneeId: o.assignee ?? null,
    createdAt: ago(o.createdAgo),
    updatedAt: ago(o.updatedAgo),
    resolvedAt: o.resolvedAgo !== undefined ? ago(o.resolvedAgo) : null,
  });

  await db.insert(schema.tickets).values([
    t("INC-20311", "usr_ana", { type: "INC", title: "Notebook lento após atualização do Windows", description: "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.", category: "Hardware", subcategory: "Notebook", priority: "medium", status: "waiting_analyst", createdAgo: 6 * day, updatedAgo: 5 * day + 6 * 60 * min }),
    t("INC-20298", "usr_ana", { type: "INC", title: "Acesso à pasta Financeiro no SharePoint", description: "Sem permissão para abrir a pasta Financeiro > Fechamento no SharePoint.", category: "Acesso", priority: "medium", status: "in_progress", createdAgo: 8 * day, updatedAgo: 1 * day, assignee: "usr_marina" }),
    t("REQ-10442", "usr_ana", { type: "REQ", title: "Segundo monitor para home office", description: "Pedido de um segundo monitor para trabalho em home office.", category: "Hardware", priority: "low", status: "approved", createdAgo: 12 * day, updatedAgo: 7 * day }),
    t("INC-19877", "usr_ana", { type: "INC", title: "Outlook não sincroniza no celular", description: "O e-mail corporativo parou de sincronizar no celular.", category: "E-mail", priority: "medium", status: "resolved", createdAgo: 55 * day, updatedAgo: 52 * day, resolvedAgo: 52 * day }),
    t("INC-19410", "usr_ana", { type: "INC", title: "Troca de senha da rede", description: "Solicitação de troca da senha da rede.", category: "Acesso", priority: "low", status: "resolved", createdAgo: 108 * day, updatedAgo: 107 * day, resolvedAgo: 107 * day }),
    t("INC-20150", "usr_carla", { type: "INC", title: "Senha do SAP bloqueada", description: "Senha do SAP bloqueada após várias tentativas.", category: "Acesso", priority: "medium", status: "resolved", createdAgo: 5 * day, updatedAgo: 4 * day, resolvedAgo: 4 * day }),
    t("INC-20402", "usr_bruno", { type: "INC", title: "Impressora do 3º andar sem toner", description: "A impressora NX-3A do 3º andar está sem toner.", category: "Hardware", priority: "low", status: "open", createdAgo: 2 * day, updatedAgo: 2 * day }),
    t("INC-20490", "usr_diego", { type: "INC", title: "Teams sem áudio nas reuniões", description: "O áudio não funciona nas reuniões do Teams no Mac.", category: "Software", priority: "high", status: "in_progress", createdAgo: 1 * day, updatedAgo: 3 * 60 * min, assignee: "usr_marina" }),
    t("INC-20519", "usr_elisa", { type: "INC", title: "Sistema de ponto fecha sozinho", description: "O sistema de ponto fecha sozinho ao abrir o espelho.", category: "Software", priority: "high", status: "open", createdAgo: 6 * min, updatedAgo: 6 * min }),
    t("INC-20388", "usr_fabio", { type: "INC", title: "Wi-Fi caindo na sala 4", description: "O Wi-Fi cai a cada poucos minutos na sala de reunião 4.", category: "Rede e VPN", priority: "medium", status: "resolved", createdAgo: 4 * day, updatedAgo: 1 * day, resolvedAgo: 1 * day }),
    t("REQ-10451", "usr_gabriela", { type: "REQ", title: "Licença do Adobe Acrobat", description: "Pedido de licença do Adobe Acrobat Pro.", category: "Software", priority: "low", status: "approved", createdAgo: 3 * day, updatedAgo: 2 * day }),
  ]);

  const conv = async (
    id: string,
    userId: string,
    o: {
      status: "agent" | "waiting_analyst" | "with_analyst" | "resolved";
      reason?: "user_request" | "critical" | "overdue" | "low_confidence";
      summary?: string;
      transferredAgo?: number;
      confidence?: number;
      related?: string;
      resolvedBy?: "agent" | "analyst";
    },
    msgs: Seed[],
  ) => {
    const last = msgs[msgs.length - 1]!;
    await db.insert(schema.conversations).values({
      id,
      userId,
      status: o.status,
      transferReason: o.reason ?? null,
      transferSummary: o.summary ?? null,
      transferredAt: o.transferredAgo !== undefined ? ago(o.transferredAgo * min) : null,
      agentConfidence: o.confidence !== undefined ? Math.round(o.confidence * 100) : null,
      relatedTicketId: o.related ?? null,
      focusTicketId: o.related ?? null,
      resolvedBy: o.resolvedBy ?? null,
      createdAt: ago((msgs[0]!.ago + 1) * min),
      updatedAt: ago(last.ago * min),
    });
    let i = 0;
    for (const m of msgs) {
      await db.insert(schema.messages).values({
        id: `${id}_m${i++}`,
        conversationId: id,
        role: m.role,
        authorName: m.role === "agent" ? "Nexo Assist" : m.role === "analyst" ? "Rafael Lima" : null,
        authorTag: m.role === "agent" ? "IA" : m.role === "analyst" ? "Suporte N2" : null,
        content: m.text,
        createdAt: ago(m.ago * min),
        steps: m.steps ?? [],
        decision: m.decision ?? null,
        cards: [],
      });
    }
  };

  await conv(
    "conv_ana",
    "usr_ana",
    { status: "waiting_analyst", reason: "overdue", transferredAgo: 5, related: "INC-20311", confidence: 96, summary: "INC-20311 (Notebook lento após atualização do Windows, prioridade média) sem atualização há 5 dias, acima do prazo de 3 dias úteis. A funcionária pediu para falar com um analista." },
    [
      { role: "user", text: "Qual o status do meu chamado?", ago: 9 },
      { role: "agent", text: "Você tem 3 chamados abertos. Sobre qual deles quer saber?", ago: 9, steps: [step("list_tickets", "consultou seus chamados", "3 chamados abertos")] },
      { role: "user", text: "INC-20311 · Notebook lento após atualização", ago: 8 },
      { role: "agent", text: "Está sem atualização há 5 dias, acima do prazo de 3 dias úteis. Quer que eu chame um analista?", ago: 8, steps: [step("get_ticket", "consultou o INC-20311"), step("compute_sla", "calculou o prazo", "prazo de 3 dias úteis vencido")] },
      { role: "user", text: "Está parado há 5 dias.", ago: 6 },
      { role: "user", text: "Quero falar com um analista.", ago: 6 },
      {
        role: "agent",
        text: "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
        ago: 5,
        steps: [step("transfer", "transferiu para um analista", "Suporte N2")],
        decision: { understanding: "A funcionária quer falar com uma pessoa sobre o INC-20311, vencido.", intent: "transfer", action: "Transferir a conversa para o Suporte N2 com um resumo do caso", confidence: 0.96, reasoning: "Pedido explícito de falar com um analista e o chamado está acima do prazo de 3 dias úteis.", source: "model" },
      },
      { role: "system", text: "Transferida para Suporte N2", ago: 5 },
    ],
  );

  await conv(
    "conv_carla",
    "usr_carla",
    { status: "waiting_analyst", reason: "user_request", transferredAgo: 95, summary: "Carla precisa de acesso ao SAP ainda hoje. O INC-20150 (senha do SAP bloqueada) foi resolvido há 4 dias." },
    [
      { role: "user", text: "Preciso de acesso ao SAP ainda hoje", ago: 96 },
      { role: "agent", text: "Entendi. Vou chamar um analista para acompanhar isso com prioridade.", ago: 95, steps: [step("transfer", "transferiu para um analista", "Suporte N2")] },
      { role: "system", text: "Transferida para Suporte N2", ago: 95 },
    ],
  );

  await conv(
    "conv_bruno",
    "usr_bruno",
    { status: "waiting_analyst", reason: "low_confidence", transferredAgo: 40, confidence: 0.41, summary: "O agent não teve segurança para decidir (confiança 41%). Bruno relatou um problema intermitente de rede em casa que não ficou claro se é da empresa." },
    [
      { role: "user", text: "A conexão cai e volta, mas só quando uso o app de vendas", ago: 41 },
      {
        role: "agent",
        text: "Vou chamar um analista para isso.",
        ago: 40,
        steps: [step("search_kb", "buscou na central de ajuda", "nenhum artigo relevante"), step("transfer", "transferiu para um analista")],
        decision: { understanding: "Queda de conexão intermitente associada ao app de vendas; pode ser rede, VPN ou o próprio app.", intent: "transfer", action: "Transferir para um analista por baixa confiança", confidence: 0.41, reasoning: "Sintomas ambíguos e nenhum artigo cobre o caso; confiança abaixo do limite de 60%.", source: "model" },
      },
      { role: "system", text: "Transferida para Suporte N2", ago: 40 },
    ],
  );

  await conv("conv_diego", "usr_diego", { status: "agent" }, [
    { role: "user", text: "O áudio do Teams continua sem funcionar no Mac", ago: 2 },
    { role: "agent", text: "Já tem o INC-20490 aberto sobre isso. Vou adicionar essa informação ao chamado.", ago: 1, steps: [step("list_tickets", "consultou seus chamados")] },
  ]);
  await conv("conv_elisa", "usr_elisa", { status: "agent", related: "INC-20519" }, [
    { role: "user", text: "O sistema de ponto fecha sozinho quando abro o espelho", ago: 8 },
    { role: "agent", text: "Chamado INC-20519 criado.", ago: 6, steps: [step("create_ticket", "criou um chamado", "INC-20519")] },
  ]);
  await conv("conv_fabio", "usr_fabio", { status: "resolved", resolvedBy: "agent" }, [
    { role: "user", text: "Como conecto no Wi-Fi da empresa?", ago: 40 },
    { role: "agent", text: "Escolha a rede Nexo-Corp e entre com seu e-mail corporativo e a senha da rede.", ago: 39, steps: [step("search_kb", "buscou na central de ajuda", "Conectar ao Wi-Fi corporativo")] },
    { role: "user", text: "Isso resolveu, obrigado!", ago: 38 },
  ]);
  await conv("conv_gabriela", "usr_gabriela", { status: "resolved", resolvedBy: "agent" }, [
    { role: "user", text: "Qual a senha do Wi-Fi de visitantes?", ago: 24 * 60 },
    { role: "agent", text: "A senha do Wi-Fi foi enviada para a recepção e é trocada toda segunda-feira.", ago: 24 * 60 - 1, steps: [step("search_kb", "buscou na central de ajuda")] },
  ]);

  return true;
}

if (import.meta.main) {
  const db = createDb();
  await runMigrations(db);
  console.log((await seed(db)) ? "Seed aplicado." : "Banco já populado, nada a fazer.");
}
