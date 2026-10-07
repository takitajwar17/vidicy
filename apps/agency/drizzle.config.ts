import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Keep the D1 migration history separate and unchanged.
  out: "./src/db/postgres-migrations",
  schema: "./src/db/schema/index.ts",
  dialect: "postgresql",
  ...(process.env.DATABASE_URL
    ? { dbCredentials: { url: process.env.DATABASE_URL } }
    : {
        dbCredentials: {
          host: process.env.PGHOST ?? "localhost",
          port: Number(process.env.PGPORT ?? 5432),
          database: process.env.PGDATABASE ?? "vidicy",
          user: process.env.PGUSER ?? "postgres",
          password: process.env.PGPASSWORD ?? "",
        },
      }),
});
