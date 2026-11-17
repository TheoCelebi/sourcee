import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Les tests de l'interface (.tsx) déclarent leur environnement jsdom en tête de fichier.
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.{ts,tsx}"],
    environment: "node",
    // Les tests d'intégration partagent la base de test : un fichier à la fois.
    fileParallelism: false,
  },
});
