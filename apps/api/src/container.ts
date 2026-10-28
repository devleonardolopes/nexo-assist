import { Agent } from "./agent/orchestrator";
import { type Decider, MastraDecider } from "./agent/decider";
import { config } from "./config";
import { type Db, createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { seed } from "./db/seed";
import { AnalystService } from "./services/analyst";
import { AuthService } from "./services/auth";
import { ConversationStore } from "./services/conversations";
import { KnowledgeBase } from "./services/kb";
import { TicketService } from "./services/tickets";
import { UsageGuard } from "./services/usage";

/** Composição das dependências. Cada camada recebe só o que precisa (agent não conhece HTTP; serviços não conhecem o agent). */
export function createContainer(opts: { db?: Db; decider?: Decider; failureRate?: number } = {}) {
  const db = opts.db ?? createDb();
  const tickets = new TicketService(db, { failureRate: opts.failureRate ?? config.legacyFailureRate });
  const kb = new KnowledgeBase(db);
  const convos = new ConversationStore(db);
  const auth = new AuthService(db);
  const usage = new UsageGuard(db);
  const analyst = new AnalystService(db, convos, tickets);
  const agent = new Agent({ tickets, kb, convos, usage, decider: opts.decider ?? new MastraDecider() });

  /** Migra e popula o banco uma vez por processo (também no cold start serverless). */
  const ready = (async () => {
    await runMigrations(db);
    await seed(db);
  })();

  return { db, tickets, kb, convos, auth, usage, analyst, agent, ready };
}

export type Container = ReturnType<typeof createContainer>;
