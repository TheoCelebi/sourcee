import type { Database } from "@sourcee/db";
import { collectAll, type CollectResult, loadCollectableFeeds } from "./collect/collect";
import { type ComplianceReport, complianceIsStale, runComplianceCheck } from "./compliance/check";
import { SourceInspector } from "./compliance/inspector";
import type { WorkerConfig } from "./config";
import { type HttpGet, httpGet } from "./http";
import { log } from "./log";

export async function runCompliance(
  db: Database,
  config: WorkerConfig,
  http: HttpGet = httpGet,
): Promise<ComplianceReport> {
  log.info("Contrôle de conformité des sources…");
  const inspector = new SourceInspector(http, config.userAgent, config.requestTimeoutMs);
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
  http: HttpGet = httpGet,
): Promise<CollectResult[]> {
  const feeds = await loadCollectableFeeds(db);
  log.info(`Collecte de ${feeds.length} flux…`);
  const results = await collectAll(db, feeds, {
    http,
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

/** Passage horaire : contrôle de conformité s'il date de plus de 24 h, puis collecte. */
export async function runPipeline(
  db: Database,
  config: WorkerConfig,
  http: HttpGet = httpGet,
): Promise<void> {
  if (await complianceIsStale(db)) await runCompliance(db, config, http);
  await runCollection(db, config, http);
}
