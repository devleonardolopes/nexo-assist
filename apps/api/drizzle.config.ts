import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  // Migrations versionadas com timestamp no início do nome (ex.: 20261028120000_init.sql).
  migrations: { prefix: "timestamp" },
});
