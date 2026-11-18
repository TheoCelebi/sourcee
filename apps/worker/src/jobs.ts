import type { Database } from "@sourcee/db";
import { type ClusterReport, clusterArticles } from "./cluster/run";
import { createEmbedder, type Embedder } from "./cluster/embedder";
import { collectAll, type CollectResult, loadCollectableFeeds } from "./collect/collect";
import { type ComplianceReport, complianceIsStale, runComplianceCheck } from "./compliance/check";
import { SourceInspector } from "./compliance/inspector";
import type { WorkerConfig } from "./config";
import { type HttpGet, httpGet } from "./http";
import { log } from "./log";
import { createSummaryModel, type SummaryModel } from "./summarize/provider";
import { type SummarizeReport, summarizeEvents } from "./summarize/run";

/** Dépendances externes des tâches, remplaçables dans les tests. */
export interface JobDeps {
  http: HttpGet;
  embedder: Embedder;
  /** null si aucun accès au modèle n'est disponible : les résumés sont alors désactivés. */
  model: SummaryModel | null;
}

export function defaultDeps(config: WorkerConfig): JobDeps {
  return {
    http: httpGet,
    embedder: createEmbedder(),
    model: createSummaryModel(config),
  };
}

export async function runCompliance(
  db: Database,
  config: WorkerConfig,
  deps: Pick<JobDeps, "http">,
): Promise<ComplianceReport> {
  log.info("Contrôle de conformité des sources…");
  const inspector = new SourceInspector(deps.http, config.userAgent, config.requestTimeoutMs);
  const report = await runComplianceCheck(db, inspector);
  log.info("Contrôle de conformité terminé", { sources: report.checked, ...report.counts });
  for (const change of report.changes) {
    log.info(`Niveau d'usage modifié : ${change.slug} ${change.from} → ${change.to}`);
  }
  for (const failure of report.failures) {
    log.warn(`Contrôle impossible pour ${failure.slug}, niveau inchangé`, {
      raison: failure.reason,
    });
  }
  return report;
}

export async function runCollection(
  db: Database,
  config: WorkerConfig,
  deps: Pick<JobDeps, "http">,
): Promise<CollectResult[]> {
  const feeds = await loadCollectableFeeds(db);
  log.info(`Collecte de ${feeds.length} flux…`);
  const results = await collectAll(db, feeds, {
    http: deps.http,
    userAgent: config.userAgent,
    timeoutMs: config.requestTimeoutMs,
    maxAgeHours: config.maxArticleAgeHours,
    hostConcurrency: config.hostConcurrency,
  });
  const failed = results.filter((result) => result.error);
  log.info("Collecte terminée", {
    flux: results.length,
    nouveaux: results.reduce((sum, result) => sum + result.itemsNew, 0),
    inchanges: results.filter((result) => result.notModified).length,
    erreurs: failed.length,
  });
  for (const result of failed) log.warn(`Flux en erreur : ${result.url}`, { erreur: result.error });
  return results;
}

export async function runClustering(
  db: Database,
  config: WorkerConfig,
  deps: Pick<JobDeps, "embedder">,
): Promise<ClusterReport> {
  const report = await clusterArticles(db, {
    embedder: deps.embedder,
    maxAgeHours: config.maxArticleAgeHours,
  });
  log.info("Regroupement et recoupement terminés", {
    encodes: report.embedded,
    rattaches: report.joined,
    nouveaux_evenements: report.created,
    evenements_mis_a_jour: report.refreshed,
    evenements_supprimes: report.removed,
  });
  return report;
}

export async function runSummaries(
  db: Database,
  config: WorkerConfig,
  deps: Pick<JobDeps, "model">,
): Promise<SummarizeReport> {
  if (!deps.model) {
    log.warn(
      config.summaryProvider === "off"
        ? "Résumés désactivés (SUMMARY_PROVIDER=off)."
        : "Résumés désactivés : connectez Claude Code (claude puis /login) ou ajoutez ANTHROPIC_API_KEY dans .env.",
    );
  } else {
    log.info(`Résumés avec ${deps.model.name}`);
  }
  const report = await summarizeEvents(db, {
    model: deps.model,
    days: config.summaryDays,
    topPerDay: config.summaryTopPerDay,
  });
  log.info("Résumés terminés", {
    candidats: report.candidates,
    resumes: report.summarized,
    insuffisants: report.insufficient,
    sans_source_ouverte: report.unavailable,
    erreurs: report.errors,
    inchanges: report.skipped,
    jetons_entree: report.inputTokens,
    jetons_sortie: report.outputTokens,
  });
  return report;
}

/** Passage horaire : conformité si elle date de plus de 24 h, collecte, regroupement, résumés. */
export async function runPipeline(
  db: Database,
  config: WorkerConfig,
  deps: JobDeps,
): Promise<void> {
  if (await complianceIsStale(db)) await runCompliance(db, config, deps);
  await runCollection(db, config, deps);
  await runClustering(db, config, deps);
  await runSummaries(db, config, deps);
}
