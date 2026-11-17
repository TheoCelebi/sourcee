import {
  articles,
  createDb,
  type DbHandle,
  EMBEDDING_DIMENSIONS,
  eventThemes,
  eventZones,
  events,
  feeds,
  migrateDatabase,
  seedDatabase,
  sources,
  themes,
  zones,
} from "@sourcee/db";
import type { ApiEvent, ApiEventsResponse } from "@sourcee/shared";
import { loadRootEnv } from "@sourcee/shared/node";
import { eq, inArray, sql } from "drizzle-orm";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";

loadRootEnv();
const testUrl = process.env.DATABASE_URL_TEST;
const DAY = "2026-11-17";
const PREVIOUS_DAY = "2026-11-16";

/** Vecteur unitaire sur l'axe `index`, légèrement incliné vers l'axe suivant. */
function axis(index: number, tilt = 0): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[index] = 1;
  vector[index + 1] = tilt;
  const norm = Math.hypot(1, tilt);
  return vector.map((value) => value / norm);
}

describe.skipIf(!testUrl)("API REST (intégration)", () => {
  let handle: DbHandle;
  let app: Express;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    handle = createDb(testUrl as string);
    const { db } = handle;
    await migrateDatabase(db);
    await db.execute(sql`
      TRUNCATE articles, events, summaries, event_themes, event_zones, fetch_runs,
               policy_checks, feeds, sources, themes, zones RESTART IDENTITY CASCADE`);
    await seedDatabase(db);
    await db
      .update(sources)
      .set({ policy: "open" })
      .where(inArray(sources.slug, ["the-guardian", "africanews"]));
    await db.update(sources).set({ policy: "links_only" }).where(eq(sources.slug, "le-monde"));

    const sourceIds = new Map((await db.select().from(sources)).map((s) => [s.slug, s.id]));
    const feedIds = new Map((await db.select().from(feeds)).map((f) => [f.sourceId, f.id]));
    const themeIds = new Map((await db.select().from(themes)).map((t) => [t.slug, t.id]));
    const zoneIds = new Map((await db.select().from(zones)).map((z) => [z.slug, z.id]));

    const event = async (
      values: Partial<typeof events.$inferInsert> & { day: string; title: string; score: number },
    ) => {
      const [row] = await db
        .insert(events)
        .values({
          firstPublishedAt: new Date(`${values.day}T07:00:00Z`),
          lastPublishedAt: new Date(`${values.day}T09:00:00Z`),
          searchText: values.title,
          ...values,
        })
        .returning({ id: events.id });
      return row?.id as number;
    };
    let counter = 0;
    const article = async (
      slug: string,
      eventId: number | null,
      title: string,
      at: string,
      contentType: "news" | "opinion" = "news",
    ) => {
      const sourceId = sourceIds.get(slug) as number;
      const [row] = await db
        .insert(articles)
        .values({
          sourceId,
          feedId: feedIds.get(sourceId) as number,
          eventId,
          url: `https://exemple.org/${slug}/${++counter}`,
          title,
          language: "fr",
          publishedAt: new Date(at),
          contentType,
        })
        .returning({ id: articles.id });
      return row?.id as number;
    };

    ids.crimea = await event({
      day: DAY,
      title: "Le pont de Crimée endommagé",
      titleFromSource: false,
      summaryStatus: "ok",
      verification: "confirmed",
      independentOrigins: 2,
      articleCount: 3,
      score: 40,
      centroid: axis(0),
    });
    ids.guardian = await article(
      "the-guardian",
      ids.crimea,
      "Crimea bridge hit by drones",
      `${DAY}T07:00:00Z`,
    );
    ids.lemonde = await article(
      "le-monde",
      ids.crimea,
      "Le pont de Crimée touché",
      `${DAY}T08:00:00Z`,
    );
    ids.franceinfo = await article(
      "franceinfo",
      ids.crimea,
      "Crimée : le pont frappé",
      `${DAY}T09:00:00Z`,
    );
    await db
      .update(events)
      .set({
        summary: [
          {
            text: "Selon The Guardian, le pont a été touché par des drones.",
            articleIds: [ids.guardian],
          },
          { text: "Phrase fondée sur une source exclue.", articleIds: [ids.franceinfo] },
        ],
      })
      .where(eq(events.id, ids.crimea));
    await db
      .insert(eventThemes)
      .values({ eventId: ids.crimea, themeId: themeIds.get("international") as number });
    await db
      .insert(eventZones)
      .values({ eventId: ids.crimea, zoneId: zoneIds.get("europe") as number });

    ids.duplicate = await event({
      day: DAY,
      title: "Crimea bridge damaged",
      articleCount: 1,
      score: 30,
      centroid: axis(0, 0.3),
    });
    await article("the-guardian", ids.duplicate, "Crimea bridge damaged", `${DAY}T10:00:00Z`);

    ids.elections = await event({
      day: DAY,
      title: "Élections municipales à Valbourg",
      summaryStatus: "unavailable",
      independentOrigins: 1,
      articleCount: 1,
      score: 20,
      centroid: axis(2),
    });
    await article(
      "le-monde",
      ids.elections,
      "Élections municipales à Valbourg",
      `${DAY}T11:00:00Z`,
    );
    await db
      .insert(eventThemes)
      .values({ eventId: ids.elections, themeId: themeIds.get("politique") as number });
    await db
      .insert(eventZones)
      .values({ eventId: ids.elections, zoneId: zoneIds.get("france") as number });

    ids.previous = await event({
      day: PREVIOUS_DAY,
      title: "Sommet sur l'eau",
      articleCount: 1,
      score: 10,
      centroid: axis(4),
    });
    await article("africanews", ids.previous, "Sommet sur l'eau", `${PREVIOUS_DAY}T10:00:00Z`);

    // Mieux classé, mais sa seule source est exclue : il ne doit jamais apparaître.
    ids.hidden = await event({
      day: DAY,
      title: "Événement sans source affichable",
      articleCount: 1,
      score: 50,
      centroid: axis(6),
    });
    await article("franceinfo", ids.hidden, "Événement sans source affichable", `${DAY}T12:00:00Z`);
    await article("le-monde", null, "Tribune : il faut agir", `${DAY}T13:00:00Z`, "opinion");

    app = createApp(db, { now: () => new Date(`${DAY}T12:00:00Z`) });
  });

  afterAll(async () => {
    await handle?.close();
  });

  const titles = (body: ApiEventsResponse) =>
    body.days.flatMap((day) => day.events.map((event) => event.title));

  it("renvoie l'édition du jour : classement, repli des doublons, sources affichables seulement", async () => {
    const response = await request(app).get("/api/events").expect(200);
    expect(response.headers["cache-control"]).toContain("max-age=60");
    const body = response.body as ApiEventsResponse;
    expect(body.days.map((day) => day.day)).toEqual([DAY]);

    const [crimea, elections] = body.days[0]?.events as ApiEvent[];
    expect(titles(body)).toEqual([
      "Le pont de Crimée endommagé",
      "Élections municipales à Valbourg",
    ]);
    expect(crimea).toMatchObject({
      rank: 1,
      verification: "confirmed",
      themes: ["international"],
      zones: ["europe"],
      articleCount: 2,
      related: [{ id: ids.duplicate, title: "Crimea bridge damaged", articleCount: 1 }],
    });
    expect(crimea?.articles.map((a) => [a.source.name, a.source.policy, a.usedInSummary])).toEqual([
      ["The Guardian", "open", true],
      ["Le Monde", "links_only", false],
    ]);
    expect(crimea?.summary).toEqual({
      status: "ok",
      sentences: [
        {
          text: "Selon The Guardian, le pont a été touché par des drones.",
          articleIds: [ids.guardian],
        },
      ],
    });
    expect(elections).toMatchObject({
      rank: 2,
      titleFromSource: true,
      titleSourceName: "Le Monde",
      summary: { status: "unavailable", sentences: [] },
    });
  });

  it.each([
    ["themes=politique", ["Élections municipales à Valbourg"]],
    ["zones=europe", ["Le pont de Crimée endommagé", "Élections municipales à Valbourg"]],
    ["zones=france", ["Élections municipales à Valbourg"]],
    ["q=elections", ["Élections municipales à Valbourg"]],
    ["q=crimee", ["Le pont de Crimée endommagé"]],
  ])("filtre : %s", async (query, expected) => {
    const response = await request(app).get(`/api/events?${query}`).expect(200);
    expect(titles(response.body as ApiEventsResponse)).toEqual(expected);
  });

  it("couvre une période, de la journée la plus récente à la plus ancienne", async () => {
    const response = await request(app)
      .get(`/api/events?from=${PREVIOUS_DAY}&to=${DAY}`)
      .expect(200);
    expect((response.body as ApiEventsResponse).days.map((day) => day.day)).toEqual([
      DAY,
      PREVIOUS_DAY,
    ]);
  });

  it("refuse des paramètres invalides avec un message explicite", async () => {
    const response = await request(app).get("/api/events?themes=meteo").expect(400);
    expect(response.body).toEqual({
      error: "Paramètres invalides",
      details: ["themes : thème inconnu « meteo »"],
    });
  });

  it("renvoie un événement par identifiant, ou une erreur claire", async () => {
    const found = await request(app).get(`/api/events/${ids.elections}`).expect(200);
    expect(found.body).toMatchObject({ id: ids.elections, rank: null });
    await request(app).get("/api/events/999999").expect(404);
    await request(app).get(`/api/events/${ids.hidden}`).expect(404);
    await request(app).get("/api/events/abc").expect(400);
  });

  it("expose les sources, les statistiques et l'état du service", async () => {
    const sourcesResponse = await request(app).get("/api/sources").expect(200);
    expect(sourcesResponse.body).toHaveLength(24);
    expect(sourcesResponse.body[0]).toMatchObject({ policy: "open", evidence: null });

    const stats = await request(app).get(`/api/stats?day=${DAY}`).expect(200);
    expect(stats.body).toEqual({
      day: DAY,
      events: 4,
      confirmed: 1,
      articles: 6,
      sources: { open: 2, links_only: 1, excluded: 21 },
      excluded: { opinion: 1, sponsored: 0 },
    });

    await request(app).get("/api/health").expect(200, { status: "ok" });
    await request(app).get("/api/inconnu").expect(404, { error: "Ressource introuvable" });
  });
});
