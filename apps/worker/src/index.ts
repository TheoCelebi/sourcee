import { createDb } from "@sourcee/db";
import { schedule } from "node-cron";
import { loadConfig } from "./config";
import { defaultDeps, runCompliance, runPipeline } from "./jobs";
import { errorMessage, log } from "./log";

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl);
const deps = defaultDeps();

// Les tâches s'exécutent l'une après l'autre ; une tâche déjà en attente n'est pas dupliquée.
let queue: Promise<void> = Promise.resolve();
const waiting = new Set<string>();

function enqueue(name: string, task: () => Promise<unknown>): void {
  if (waiting.has(name)) {
    log.warn(`Tâche « ${name} » déjà en attente : déclenchement ignoré.`);
    return;
  }
  waiting.add(name);
  queue = queue.then(async () => {
    waiting.delete(name);
    const started = Date.now();
    try {
      await task();
      log.info(`Tâche « ${name} » terminée en ${Math.round((Date.now() - started) / 1000)} s`);
    } catch (error) {
      log.error(`Tâche « ${name} » en échec`, { erreur: errorMessage(error) });
    }
  });
}

const tasks = [
  schedule("15 5 * * *", () => enqueue("conformité", () => runCompliance(db, config, deps)), {
    timezone: config.timeZone,
    name: "conformite",
  }),
  schedule("5 * * * *", () => enqueue("passage horaire", () => runPipeline(db, config, deps)), {
    timezone: config.timeZone,
    name: "passage-horaire",
  }),
];

log.info(
  "Worker démarré : conformité chaque jour à 5 h 15, collecte chaque heure à h+05 (heure de Paris).",
);
enqueue("démarrage", () => runPipeline(db, config, deps));

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal} reçu : arrêt après la tâche en cours.`);
  for (const task of tasks) await task.stop();
  await queue;
  await close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
