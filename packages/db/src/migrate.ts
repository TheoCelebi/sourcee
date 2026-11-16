import { loadRootEnv, requireEnv } from "@sourcee/shared/node";
import { createDb } from "./client";
import { migrateDatabase } from "./migrations";

loadRootEnv();
const { db, close } = createDb(requireEnv("DATABASE_URL"));
try {
  await migrateDatabase(db);
  console.log("Migrations appliquées.");
} finally {
  await close();
}
