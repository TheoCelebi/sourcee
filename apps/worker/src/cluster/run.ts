import {
  articles,
  type Database,
  events,
  eventThemes,
  eventZones,
  sources,
  themes,
  zones,
} from "@sourcee/db";
import { isThemeSlug, isZoneSlug } from "@sourcee/shared";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  agglomerate,
  type ClusteringParams,
  DEFAULT_CLUSTERING,
  type ExistingGroup,
} from "./agglomerate";
import { parisDay } from "./day";
import type { Embedder } from "./embedder";
import { computeEventStats, type EventMember } from "./stats";

export interface ClusterReport {
  embedded: number;
  joined: number;
  created: number;
  refreshed: number;
  removed: number;
}

export interface ClusterOptions {
  embedder: Embedder;
  maxAgeHours: number;
  params?: ClusteringParams;
  now?: Date;
}

const ELIGIBLE = and(
  eq(articles.contentType, "news"),
  inArray(sources.policy, ["open", "links_only"]),
  eq(sources.active, true),
);

/** Regroupe les articles récents en événements, puis met à jour les événements concernés. */
export async function clusterArticles(
  db: Database,
  options: ClusterOptions,
): Promise<ClusterReport> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - options.maxAgeHours * 3_600_000);
  const report: ClusterReport = { embedded: 0, joined: 0, created: 0, refreshed: 0, removed: 0 };

  report.embedded = await embedMissing(db, options.embedder, since);

  const pending = await db
    .select({ id: articles.id, publishedAt: articles.publishedAt, embedding: articles.embedding })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(
      and(
        ELIGIBLE,
        isNull(articles.eventId),
        isNotNull(articles.embedding),
        gte(articles.publishedAt, since),
      ),
    );

  const byDay = new Map<string, { articleId: number; vector: number[] }[]>();
  for (const row of pending) {
    if (!row.embedding) continue;
    const day = parisDay(row.publishedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), { articleId: row.id, vector: row.embedding }]);
  }

  const touched = new Set<number>();
  for (const [day, items] of byDay) {
    const existing = await loadDayGroups(db, day);
    const result = agglomerate(existing, items, options.params ?? DEFAULT_CLUSTERING);
    await db.transaction(async (tx) => {
      for (const [eventId, articleIds] of result.joined) {
        await tx.update(articles).set({ eventId }).where(inArray(articles.id, articleIds));
        touched.add(eventId);
        report.joined += articleIds.length;
      }
      for (const articleIds of result.created) {
        // Valeurs provisoires : elles sont recalculées juste après par refreshEvents.
        const [created] = await tx
          .insert(events)
          .values({ day, title: "", firstPublishedAt: now, lastPublishedAt: now })
          .returning({ id: events.id });
        if (!created) throw new Error("Création d'événement impossible");
        await tx
          .update(articles)
          .set({ eventId: created.id })
          .where(inArray(articles.id, articleIds));
        touched.add(created.id);
        report.created += 1;
      }
    });
  }

  // Événements dont des articles ont été retirés (source devenue exclue, par exemple).
  const sinceDay = parisDay(since);
  const drifted = await db.execute<{ id: number }>(sql`
    SELECT e.id FROM ${events} e LEFT JOIN ${articles} a ON a.event_id = e.id
    WHERE e.day >= ${sinceDay} GROUP BY e.id HAVING count(a.id) <> e.article_count`);
  for (const row of drifted.rows) touched.add(Number(row.id));

  const refreshed = await refreshEvents(db, [...touched]);
  report.refreshed = refreshed.refreshed;
  report.removed = refreshed.removed;
  return report;
}

async function embedMissing(db: Database, embedder: Embedder, since: Date): Promise<number> {
  const rows = await db
    .select({ id: articles.id, title: articles.title })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(ELIGIBLE, isNull(articles.embedding), gte(articles.publishedAt, since)));
  if (rows.length === 0) return 0;
  const vectors = await embedder(rows.map((row) => row.title));
  await db.transaction(async (tx) => {
    for (const [index, row] of rows.entries()) {
      await tx.update(articles).set({ embedding: vectors[index] }).where(eq(articles.id, row.id));
    }
  });
  return rows.length;
}

