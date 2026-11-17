import { createDb } from "@sourcee/db";
import { loadConfig } from "./config";
import { runCollection, runCompliance, runPipeline } from "./jobs";

const COMMANDS = {
  compliance: runCompliance,
  collect: runCollection,
  pipeline: runPipeline,
} as const;

const name = process.argv[2] ?? "pipeline";
if (!Object.hasOwn(COMMANDS, name)) {
  console.error(`Commande inconnue « ${name} ». Commandes : ${Object.keys(COMMANDS).join(", ")}.`);
  process.exit(1);
}

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl);
try {
  await COMMANDS[name as keyof typeof COMMANDS](db, config);
} finally {
  await close();
}
