import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { config } from "../config";
import * as schema from "./schema";

function ensureDir(url: string) {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  if (path && path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
}

export function createDb(url = config.databaseUrl, authToken = config.databaseAuthToken) {
  ensureDir(url);
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export { schema };
