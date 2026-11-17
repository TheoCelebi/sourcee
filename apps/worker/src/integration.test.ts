import {
  articles,
  createDb,
  type DbHandle,
  feeds,
  fetchRuns,
  migrateDatabase,
  policyChecks,
  seedDatabase,
  sources,
} from "@sourcee/db";
import { loadRootEnv } from "@sourcee/shared/node";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectFeed, loadCollectableFeeds } from "./collect/collect";
import { runComplianceCheck } from "./compliance/check";
import { SourceInspector } from "./compliance/inspector";
import { fakeHttp, rssFeed } from "./testing";

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
});
