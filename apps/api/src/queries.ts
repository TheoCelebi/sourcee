import type { Database } from "@sourcee/db";
import {
  type ApiArticle,
  type ApiEvent,
  type ApiEventsResponse,
  type ApiSourceInfo,
  type ApiStats,
  expandZones,
  isThemeSlug,
  isZoneSlug,
  type SummaryState,
} from "@sourcee/shared";
import { type SQL, sql } from "drizzle-orm";
import { foldDuplicates } from "./fold";
import type { EventFilters } from "./validation";

type EventRow = {
  id: number;
  day: string;
  title: string;
  title_from_source: boolean;
  summary: { text: string; articleIds: number[] }[] | null;
  summary_status: SummaryState;
  verification: "confirmed" | "single_source";
  independent_origins: number;
  article_count: number;
  first_published_at: Date;
  last_published_at: Date;
  centroid: string | null;
  rank: number | string;
};

type ArticleRow = {
  id: number | string;
  event_id: number | string;
  title: string;
  url: string;
  language: string;
  published_at: Date;
  agency: string | null;
  name: string;
  kind: "media" | "official";
  policy: "open" | "links_only";
  independence_group: string;
};

const EVENT_COLUMNS = sql`
  e.id, e.day::text AS day, e.title, e.title_from_source, e.summary, e.summary_status,
  e.verification, e.independent_origins, e.article_count, e.first_published_at,
  e.last_published_at, e.centroid::text AS centroid`;

/** Recherche par mot-clé : chaque mot (sans accents) est cherché comme préfixe. */
export function toTsQuery(q: string): string | null {
  const tokens = q
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return tokens.length ? tokens.map((token) => `${token}:*`).join(" & ") : null;
}

export async function findEvents(db: Database, filters: EventFilters): Promise<ApiEventsResponse> {
  const conditions: SQL[] = [sql`e.day BETWEEN ${filters.from} AND ${filters.to}`];
  if (filters.themes.length) {
    conditions.push(sql`EXISTS (SELECT 1 FROM event_themes et JOIN themes t ON t.id = et.theme_id
      WHERE et.event_id = e.id AND t.slug IN ${filters.themes})`);
  }
  if (filters.zones.length) {
    conditions.push(sql`EXISTS (SELECT 1 FROM event_zones ez JOIN zones z ON z.id = ez.zone_id
      WHERE ez.event_id = e.id AND z.slug IN ${expandZones(filters.zones)})`);
  }
  const tsquery = filters.q ? toTsQuery(filters.q) : null;
  if (tsquery) conditions.push(sql`e.search @@ to_tsquery('simple', ${tsquery})`);

  // Marge de candidats : certains seront repliés sous un événement mieux classé.
  const result = await db.execute<EventRow>(sql`
    SELECT * FROM (
      SELECT ${EVENT_COLUMNS}, row_number() OVER (PARTITION BY e.day ORDER BY e.score DESC, e.id) AS rank
      FROM events e WHERE ${sql.join(conditions, sql` AND `)}
    ) ranked
    WHERE rank <= ${filters.limit * 4}
    ORDER BY day DESC, rank`);

  const byDay = new Map<string, EventRow[]>();
  for (const row of result.rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row]);

  const folded = [...byDay].map(([day, rows]) => ({
    day,
    groups: foldDuplicates(
      rows.map((row) => ({
        ...row,
        id: Number(row.id),
        centroid: row.centroid ? (JSON.parse(row.centroid) as number[]) : null,
      })),
      filters.limit,
    ),
  }));
  const details = await loadDetails(
    db,
    folded.flatMap((d) => d.groups.map((g) => g.kept.id)),
  );

  return {
    from: filters.from,
    to: filters.to,
    days: folded
      .map(({ day, groups }) => {
        const events: ApiEvent[] = [];
        for (const group of groups) {
          const event = toApiEvent(group.kept, details, events.length + 1, group.related);
          if (event) events.push(event);
        }
        return { day, events };
      })
      .filter((day) => day.events.length > 0),
  };
}

