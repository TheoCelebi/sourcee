import {
  articles,
  type Database,
  feeds,
  policyChecks,
  sources,
  type UsagePolicy,
} from "@sourcee/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { mapWithConcurrency } from "../util/concurrency";
import type { InspectionResult, SourceInspector } from "./inspector";
import { decidePolicy } from "./policy";

export interface PolicyChange {
  slug: string;
  from: UsagePolicy;
  to: UsagePolicy;
}

export interface ComplianceReport {
  checked: number;
  counts: Record<UsagePolicy, number>;
  changes: PolicyChange[];
  /** Sources non vérifiées cette fois (erreur temporaire), avec la raison. */
  failures: { slug: string; reason: string }[];
}

/** Contrôle chaque source active et met à jour son niveau d'usage. */
export async function runComplianceCheck(
  db: Database,
  inspector: SourceInspector,
  concurrency = 4,
): Promise<ComplianceReport> {
  const rows = await db
    .select({
      id: sources.id,
      slug: sources.slug,
      homepageUrl: sources.homepageUrl,
      policy: sources.policy,
      feedId: feeds.id,
      feedUrl: feeds.url,
    })
    .from(sources)
    .innerJoin(feeds, eq(feeds.sourceId, sources.id))
    .where(eq(sources.active, true));

  const bySource = new Map<
    number,
    {
      id: number;
      slug: string;
      homepageUrl: string;
      policy: UsagePolicy;
      feeds: { id: number; url: string }[];
    }
  >();
  for (const row of rows) {
    const entry = bySource.get(row.id) ?? { ...row, feeds: [] };
    entry.feeds.push({ id: row.feedId, url: row.feedUrl });
    bySource.set(row.id, entry);
  }

  const report: ComplianceReport = {
    checked: 0,
    counts: { open: 0, links_only: 0, excluded: 0 },
    changes: [],
    failures: [],
  };

  await mapWithConcurrency([...bySource.values()], concurrency, async (source) => {
    const result = await inspector.inspect(source);
    const policy = await applyResult(db, source.id, source.policy, result);
    report.checked += 1;
    report.counts[policy] += 1;
    if (result.kind === "unreachable")
      report.failures.push({ slug: source.slug, reason: result.reason });
    if (policy !== source.policy)
      report.changes.push({ slug: source.slug, from: source.policy, to: policy });
  });

  return report;
}

async function applyResult(
  db: Database,
  sourceId: number,
  previous: UsagePolicy,
  result: InspectionResult,
): Promise<UsagePolicy> {
  return db.transaction(async (tx) => {
    if (result.kind === "unreachable") {
      await tx.insert(policyChecks).values({
        sourceId,
        feedAllowed: false,
        tdmReserved: false,
        result: previous,
        error: result.reason,
      });
      return previous;
    }

    const policy = result.kind === "ok" ? decidePolicy(result.evidence) : "excluded";
    await tx.insert(policyChecks).values({
      sourceId,
      feedAllowed: result.kind === "ok" && result.evidence.feedAllowed,
      aiBotsBlocked: result.kind === "ok" ? result.evidence.aiBotsBlocked : [],
      tdmReserved: result.kind === "ok" && result.evidence.tdmReserved,
      result: policy,
      error: result.kind === "blocked" ? result.reason : null,
    });
    await tx
      .update(sources)
      .set({ policy, policyCheckedAt: new Date() })
      .where(eq(sources.id, sourceId));

    if (result.kind === "ok") {
      for (const [feedId, allowed] of result.feedAccess) {
        await tx.update(feeds).set({ active: allowed }).where(eq(feeds.id, feedId));
      }
    }

    // Une source qui n'est plus « open » ne doit plus avoir de chapô stocké.
    if (policy !== "open") {
      await tx
        .update(articles)
        .set({ excerpt: null })
        .where(and(eq(articles.sourceId, sourceId), isNotNull(articles.excerpt)));
    }
    // Une source exclue ne doit plus être analysée : ses articles quittent les événements.
    if (policy === "excluded") {
      await tx
        .update(articles)
        .set({ eventId: null, embedding: null })
        .where(and(eq(articles.sourceId, sourceId), isNotNull(articles.eventId)));
    }
    return policy;
  });
}

/** Vrai si une source active n'a jamais été contrôlée, ou pas depuis plus de 24 heures. */
export async function complianceIsStale(db: Database, now = new Date()): Promise<boolean> {
  const rows = await db
    .select({ checkedAt: sources.policyCheckedAt })
    .from(sources)
    .where(eq(sources.active, true));
  const dayAgo = now.getTime() - 24 * 3_600_000;
  return rows.some((row) => !row.checkedAt || row.checkedAt.getTime() < dayAgo);
}
