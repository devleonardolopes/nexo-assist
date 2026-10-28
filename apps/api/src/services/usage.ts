import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { schema } from "../db/client";
import { config } from "../config";
import { now } from "../lib/clock";

/** Teto diário de chamadas ao LLM: protege o custo caso o deploy público seja abusado. */
export class UsageGuard {
  constructor(private db: Db) {}

  async tryConsume(): Promise<boolean> {
    const day = now().toISOString().slice(0, 10);
    const [row] = await this.db.select().from(schema.usage).where(eq(schema.usage.day, day));
    if (row && row.llmCalls >= config.dailyLlmCap) return false;
    if (!row) await this.db.insert(schema.usage).values({ day, llmCalls: 1 }).onConflictDoNothing();
    else await this.db.update(schema.usage).set({ llmCalls: sql`${schema.usage.llmCalls} + 1` }).where(eq(schema.usage.day, day));
    return true;
  }
}
