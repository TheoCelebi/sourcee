import { fileURLToPath } from "node:url";
import { createDb } from "@sourcee/db";
import { loadRootEnv, requireEnv } from "@sourcee/shared/node";
import { createApp } from "./app";

loadRootEnv();
const port = Number(process.env.API_PORT ?? 3000);
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// Build de l'interface (npm run build -w @sourcee/web), servi s'il existe.
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));

const { db, close } = createDb(requireEnv("DATABASE_URL"));
const server = createApp(db, { corsOrigins, webDist }).listen(port, () => {
  console.log(`Sourcé à l'écoute sur http://localhost:${port} (API : /api)`);
});

function shutdown(): void {
  server.close(() => void close().then(() => process.exit(0)));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
