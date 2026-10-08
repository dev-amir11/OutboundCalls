import "dotenv/config";
import { defineConfig } from "prisma/config";

// Placeholder is enough for `prisma generate` (e.g. Railway agent install).
// Real migrate/seed/runtime still require a valid DATABASE_URL.
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
