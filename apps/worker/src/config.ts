import { loadRootEnv, requireEnv } from "@sourcee/shared/node";

export interface WorkerConfig {
  databaseUrl: string;
  /** Identifiant envoyé aux sites (COLLECTOR_USER_AGENT). */
  userAgent: string;
  timeZone: string;
  requestTimeoutMs: number;
  /** Les articles plus anciens que cette fenêtre sont ignorés à la collecte. */
  maxArticleAgeHours: number;
  /** Nombre de sites interrogés en parallèle (jamais deux requêtes simultanées au même site). */
  hostConcurrency: number;
  /** Modèle Claude utilisé pour les résumés (SUMMARY_MODEL). */
  summaryModel: string;
  /** Journées dont les événements sont résumés, aujourd'hui compris. */
  summaryDays: number;
  /** Nombre d'événements résumés par journée, par ordre de classement. */
  summaryTopPerDay: number;
}

export const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; rss-collector/0.1)";

export function loadConfig(): WorkerConfig {
  loadRootEnv();
  return {
    databaseUrl: requireEnv("DATABASE_URL"),
    userAgent: process.env.COLLECTOR_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    timeZone: "Europe/Paris",
    requestTimeoutMs: 30_000,
    maxArticleAgeHours: 72,
    hostConcurrency: 4,
    summaryModel: process.env.SUMMARY_MODEL?.trim() || "claude-haiku-5-5",
    summaryDays: 2,
    summaryTopPerDay: 60,
  };
}
