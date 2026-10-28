import { resolve } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Db } from "./client";

export const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}

if (import.meta.main) {
  const { createDb } = await import("./client");
  await runMigrations(createDb());
  console.log("Migrations aplicadas.");
}