export async function findEventById(db: Database, id: number): Promise<ApiEvent | null> {
  const result = await db.execute<EventRow>(
    sql`SELECT ${EVENT_COLUMNS}, NULL AS rank FROM events e WHERE e.id = ${id}`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return toApiEvent(
    { ...row, id: Number(row.id) },
    await loadDetails(db, [Number(row.id)]),
    null,
    [],
  );
}

interface Details {
  articles: Map<number, ApiArticle[]>;
  themes: Map<number, string[]>;
  zones: Map<number, string[]>;
}

async function loadDetails(db: Database, ids: number[]): Promise<Details> {
  const details: Details = { articles: new Map(), themes: new Map(), zones: new Map() };
  if (ids.length === 0) return details;

  // Règle n° 1 : seules les sources non exclues sont affichées, articles d'information uniquement.
  const articleRows = await db.execute<ArticleRow>(sql`
    SELECT a.id, a.event_id, a.title, a.url, a.language, a.published_at, a.agency,
           s.name, s.kind, s.policy, s.independence_group
    FROM articles a JOIN sources s ON s.id = a.source_id
    WHERE a.event_id IN ${ids} AND s.policy <> 'excluded' AND a.content_type = 'news'
    ORDER BY a.published_at, a.id`);
  for (const row of articleRows.rows) {
    const eventId = Number(row.event_id);
    const article: ApiArticle = {
      id: Number(row.id),
      title: row.title,
      url: row.url,
      language: row.language,
      publishedAt: new Date(row.published_at).toISOString(),
      agency: row.agency,
      source: { name: row.name, kind: row.kind, policy: row.policy, group: row.independence_group },
      usedInSummary: false,
    };
    details.articles.set(eventId, [...(details.articles.get(eventId) ?? []), article]);
  }

  const labels = await db.execute<{ event_id: number | string; slug: string; kind: string }>(sql`
    SELECT et.event_id, t.slug, 'theme' AS kind FROM event_themes et JOIN themes t ON t.id = et.theme_id
    WHERE et.event_id IN ${ids}
    UNION ALL
    SELECT ez.event_id, z.slug, 'zone' AS kind FROM event_zones ez JOIN zones z ON z.id = ez.zone_id
    WHERE ez.event_id IN ${ids}`);
  for (const row of labels.rows) {
    const target = row.kind === "theme" ? details.themes : details.zones;
    const eventId = Number(row.event_id);
    target.set(eventId, [...(target.get(eventId) ?? []), row.slug]);
  }
  return details;
}

function toApiEvent(
  row: Omit<EventRow, "id" | "centroid"> & { id: number },
  details: Details,
  rank: number | null,
  related: Array<{ id: number; title: string; article_count: number }>,
): ApiEvent | null {
  const articles = details.articles.get(row.id) ?? [];
  // Pas de source, pas d'affichage.
  if (articles.length === 0) return null;

  const sentences = row.summary_status === "ok" ? (row.summary ?? []) : [];
  const used = new Set(sentences.flatMap((sentence) => sentence.articleIds));
  const known = new Set(articles.map((article) => article.id));

  return {
    id: row.id,
    day: row.day,
    rank,
    title: row.title,
    titleFromSource: row.title_from_source,
    titleSourceName: row.title_from_source
      ? (articles.find((article) => article.title === row.title)?.source.name ?? null)
      : null,
    verification: row.verification,
    independentOrigins: row.independent_origins,
    articleCount: articles.length,
    themes: (details.themes.get(row.id) ?? []).filter(isThemeSlug),
    zones: (details.zones.get(row.id) ?? []).filter(isZoneSlug),
    firstPublishedAt: new Date(row.first_published_at).toISOString(),
    lastPublishedAt: new Date(row.last_published_at).toISOString(),
    summary: {
      status: row.summary_status,
      // Une phrase dont aucune source n'est affichable n'est pas montrée.
      sentences: sentences.filter((sentence) => sentence.articleIds.some((id) => known.has(id))),
    },
    articles: articles.map((article) => ({ ...article, usedInSummary: used.has(article.id) })),
    related: related.map((event) => ({
      id: Number(event.id),
      title: event.title,
      articleCount: Number(event.article_count),
    })),
  };
}

export async function findSources(db: Database): Promise<ApiSourceInfo[]> {
  const result = await db.execute<{
    slug: string;
    name: string;
    homepage_url: string;
    kind: "media" | "official";
    policy: "open" | "links_only" | "excluded";
    policy_checked_at: Date | null;
    feed_allowed: boolean | null;
    ai_bots_blocked: string[] | null;
    tdm_reserved: boolean | null;
    error: string | null;
  }>(sql`
    SELECT s.slug, s.name, s.homepage_url, s.kind, s.policy, s.policy_checked_at,
           c.feed_allowed, c.ai_bots_blocked, c.tdm_reserved, c.error
    FROM sources s
    LEFT JOIN LATERAL (
      SELECT * FROM policy_checks pc WHERE pc.source_id = s.id ORDER BY pc.checked_at DESC LIMIT 1
    ) c ON true
    WHERE s.active
    ORDER BY CASE s.policy WHEN 'open' THEN 0 WHEN 'links_only' THEN 1 ELSE 2 END, s.name`);
  return result.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    homepageUrl: row.homepage_url,
    kind: row.kind,
    policy: row.policy,
    policyCheckedAt: row.policy_checked_at ? new Date(row.policy_checked_at).toISOString() : null,
    evidence:
      row.feed_allowed === null
        ? null
        : {
            feedAllowed: row.feed_allowed,
            aiBotsBlocked: row.ai_bots_blocked ?? [],
            tdmReserved: row.tdm_reserved ?? false,
            error: row.error,
          },
  }));
}

export async function findStats(db: Database, day: string): Promise<ApiStats> {
  const result = await db.execute<Record<string, string | number>>(sql`
    SELECT
      (SELECT count(*) FROM events WHERE day = ${day}) AS events,
      (SELECT count(*) FROM events WHERE day = ${day} AND verification = 'confirmed') AS confirmed,
      (SELECT count(*) FILTER (WHERE content_type = 'news') FROM articles
         WHERE (published_at AT TIME ZONE 'Europe/Paris')::date = ${day}) AS articles,
      (SELECT count(*) FILTER (WHERE content_type = 'opinion') FROM articles
         WHERE (published_at AT TIME ZONE 'Europe/Paris')::date = ${day}) AS opinion,
      (SELECT count(*) FILTER (WHERE content_type = 'sponsored') FROM articles
         WHERE (published_at AT TIME ZONE 'Europe/Paris')::date = ${day}) AS sponsored,
      (SELECT count(*) FROM sources WHERE active AND policy = 'open') AS open,
      (SELECT count(*) FROM sources WHERE active AND policy = 'links_only') AS links_only,
      (SELECT count(*) FROM sources WHERE active AND policy = 'excluded') AS excluded`);
  const row = result.rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    day,
    events: n("events"),
    confirmed: n("confirmed"),
    articles: n("articles"),
    sources: { open: n("open"), links_only: n("links_only"), excluded: n("excluded") },
    excluded: { opinion: n("opinion"), sponsored: n("sponsored") },
  };
}
