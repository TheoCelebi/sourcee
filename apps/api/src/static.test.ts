import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "@sourcee/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("service de l'interface construite", () => {
  const dist = mkdtempSync(join(tmpdir(), "sourcee-web-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Sourcé</title>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log('ok');");
  writeFileSync(join(dist, "sw.js"), "self.addEventListener('install', () => {});");
  // Aucune route de l'API n'est appelée ici : la base n'est pas nécessaire.
  const app = createApp({} as Database, { webDist: dist });

  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it("sert l'application sur toute page hors /api", async () => {
    for (const path of ["/", "/sources", "/methodologie"]) {
      const response = await request(app).get(path).expect(200);
      expect(response.text).toContain("<title>Sourcé</title>");
      expect(response.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("met en cache long les fichiers nommés d'après leur contenu, pas le service worker", async () => {
    const asset = await request(app).get("/assets/index-abc123.js").expect(200);
    expect(asset.headers["cache-control"]).toContain("immutable");
    const worker = await request(app).get("/sw.js").expect(200);
    expect(worker.headers["cache-control"]).toBe("no-cache");
  });

  it("garde les erreurs JSON de l'API et une politique de sécurité stricte", async () => {
    const response = await request(app).get("/api/inconnu").expect(404);
    expect(response.body).toEqual({ error: "Ressource introuvable" });
    const csp = response.headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
