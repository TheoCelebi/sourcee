import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    // Les tests d'intégration partagent la base de test : un fichier à la fois.
    fileParallelism: false,
  },
});
