import { THEMES, ZONES } from "@sourcee/shared";
import { eq, sql } from "drizzle-orm";
import { CATALOG } from "./catalog";
import type { Database } from "./client";
import { feeds, sources, themes, zones } from "./schema";

export interface SeedReport {
  themes: number;
  zones: number;
  sources: number;
  feeds: number;
}

/** Insère ou met à jour les données de référence. Peut être relancé sans effet de bord. */
export async function seedDatabase(db: Database): Promise<SeedReport> {
  return db.transaction(async (tx) => {
    await tx
      .insert(themes)
      .values(THEMES.map(({ slug, label }) => ({ slug, label })))
      .onConflictDoUpdate({ target: themes.slug, set: { label: sql`excluded.label` } });

    await tx
      .insert(zones)
      .values(ZONES.map(({ slug, label }) => ({ slug, label })))
      .onConflictDoUpdate({ target: zones.slug, set: { label: sql`excluded.label` } });

    const zoneIds = new Map(
      (await tx.select({ id: zones.id, slug: zones.slug }).from(zones)).map((z) => [z.slug, z.id]),
    );
    const themeIds = new Map(
      (await tx.select({ id: themes.id, slug: themes.slug }).from(themes)).map((t) => [
        t.slug,
        t.id,
      ]),
    );

    for (const zone of ZONES) {
      const parentId = zone.parent ? (zoneIds.get(zone.parent) ?? null) : null;
      await tx.update(zones).set({ parentId }).where(eq(zones.slug, zone.slug));
    }

    let feedCount = 0;
    for (const source of CATALOG) {
      const values = {
        slug: source.slug,
        name: source.name,
        homepageUrl: source.homepageUrl,
        kind: source.kind,
        independenceGroup: source.independenceGroup,
      };
      const [row] = await tx
        .insert(sources)
        .values(values)
        .onConflictDoUpdate({ target: sources.slug, set: values })
        .returning({ id: sources.id });
      if (!row) throw new Error(`Insertion impossible pour la source ${source.slug}`);

      for (const feed of source.feeds) {
        const feedValues = {
          sourceId: row.id,
          url: feed.url,
          language: feed.language,
          defaultThemeId: feed.theme ? (themeIds.get(feed.theme) ?? null) : null,
          defaultZoneId: feed.zone ? (zoneIds.get(feed.zone) ?? null) : null,
        };
        await tx
          .insert(feeds)
          .values(feedValues)
          .onConflictDoUpdate({ target: feeds.url, set: feedValues });
        feedCount += 1;
      }
    }

    return {
      themes: THEMES.length,
      zones: ZONES.length,
      sources: CATALOG.length,
      feeds: feedCount,
    };
  });
}
