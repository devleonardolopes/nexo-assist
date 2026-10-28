import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Db } from "./client";

/** Localiza as migrations tanto rodando a API sozinha quanto dentro do Next (onde import.meta.dirname não existe). */
function findMigrationsFolder(): string {
  const candidates = [
    import.meta.dirname ? resolve(import.meta.dirname, "../../drizzle") : null,
    resolve(process.cwd(), "drizzle"),
    resolve(process.cwd(), "../api/drizzle"),
    resolve(process.cwd(), "apps/api/drizzle"),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => existsSync(resolve(p, "meta/_journal.json")));
  if (!found) throw new Error(`Pasta de migrations não encontrada. Procurei em: ${candidates.join(", ")}`);
  return found;
}

export const migrationsFolder = () => findMigrationsFolder();

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

if (import.meta.main) {
  const { createDb } = await import("./client");
  await runMigrations(createDb());
  console.log("Migrations aplicadas.");
}
