import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

/** Dimension des embeddings multilingues calculés localement. */
export const EMBEDDING_DIMENSIONS = 384;

/** Une phrase de résumé et les articles qui l'appuient. */
export interface SummarySentence {
  text: string;
  articleIds: number[];
}

/** Une phrase écartée par les contrôles automatiques, avec la raison. */
export interface RejectedSentence {
  text: string;
  reason: string;
}

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const sourceKind = pgEnum("source_kind", ["media", "official"]);
export const usagePolicy = pgEnum("usage_policy", ["open", "links_only", "excluded"]);
export const contentType = pgEnum("content_type", ["news", "opinion", "sponsored"]);
export const summaryStatus = pgEnum("summary_status", [
  "pending",
  "ok",
  "insufficient",
  "unavailable",
  "error",
]);
export const verification = pgEnum("verification", ["confirmed", "single_source"]);

export const themes = pgTable("themes", {
  id: smallserial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
});

export const zones = pgTable("zones", {
  id: smallserial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  parentId: smallint("parent_id").references((): AnyPgColumn => zones.id),
});

export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url").notNull(),
  kind: sourceKind("kind").notNull(),
  /** Deux sources du même groupe (ou reprenant la même agence) ne comptent que pour une origine. */
  independenceGroup: text("independence_group").notNull(),
  /** Tant que le premier contrôle de conformité n'a pas eu lieu, rien n'est collecté. */
  policy: usagePolicy("policy").notNull().default("excluded"),
  policyCheckedAt: timestamptz("policy_checked_at"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const policyChecks = pgTable(
  "policy_checks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    checkedAt: timestamptz("checked_at").notNull().defaultNow(),
    feedAllowed: boolean("feed_allowed").notNull(),
    aiBotsBlocked: text("ai_bots_blocked")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    tdmReserved: boolean("tdm_reserved").notNull(),
    result: usagePolicy("result").notNull(),
    error: text("error"),
  },
  (t) => [index("policy_checks_source_idx").on(t.sourceId, t.checkedAt)],
);

export const feeds = pgTable("feeds", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  url: text("url").notNull().unique(),
  language: varchar("language", { length: 2 }).notNull(),
  defaultThemeId: smallint("default_theme_id").references(() => themes.id),
  defaultZoneId: smallint("default_zone_id").references(() => zones.id),
  etag: text("etag"),
  lastModified: text("last_modified"),
  lastFetchedAt: timestamptz("last_fetched_at"),
  consecutiveErrors: smallint("consecutive_errors").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull(),
    httpStatus: smallint("http_status"),
    itemsSeen: integer("items_seen").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("fetch_runs_feed_idx").on(t.feedId, t.startedAt)],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** Journée de l'événement, fuseau Europe/Paris. */
    day: date("day").notNull(),
    title: text("title").notNull(),
    /** Vrai tant que le titre affiché est celui d'un article (attribué), faute de résumé. */
    titleFromSource: boolean("title_from_source").notNull().default(true),
    summary: jsonb("summary").$type<SummarySentence[]>(),
    summaryStatus: summaryStatus("summary_status").notNull().default("pending"),
    verification: verification("verification").notNull().default("single_source"),
    independentOrigins: smallint("independent_origins").notNull().default(0),
    articleCount: smallint("article_count").notNull().default(0),
    score: real("score").notNull().default(0),
    firstPublishedAt: timestamptz("first_published_at").notNull(),
    lastPublishedAt: timestamptz("last_published_at").notNull(),
    centroid: vector("centroid", { dimensions: EMBEDDING_DIMENSIONS }),
    /** Titre, résumé et titres des articles, pour la recherche par mot-clé. */
    searchText: text("search_text").notNull().default(""),
    search: tsvector("search").generatedAlwaysAs(
      sql`to_tsvector('simple', immutable_unaccent(search_text))`,
    ),
    summarizedAt: timestamptz("summarized_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_day_score_idx").on(t.day, t.score.desc()),
    index("events_search_idx").using("gin", t.search),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    eventId: bigint("event_id", { mode: "number" }).references(() => events.id, {
      onDelete: "set null",
    }),
    url: text("url").notNull().unique(),
    guid: text("guid"),
    title: text("title").notNull(),
    /** Chapô du flux : sources « open » seulement, usage interne, jamais affiché. */
    excerpt: text("excerpt"),
    language: varchar("language", { length: 2 }).notNull(),
    publishedAt: timestamptz("published_at").notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
    contentType: contentType("content_type").notNull().default("news"),
    /** Agence de presse reprise (AFP, Reuters…) si elle est détectée. */
    agency: text("agency"),
    /** Indices de thème et de zone tirés de l'URL et des catégories du flux. */
    themeHints: text("theme_hints")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    zoneHints: text("zone_hints")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
  },
  (t) => [
    index("articles_published_idx").on(t.publishedAt.desc()),
    index("articles_event_idx").on(t.eventId),
  ],
);

export const summaries = pgTable(
  "summaries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: bigint("event_id", { mode: "number" })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputArticleIds: bigint("input_article_ids", { mode: "number" }).array().notNull(),
    output: jsonb("output"),
    rejectedSentences: jsonb("rejected_sentences")
      .$type<RejectedSentence[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: summaryStatus("status").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("summaries_event_idx").on(t.eventId)],
);

export const eventThemes = pgTable(
  "event_themes",
  {
    eventId: bigint("event_id", { mode: "number" })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    themeId: smallint("theme_id")
      .notNull()
      .references(() => themes.id),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.themeId] }),
    index("event_themes_theme_idx").on(t.themeId),
  ],
);

export const eventZones = pgTable(
  "event_zones",
  {
    eventId: bigint("event_id", { mode: "number" })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    zoneId: smallint("zone_id")
      .notNull()
      .references(() => zones.id),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.zoneId] }),
    index("event_zones_zone_idx").on(t.zoneId),
  ],
);
