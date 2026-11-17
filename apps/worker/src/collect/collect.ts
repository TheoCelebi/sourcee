import { articles, type Database, feeds, fetchRuns, sources, themes, zones } from "@sourcee/db";
import { isThemeSlug, isZoneSlug, type ThemeSlug, type ZoneSlug } from "@sourcee/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { HttpGet } from "../http";
import { errorMessage } from "../log";
import { mapWithConcurrency } from "../util/concurrency";
import { detectAgency, detectContentType } from "./classify";
import { extractHints } from "./hints";
import { canonicalUrl } from "./normalize";
import { type FeedItem, parseFeed } from "./parse";

export interface FeedToCollect {
  id: number;
  url: string;
  language: string;
  etag: string | null;
  lastModified: string | null;
  sourceId: number;
  policy: "open" | "links_only";
  defaultTheme: ThemeSlug | null;
  defaultZone: ZoneSlug | null;
}

export interface CollectOptions {
  http: HttpGet;
  userAgent: string;
  timeoutMs: number;
  maxAgeHours: number;
  now?: () => Date;
}

export interface CollectResult {
  feedId: number;
  url: string;
  status: number | null;
  itemsSeen: number;
  itemsNew: number;
  notModified: boolean;
  error: string | null;
}

type NewArticle = typeof articles.$inferInsert;

/** Flux à interroger : sources actives et non exclues, flux autorisés. */
export async function loadCollectableFeeds(db: Database): Promise<FeedToCollect[]> {
  const rows = await db
    .select({
      id: feeds.id,
      url: feeds.url,
      language: feeds.language,
      etag: feeds.etag,
      lastModified: feeds.lastModified,
      sourceId: sources.id,
      policy: sources.policy,
      defaultTheme: themes.slug,
      defaultZone: zones.slug,
    })
    .from(feeds)
    .innerJoin(sources, eq(feeds.sourceId, sources.id))
    .leftJoin(themes, eq(feeds.defaultThemeId, themes.id))
    .leftJoin(zones, eq(feeds.defaultZoneId, zones.id))
    .where(
      and(
        eq(feeds.active, true),
        eq(sources.active, true),
        inArray(sources.policy, ["open", "links_only"]),
      ),
    );
  return rows.map((row) => ({
    ...row,
    policy: row.policy === "open" ? "open" : "links_only",
    defaultTheme: row.defaultTheme && isThemeSlug(row.defaultTheme) ? row.defaultTheme : null,
    defaultZone: row.defaultZone && isZoneSlug(row.defaultZone) ? row.defaultZone : null,
  }));
}

/**
 * Transforme les éléments d'un flux en articles à insérer. Les sources « links_only »
 * ne laissent que titre, URL, date et métadonnées : leur chapô n'est ni lu ni conservé.
 */
export function buildArticles(
  items: FeedItem[],
  feed: FeedToCollect,
  now: Date,
  maxAgeHours: number,
): NewArticle[] {
  const oldest = now.getTime() - maxAgeHours * 3_600_000;
  const open = feed.policy === "open";
  const seen = new Set<string>();
  const rows: NewArticle[] = [];

  for (const item of items) {
    const url = canonicalUrl(item.link ?? (item.guid?.startsWith("http") ? item.guid : null));
    if (!url || !item.title || seen.has(url)) continue;
    seen.add(url);

    // Date absente ou dans le futur : on retient l'heure de collecte.
    const publishedAt =
      item.publishedAt && item.publishedAt.getTime() <= now.getTime() ? item.publishedAt : now;
    if (publishedAt.getTime() < oldest) continue;

    const hints = extractHints({
      url,
      categories: item.categories,
      defaultTheme: feed.defaultTheme,
      defaultZone: feed.defaultZone,
    });
    rows.push({
      sourceId: feed.sourceId,
      feedId: feed.id,
      url,
      guid: item.guid,
      title: item.title,
      excerpt: open && item.excerpt ? item.excerpt : null,
      language: feed.language,
      publishedAt,
      contentType: detectContentType({ url, title: item.title, categories: item.categories }),
      agency: detectAgency({
        creator: item.creator,
        texts: open ? [item.title, item.excerpt] : [item.title],
      }),
      themeHints: hints.themes,
      zoneHints: hints.zones,
    });
  }
  return rows;
}

/** Interroge un flux (requête conditionnelle), enregistre les nouveaux articles et le passage. */
export async function collectFeed(
  db: Database,
  feed: FeedToCollect,
  options: CollectOptions,
): Promise<CollectResult> {
  const started = Date.now();
  const now = options.now?.() ?? new Date();
  const result: CollectResult = {
    feedId: feed.id,
    url: feed.url,
    status: null,
    itemsSeen: 0,
    itemsNew: 0,
    notModified: false,
    error: null,
  };
  let etag = feed.etag;
  let lastModified = feed.lastModified;

  try {
    const headers: Record<string, string> = {};
    if (feed.etag) headers["If-None-Match"] = feed.etag;
    if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;
    const response = await options.http(feed.url, {
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs,
      headers,
    });
    result.status = response.status;

    if (response.status === 304) {
      result.notModified = true;
    } else if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    } else {
      const items = await parseFeed(response.body);
      const rows = buildArticles(items, feed, now, options.maxAgeHours);
      result.itemsSeen = items.length;
      if (rows.length > 0) {
        const inserted = await db
          .insert(articles)
          .values(rows)
          .onConflictDoNothing({ target: articles.url })
          .returning({ id: articles.id });
        result.itemsNew = inserted.length;
      }
      etag = response.headers.get("etag");
      lastModified = response.headers.get("last-modified");
    }
  } catch (error) {
    result.error = errorMessage(error);
  }

  await db.insert(fetchRuns).values({
    feedId: feed.id,
    startedAt: new Date(started),
    durationMs: Date.now() - started,
    httpStatus: result.status,
    itemsSeen: result.itemsSeen,
    itemsNew: result.itemsNew,
    error: result.error,
  });
  await db
    .update(feeds)
    .set(
      result.error
        ? { lastFetchedAt: now, consecutiveErrors: sql`${feeds.consecutiveErrors} + 1` }
        : { lastFetchedAt: now, consecutiveErrors: 0, etag, lastModified },
    )
    .where(eq(feeds.id, feed.id));

  return result;
}

/** Collecte tous les flux : plusieurs sites en parallèle, un seul flux à la fois par site. */
export async function collectAll(
  db: Database,
  feedsToCollect: FeedToCollect[],
  options: CollectOptions & { hostConcurrency: number },
): Promise<CollectResult[]> {
  const byHost = new Map<string, FeedToCollect[]>();
  for (const feed of feedsToCollect) {
    const host = new URL(feed.url).host;
    byHost.set(host, [...(byHost.get(host) ?? []), feed]);
  }
  const perHost = await mapWithConcurrency(
    [...byHost.values()],
    options.hostConcurrency,
    async (group) => {
      const results: CollectResult[] = [];
      for (const feed of group) results.push(await collectFeed(db, feed, options));
      return results;
    },
  );
  return perHost.flat();
}
