import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Carrega o .env da raiz do monorepo (ou da pasta atual) sem sobrescrever variáveis já definidas. */
function loadDotEnv() {
  const candidates = [".env", "../../.env", "../.env"].map((p) => resolve(/*turbopackIgnore: true*/ process.cwd(), p));
  for (const file of candidates) {
    if (!existsSync(/*turbopackIgnore: true*/ file)) continue;
    for (const line of readFileSync(/*turbopackIgnore: true*/ file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      const value = raw!.replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadDotEnv();

const onVercel = Boolean(process.env.VERCEL);

/** Raiz do monorepo (pasta que contém apps/api), para o banco local ser o mesmo rode a API sozinha ou dentro do Next. */
function repoRoot(): string {
  let dir = /*turbopackIgnore: true*/ process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(/*turbopackIgnore: true*/ resolve(dir, "apps/api/drizzle/meta/_journal.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? (onVercel ? "file:/tmp/nexo.db" : `file:${resolve(repoRoot(), "apps/api/data/nexo.db")}`),
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  /** Modelo usado pelo agent (id do provedor DeepSeek). */
  model: process.env.LLM_MODEL ?? "deepseek-v4-flash",
  messageLimit: Number(process.env.MESSAGE_LIMIT ?? 30),
  /** Teto diário de chamadas ao LLM (proteção de custo no deploy). */
  dailyLlmCap: Number(process.env.DAILY_LLM_CAP ?? 2000),
  /** Requisições ao agent por IP por minuto. */
  ipRatePerMinute: Number(process.env.IP_RATE_PER_MINUTE ?? 20),
  /** Abaixo disso o agent não decide sozinho e transfere para um analista. */
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? 0.6),
  /** Simula a indisponibilidade do sistema legado (0 a 1). */
  legacyFailureRate: Number(process.env.LEGACY_FAILURE_RATE ?? 0),
  sessionTtlHours: 24 * 7,
} as const;
