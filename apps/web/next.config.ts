import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro, sem build próprio.
  transpilePackages: ["@nexo/api", "@nexo/shared"],
  // Dependências nativas/dinâmicas do agent e do banco ficam fora do bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "@mastra/core"],
  // As migrations SQL são lidas em runtime pelo Drizzle; precisam ir junto no deploy.
  outputFileTracingIncludes: {
    "/api/**": ["../api/drizzle/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
