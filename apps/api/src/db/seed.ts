import { count } from "drizzle-orm";
import { now } from "../lib/clock";
import { type Db, createDb, schema } from "./client";
import { ARTICLES } from "./seed-data";
import { runMigrations } from "./migrate";

const min = 60_000;
const day = 24 * 60 * min;

/** Popula usuários, central de ajuda, chamados e conversas de exemplo. Idempotente (só roda em banco vazio). */
export async function seed(db: Db, at: Date = now()): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(schema.users) as [{ n: number }];
  if (n > 0) return false;

  const ago = (ms: number) => new Date(at.getTime() - ms).toISOString();

  await db.insert(schema.users).values([
    { id: "usr_ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", role: "employee", department: "Financeiro", os: "Windows 11", color: "#0062C4", passwordChangedAt: ago(42 * day) },
    { id: "usr_rafael", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", role: "analyst", department: "Service desk", level: "N2", color: "#0062C4" },
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
    t("INC-20298", "usr_ana", { type: "INC", title: "Acesso à pasta Financeiro no SharePoint", description: "Sem permissão para abrir a pasta Financeiro > Fechamento no SharePoint.", category: "Acesso", priority: "medium", status: "in_progress", createdAgo: 8 * day, updatedAgo: 1 * day, assignee: "usr_rafael" }),
    t("REQ-10442", "usr_ana", { type: "REQ", title: "Segundo monitor para home office", description: "Pedido de um segundo monitor para trabalho em home office.", category: "Hardware", priority: "low", status: "approved", createdAgo: 12 * day, updatedAgo: 7 * day }),
    t("INC-19877", "usr_ana", { type: "INC", title: "Outlook não sincroniza no celular", description: "O e-mail corporativo parou de sincronizar no celular.", category: "E-mail", priority: "medium", status: "resolved", createdAgo: 55 * day, updatedAgo: 52 * day, resolvedAgo: 52 * day }),
    t("INC-19410", "usr_ana", { type: "INC", title: "Troca de senha da rede", description: "Solicitação de troca da senha da rede.", category: "Acesso", priority: "low", status: "resolved", createdAgo: 108 * day, updatedAgo: 107 * day, resolvedAgo: 107 * day }),
  ]);

  // Conversa nova da Ana: o agent atende. O console do analista só mostra casos depois que ela é transferida.
  await db.insert(schema.conversations).values({ id: "conv_ana", userId: "usr_ana", status: "agent", createdAt: ago(0), updatedAt: ago(0) });

  return true;
}

if (import.meta.main) {
  const db = createDb();
  await runMigrations(db);
  console.log((await seed(db)) ? "Seed aplicado." : "Banco já populado, nada a fazer.");
}
