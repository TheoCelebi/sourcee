CREATE TYPE "public"."content_type" AS ENUM('news', 'opinion', 'sponsored');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('media', 'official');--> statement-breakpoint
CREATE TYPE "public"."summary_status" AS ENUM('pending', 'ok', 'insufficient', 'unavailable', 'error');--> statement-breakpoint
CREATE TYPE "public"."usage_policy" AS ENUM('open', 'links_only', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('confirmed', 'single_source');--> statement-breakpoint
CREATE TABLE "articles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"feed_id" integer NOT NULL,
	"event_id" bigint,
	"url" text NOT NULL,
	"guid" text,
	"title" text NOT NULL,
	"excerpt" text,
	"language" varchar(2) NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_type" "content_type" DEFAULT 'news' NOT NULL,
	"agency" text,
	"theme_hints" text[] DEFAULT '{}'::text[] NOT NULL,
	"zone_hints" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(384),
	CONSTRAINT "articles_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "event_themes" (
	"event_id" bigint NOT NULL,
	"theme_id" smallint NOT NULL,
	CONSTRAINT "event_themes_event_id_theme_id_pk" PRIMARY KEY("event_id","theme_id")
);
--> statement-breakpoint
CREATE TABLE "event_zones" (
	"event_id" bigint NOT NULL,
	"zone_id" smallint NOT NULL,
	CONSTRAINT "event_zones_event_id_zone_id_pk" PRIMARY KEY("event_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"title" text NOT NULL,
	"title_from_source" boolean DEFAULT true NOT NULL,
	"summary" jsonb,
	"summary_status" "summary_status" DEFAULT 'pending' NOT NULL,
	"verification" "verification" DEFAULT 'single_source' NOT NULL,
	"independent_origins" smallint DEFAULT 0 NOT NULL,
	"article_count" smallint DEFAULT 0 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"first_published_at" timestamp with time zone NOT NULL,
	"last_published_at" timestamp with time zone NOT NULL,
	"centroid" vector(384),
	"search_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(search_text))) STORED,
	"summarized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"url" text NOT NULL,
	"language" varchar(2) NOT NULL,
	"default_theme_id" smallint,
	"default_zone_id" smallint,
	"etag" text,
	"last_modified" text,
	"last_fetched_at" timestamp with time zone,
	"consecutive_errors" smallint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "feeds_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"feed_id" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer NOT NULL,
	"http_status" smallint,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"items_new" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "policy_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feed_allowed" boolean NOT NULL,
	"ai_bots_blocked" text[] DEFAULT '{}'::text[] NOT NULL,
	"tdm_reserved" boolean NOT NULL,
	"result" "usage_policy" NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"homepage_url" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"independence_group" text NOT NULL,
	"policy" "usage_policy" DEFAULT 'excluded' NOT NULL,
	"policy_checked_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" bigint NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_article_ids" bigint[] NOT NULL,
	"output" jsonb,
	"rejected_sentences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "summary_status" NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	CONSTRAINT "themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"parent_id" smallint,
	CONSTRAINT "zones_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_themes" ADD CONSTRAINT "event_themes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_themes" ADD CONSTRAINT "event_themes_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_default_theme_id_themes_id_fk" FOREIGN KEY ("default_theme_id") REFERENCES "public"."themes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_default_zone_id_zones_id_fk" FOREIGN KEY ("default_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD CONSTRAINT "fetch_runs_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_checks" ADD CONSTRAINT "policy_checks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_parent_id_zones_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_event_idx" ON "articles" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_themes_theme_idx" ON "event_themes" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "event_zones_zone_idx" ON "event_zones" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "events_day_score_idx" ON "events" USING btree ("day","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_search_idx" ON "events" USING gin ("search");--> statement-breakpoint
CREATE INDEX "fetch_runs_feed_idx" ON "fetch_runs" USING btree ("feed_id","started_at");--> statement-breakpoint
CREATE INDEX "policy_checks_source_idx" ON "policy_checks" USING btree ("source_id","checked_at");--> statement-breakpoint
CREATE INDEX "summaries_event_idx" ON "summaries" USING btree ("event_id");