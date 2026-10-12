import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Migration execution requires this environment variable; the value is never committed.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
