import type { Database } from "@sourcee/db";
import { parisDay, THEMES, ZONES } from "@sourcee/shared";
import cors from "cors";
import { sql } from "drizzle-orm";
import express, { type Express } from "express";
import helmet from "helmet";
import { errorHandler, HttpError } from "./errors";
import { findEventById, findEvents, findSources, findStats } from "./queries";
import { parseDay, parseEventsQuery } from "./validation";

export interface AppOptions {
  /** Origines autorisées à appeler l'API depuis un navigateur (CORS). */
  corsOrigins?: string[];
  /** Horloge injectable pour les tests. */
  now?: () => Date;
}

/** Les éditions changent au plus une fois par heure : un court cache côté client suffit. */
const CACHE = "public, max-age=60";

export function createApp(db: Database, options: AppOptions = {}): Express {
  const today = () => parisDay(options.now?.() ?? new Date());
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  if (options.corsOrigins?.length) app.use("/api", cors({ origin: options.corsOrigins }));

  const api = express.Router();

  api.get("/health", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "indisponible" });
    }
  });

  api.get("/events", async (req, res) => {
    const filters = parseEventsQuery(req.query, today());
    res.set("Cache-Control", CACHE).json(await findEvents(db, filters));
  });

  api.get("/events/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new HttpError(400, "Identifiant d'événement invalide");
    const event = await findEventById(db, id);
    if (!event) throw new HttpError(404, "Événement introuvable");
    res.set("Cache-Control", CACHE).json(event);
  });

  api.get("/themes", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(THEMES);
  });

  api.get("/zones", (_req, res) => {
    res.set("Cache-Control", "public, max-age=86400").json(ZONES);
  });

  api.get("/sources", async (_req, res) => {
    res.set("Cache-Control", CACHE).json(await findSources(db));
  });

  api.get("/stats", async (req, res) => {
    res.set("Cache-Control", CACHE).json(await findStats(db, parseDay(req.query.day, today())));
  });

  api.use(() => {
    throw new HttpError(404, "Ressource introuvable");
  });

  app.use("/api", api);
  app.use(errorHandler);
  return app;
}
