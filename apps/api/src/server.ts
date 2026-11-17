import { createDb } from "@sourcee/db";
import { loadRootEnv, requireEnv } from "@sourcee/shared/node";
import { createApp } from "./app";

loadRootEnv();
const port = Number(process.env.API_PORT ?? 3000);
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const { db, close } = createDb(requireEnv("DATABASE_URL"));
const server = createApp(db, { corsOrigins }).listen(port, () => {
  console.log(`API à l'écoute sur http://localhost:${port}/api`);
});

function shutdown(): void {
  server.close(() => void close().then(() => process.exit(0)));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
