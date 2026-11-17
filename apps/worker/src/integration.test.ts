import {
  articles,
  createDb,
  type DbHandle,
  events,
  feeds,
  fetchRuns,
  migrateDatabase,
  policyChecks,
  seedDatabase,
  sources,
  summaries,
} from "@sourcee/db";
import { loadRootEnv } from "@sourcee/shared/node";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clusterArticles } from "./cluster/run";
import { collectFeed, loadCollectableFeeds } from "./collect/collect";
import { runComplianceCheck } from "./compliance/check";
import { SourceInspector } from "./compliance/inspector";
import type { SummaryModel } from "./summarize/model";
import { summarizeEvents } from "./summarize/run";
import { fakeEmbedder, fakeHttp, rssFeed } from "./testing";

loadRootEnv();
const testUrl = process.env.DATABASE_URL_TEST;
const UA = "Mozilla/5.0 (compatible; rss-collector/0.1)";

describe.skipIf(!testUrl)("worker et base de données (intégration)", () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(testUrl as string);
    await migrateDatabase(handle.db);
    await handle.db.execute(sql`
      TRUNCATE articles, events, summaries, event_themes, event_zones, fetch_runs,
               policy_checks, feeds, sources, themes, zones RESTART IDENTITY CASCADE`);
    await seedDatabase(handle.db);
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("calcule le niveau d'usage de chaque source", async () => {
    const http = fakeHttp({
      "https://www.lemonde.fr/robots.txt": { status: 200, body: "User-agent: GPTBot\nDisallow: /" },
      "https://www.francetvinfo.fr/.well-known/tdmrep.json": {
        status: 200,
        body: '{"location":"/","tdm-reservation":1}',
      },
      "https://www.bbc.com/robots.txt": { status: 403 },
      "https://www.rfi.fr/robots.txt": { status: 503 },
    });
    const report = await runComplianceCheck(handle.db, new SourceInspector(http, UA));

    const policies = Object.fromEntries(
      (await handle.db.select({ slug: sources.slug, policy: sources.policy }).from(sources)).map(
        (row) => [row.slug, row.policy],
      ),
    );
    expect(policies["le-monde"]).toBe("links_only");
    expect(policies.franceinfo).toBe("excluded");
    expect(policies.bbc).toBe("excluded");
    expect(policies["onu-info"]).toBe("open");
    // Panne temporaire : le niveau initial (exclu) est conservé et l'échec est signalé.
    expect(policies.rfi).toBe("excluded");
    expect(report.failures.map((failure) => failure.slug)).toEqual(["rfi"]);
    expect(await handle.db.$count(policyChecks)).toBe(24);
  });

  it("collecte un flux, dédoublonne et respecte les requêtes conditionnelles", async () => {
    const [onu] = (await loadCollectableFeeds(handle.db)).filter((feed) =>
      feed.url.startsWith("https://news.un.org/"),
    );
    if (!onu) throw new Error("flux ONU Info absent");
    const now = new Date();
    const body = rssFeed([
      {
        title: "Le Conseil de sécurité adopte une résolution",
        link: "https://news.un.org/fr/story/2026/11/1",
        date: new Date(now.getTime() - 3_600_000),
        description: "La résolution a été adoptée par 13 voix.",
      },
      {
        title: "Tribune : repenser le multilatéralisme",
        link: "https://news.un.org/fr/story/2026/11/2",
        date: new Date(now.getTime() - 7_200_000),
      },
    ]);
    const http = fakeHttp((_url, request) =>
      request.headers?.["If-None-Match"] === '"v1"'
        ? { status: 304 }
        : { status: 200, body, headers: { etag: '"v1"' } },
    );
    const options = { http, userAgent: UA, timeoutMs: 1000, maxAgeHours: 72 };

    const first = await collectFeed(handle.db, onu, options);
    expect(first).toMatchObject({ status: 200, itemsSeen: 2, itemsNew: 2, error: null });

    const [feedRow] = await handle.db.select().from(feeds).where(eq(feeds.id, onu.id));
    expect(feedRow?.etag).toBe('"v1"');
    const second = await collectFeed(handle.db, { ...onu, etag: feedRow?.etag ?? null }, options);
    expect(second).toMatchObject({ status: 304, notModified: true, itemsNew: 0 });

    const third = await collectFeed(handle.db, onu, options);
    expect(third).toMatchObject({ status: 200, itemsSeen: 2, itemsNew: 0 });

    const stored = await handle.db
      .select({ title: articles.title, excerpt: articles.excerpt, type: articles.contentType })
      .from(articles)
      .orderBy(articles.publishedAt);
    expect(stored).toEqual([
      { title: "Tribune : repenser le multilatéralisme", excerpt: null, type: "opinion" },
      {
        title: "Le Conseil de sécurité adopte une résolution",
        excerpt: "La résolution a été adoptée par 13 voix.",
        type: "news",
      },
    ]);
    expect(await handle.db.$count(fetchRuns, eq(fetchRuns.feedId, onu.id))).toBe(3);
  });

  it("regroupe les articles en événements et compte les origines indépendantes", async () => {
    const now = new Date();
    const sourceIds = new Map(
      (await handle.db.select({ id: sources.id, slug: sources.slug }).from(sources)).map((s) => [
        s.slug,
        s.id,
      ]),
    );
    const insert = async (
      slug: string,
      title: string,
      minutesAgo: number,
      agency: string | null = null,
    ) => {
      const sourceId = sourceIds.get(slug) as number;
      const [feed] = await handle.db
        .select({ id: feeds.id })
        .from(feeds)
        .where(eq(feeds.sourceId, sourceId));
      await handle.db.insert(articles).values({
        sourceId,
        feedId: feed?.id as number,
        url: `https://exemple.org/${slug}/${minutesAgo}`,
        title,
        language: "fr",
        publishedAt: new Date(now.getTime() - minutesAgo * 60_000),
        agency,
      });
    };
    // Le Monde (liens seulement), The Guardian et Africanews (ouverts dans ce scénario).
    await insert("le-monde", "Pont de Crimée : frappe ukrainienne", 50);
    await insert("the-guardian", "Crimée : le pont touché par des drones", 40);
    await insert("africanews", "Crimée : le pont endommagé", 30, "AFP");
    await insert("le-monde", "Rougeole : les États-Unis perdent leur statut", 20);

    const embedder = fakeEmbedder(["crimée", "rougeole", "conseil de sécurité"]);
    const first = await clusterArticles(handle.db, { embedder, maxAgeHours: 72, now });
    expect(first).toMatchObject({ embedded: 5, created: 3, joined: 0 });

    const stored = await handle.db
      .select({
        title: events.title,
        articles: events.articleCount,
        origins: events.independentOrigins,
        verification: events.verification,
      })
      .from(events)
      .orderBy(events.score);
    expect(stored).toEqual([
      // Source officielle seule : aucune origine indépendante.
      {
        title: "Le Conseil de sécurité adopte une résolution",
        articles: 1,
        origins: 0,
        verification: "single_source",
      },
      {
        title: "Rougeole : les États-Unis perdent leur statut",
        articles: 1,
        origins: 1,
        verification: "single_source",
      },
      // Le Monde, The Guardian et une dépêche AFP reprise par Africanews : trois origines.
      {
        title: expect.stringContaining("Crimée"),
        articles: 3,
        origins: 3,
        verification: "confirmed",
      },
    ]);

    // Un nouvel article rejoint l'événement existant au lieu d'en créer un autre.
    await insert("the-guardian", "Crimée : premières images du pont", 10);
    const second = await clusterArticles(handle.db, { embedder, maxAgeHours: 72, now });
    expect(second).toMatchObject({ embedded: 1, created: 0, joined: 1 });
    const [crimea] = await handle.db
      .select({ articles: events.articleCount, origins: events.independentOrigins })
      .from(events)
      .where(sql`${events.title} LIKE '%Crimée%'`);
    expect(crimea).toEqual({ articles: 4, origins: 3 });
  });

  it("résume à partir des seules sources ouvertes et contrôle chaque phrase", async () => {
    const prompts: string[] = [];
    const model: SummaryModel = {
      name: "modele-factice",
      async summarize(prompt) {
        prompts.push(prompt);
        if (!prompt.includes("Crimée")) {
          return {
            kind: "ok",
            summary: { status: "insufficient", title: "", sentences: [], themes: [], zones: [] },
            inputTokens: 10,
            outputTokens: 5,
          };
        }
        return {
          kind: "ok",
          summary: {
            status: "ok",
            title: "Le pont de Crimée touché par des drones",
            sentences: [
              {
                text: "Selon The Guardian, le pont de Crimée a été touché par des drones.",
                sources: [1],
              },
              { text: "D'après Africanews, le pont est endommagé.", sources: [2] },
              { text: "Le bilan s'élève à 12 morts.", sources: [1] },
            ],
            themes: ["international"],
            zones: ["europe"],
          },
          inputTokens: 100,
          outputTokens: 50,
        };
      },
    };

    const report = await summarizeEvents(handle.db, { model, days: 2, topPerDay: 10 });
    expect(report).toMatchObject({ summarized: 1, insufficient: 1, unavailable: 1, errors: 0 });
    // Le Monde ne laisse que titres et liens : son titre n'est jamais envoyé au modèle.
    expect(prompts.join("\n")).not.toContain("frappe ukrainienne");

    const [crimea] = await handle.db
      .select({
        id: events.id,
        title: events.title,
        titleFromSource: events.titleFromSource,
        status: events.summaryStatus,
        summary: events.summary,
      })
      .from(events)
      .where(sql`${events.title} LIKE '%Crimée%'`);
    expect(crimea).toMatchObject({
      title: "Le pont de Crimée touché par des drones",
      titleFromSource: false,
      status: "ok",
    });
    expect(crimea?.summary?.map((sentence) => sentence.text)).toEqual([
      "Selon The Guardian, le pont de Crimée a été touché par des drones.",
      "D'après Africanews, le pont est endommagé.",
    ]);
    const [history] = await handle.db
      .select({ rejected: summaries.rejectedSentences })
      .from(summaries)
      .where(eq(summaries.eventId, crimea?.id as number));
    expect(history?.rejected).toEqual([
      { text: "Le bilan s'élève à 12 morts.", reason: "nombre absent des sources citées : 12" },
    ]);
    const statuses = await handle.db
      .select({ title: events.title, status: events.summaryStatus })
      .from(events)
      .orderBy(events.score);
    expect(statuses.map((row) => row.status)).toEqual(["insufficient", "unavailable", "ok"]);

    // Sources inchangées : aucun nouvel appel au modèle.
    const again = await summarizeEvents(handle.db, { model, days: 2, topPerDay: 10 });
    expect(again).toMatchObject({ summarized: 0, skipped: 2, unavailable: 1 });
    expect(prompts).toHaveLength(2);
  });
});
