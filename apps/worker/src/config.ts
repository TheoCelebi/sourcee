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
  /** Moyen d'accès au modèle pour les résumés (SUMMARY_PROVIDER). */
  summaryProvider: SummaryProvider;
  /** Exécutable de Claude Code, pour le fournisseur « claude-code » (CLAUDE_BIN). */
  claudeBin: string;
  /** Modèle Claude utilisé pour les résumés (SUMMARY_MODEL). */
  summaryModel: string;
  /** Journées dont les événements sont résumés, aujourd'hui compris. */
  summaryDays: number;
  /** Nombre d'événements résumés par journée, par ordre de classement. */
  summaryTopPerDay: number;
}

/**
 * auto : l'API si une clé est configurée, sinon Claude Code s'il est installé, sinon rien.
 * api : uniquement l'API. claude-code : uniquement Claude Code. off : résumés désactivés.
 */
export const SUMMARY_PROVIDERS = ["auto", "api", "claude-code", "off"] as const;
export type SummaryProvider = (typeof SUMMARY_PROVIDERS)[number];

function summaryProvider(value: string | undefined): SummaryProvider {
  const provider = value?.trim() || "auto";
  if (!(SUMMARY_PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `SUMMARY_PROVIDER invalide : « ${provider} » (valeurs possibles : ${SUMMARY_PROVIDERS.join(", ")})`,
    );
  }
  return provider as SummaryProvider;
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
    summaryProvider: summaryProvider(process.env.SUMMARY_PROVIDER),
    claudeBin: process.env.CLAUDE_BIN?.trim() || "claude",
    summaryModel: process.env.SUMMARY_MODEL?.trim() || "claude-haiku-5-5",
    summaryDays: 2,
    summaryTopPerDay: 60,
  };
}
