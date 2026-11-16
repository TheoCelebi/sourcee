import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// drizzle-kit est lancé depuis packages/db : le .env est deux dossiers plus haut.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://sourcee:sourcee@localhost:5432/sourcee",
  },
  strict: true,
  verbose: true,
});