async function loadDayGroups(db: Database, day: string): Promise<ExistingGroup[]> {
  const rows = await db
    .select({ eventId: events.id, embedding: articles.embedding })
    .from(articles)
    .innerJoin(events, eq(articles.eventId, events.id))
    .where(and(eq(events.day, day), isNotNull(articles.embedding)));
  const groups = new Map<number, number[][]>();
  for (const row of rows) {
    if (row.embedding) groups.set(row.eventId, [...(groups.get(row.eventId) ?? []), row.embedding]);
  }
  return [...groups].map(([eventId, vectors]) => ({ eventId, vectors }));
}

/** Recalcule statistiques, titre, thèmes et zones ; supprime les événements devenus vides. */
export async function refreshEvents(
  db: Database,
  eventIds: number[],
): Promise<{ refreshed: number; removed: number }> {
  if (eventIds.length === 0) return { refreshed: 0, removed: 0 };

  const memberRows = await db
    .select({
      eventId: articles.eventId,
      articleId: articles.id,
      title: articles.title,
      sourceName: sources.name,
      sourceKind: sources.kind,
      independenceGroup: sources.independenceGroup,
      agency: articles.agency,
      publishedAt: articles.publishedAt,
      themeHints: articles.themeHints,
      zoneHints: articles.zoneHints,
      embedding: articles.embedding,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(and(inArray(articles.eventId, eventIds), isNotNull(articles.embedding)));

  const members = new Map<number, EventMember[]>();
  for (const row of memberRows) {
    if (row.eventId === null || !row.embedding) continue;
    members.set(row.eventId, [
      ...(members.get(row.eventId) ?? []),
      {
        ...row,
        embedding: row.embedding,
        themeHints: row.themeHints.filter(isThemeSlug),
        zoneHints: row.zoneHints.filter(isZoneSlug),
      },
    ]);
  }

  const eventRows = await db
    .select({
      id: events.id,
      title: events.title,
      titleFromSource: events.titleFromSource,
      summaryStatus: events.summaryStatus,
      summary: events.summary,
    })
    .from(events)
    .where(inArray(events.id, eventIds));
  const themeIds = new Map((await db.select().from(themes)).map((t) => [t.slug, t.id]));
  const zoneIds = new Map((await db.select().from(zones)).map((z) => [z.slug, z.id]));

  let refreshed = 0;
  let removed = 0;
  await db.transaction(async (tx) => {
    for (const event of eventRows) {
      const list = members.get(event.id);
      if (!list?.length) {
        await tx.delete(events).where(eq(events.id, event.id));
        removed += 1;
        continue;
      }
      const stats = computeEventStats(list);
      const summarized = event.summaryStatus === "ok";
      const summaryText = (event.summary ?? []).map((sentence) => sentence.text).join(" ");
      await tx
        .update(events)
        .set({
          title: event.titleFromSource ? stats.representativeTitle : event.title,
          articleCount: stats.articleCount,
          independentOrigins: stats.independentOrigins,
          verification: stats.verification,
          score: stats.score,
          firstPublishedAt: stats.firstPublishedAt,
          lastPublishedAt: stats.lastPublishedAt,
          centroid: stats.centroid,
          searchText: [event.titleFromSource ? "" : event.title, summaryText, stats.searchText]
            .filter(Boolean)
            .join(" · "),
          updatedAt: new Date(),
        })
        .where(eq(events.id, event.id));

      // Thèmes et zones : ceux du résumé priment ; sinon, les indices des articles.
      if (!summarized) {
        await tx.delete(eventThemes).where(eq(eventThemes.eventId, event.id));
        await tx.delete(eventZones).where(eq(eventZones.eventId, event.id));
        const themeRows = stats.themes.flatMap((slug) => {
          const themeId = themeIds.get(slug);
          return themeId ? [{ eventId: event.id, themeId }] : [];
        });
        const zoneRows = stats.zones.flatMap((slug) => {
          const zoneId = zoneIds.get(slug);
          return zoneId ? [{ eventId: event.id, zoneId }] : [];
        });
        if (themeRows.length) await tx.insert(eventThemes).values(themeRows);
        if (zoneRows.length) await tx.insert(eventZones).values(zoneRows);
      }
      refreshed += 1;
    }
  });
  return { refreshed, removed };
}
