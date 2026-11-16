import { loadRootEnv, requireEnv } from "@sourcee/shared/node";
import { createDb } from "./client";
import { seedDatabase } from "./seeding";

loadRootEnv();
const { db, close } = createDb(requireEnv("DATABASE_URL"));
try {
  const report = await seedDatabase(db);
  console.log(
    `Données de référence à jour : ${report.themes} thèmes, ${report.zones} zones, ` +
      `${report.sources} sources, ${report.feeds} flux.`,
  );
} finally {
  await close();
}
