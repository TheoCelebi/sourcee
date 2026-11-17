import Parser from "rss-parser";
import { cleanText, truncateAtSentence } from "./text";

/** Longueur maximale du chapô conservé (usage interne, jamais affiché). */
export const EXCERPT_MAX_LENGTH = 600;

export interface FeedItem {
  guid: string | null;
  link: string | null;
  title: string;
  excerpt: string;
  publishedAt: Date | null;
  categories: string[];
  creator: string | null;
}

const parser = new Parser({ customFields: { item: ["dc:date"] } });

/** Lit un flux RSS 2.0, RSS 1.0 (RDF) ou Atom. */
export async function parseFeed(xml: string): Promise<FeedItem[]> {
  const feed = await parser.parseString(xml);
  return feed.items.map((item) => {
    const raw = item as Parser.Item & { author?: unknown; "dc:date"?: string };
    return {
      guid: textOf(raw.guid),
      link: raw.link?.trim() || null,
      title: cleanText(raw.title),
      excerpt: truncateAtSentence(
        cleanText(raw.contentSnippet ?? raw.summary ?? raw.content),
        EXCERPT_MAX_LENGTH,
      ),
      publishedAt: parseDate(raw.isoDate ?? raw.pubDate ?? raw["dc:date"]),
      categories: ((raw.categories ?? []) as unknown[]).map(textOf).filter((c): c is string => !!c),
      creator: textOf(raw.creator) ?? textOf(raw.author),
    };
  });
}

/** Texte d'un champ qui peut être une chaîne ou un objet (`{ _: texte }`, `{ name }`). */
function textOf(value: unknown): string | null {
  if (typeof value === "string") return cleanText(value) || null;
  if (Array.isArray(value)) return textOf(value[0]);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textOf(record._ ?? record.name);
  }
  return null;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
