import type { ThemeSlug, ZoneSlug } from "@sourcee/shared";
import { pathSegments } from "./normalize";
import { normalizeForMatch } from "./text";

/** Mots de rubrique (URL ou catégories du flux) associés à chaque thème. */
const THEME_WORDS: Record<ThemeSlug, readonly string[]> = {
  international: ["international", "monde", "world", "world-news", "global"],
  politique: ["politique", "politics", "elections", "election"],
  economie: [
    "economie",
    "economy",
    "business",
    "finance",
    "markets",
    "marches",
    "entreprises",
    "emploi",
  ],
  science: ["science", "sciences", "espace", "space"],
  tech: ["tech", "technology", "technologie", "technologies", "pixels", "numerique", "digital"],
  sport: ["sport", "sports", "football", "rugby", "tennis", "cyclisme"],
  environnement: [
    "environnement",
    "environment",
    "planete",
    "climate",
    "climat",
    "climate-crisis",
    "ecologie",
    "biodiversite",
  ],
  sante: ["sante", "health", "medecine"],
  societe: ["societe", "society", "justice", "education"],
  culture: ["culture", "arts", "cinema", "musique", "music", "livres", "books"],
};

const ZONE_WORDS: Record<ZoneSlug, readonly string[]> = {
  monde: [],
  europe: [
    "europe",
    "union-europeenne",
    "european-union",
    "uk",
    "uk-news",
    "royaume-uni",
    "ukraine",
    "russie",
    "russia",
    "allemagne",
    "germany",
  ],
  france: ["france", "paris"],
  afrique: ["afrique", "africa"],
  ameriques: [
    "ameriques",
    "americas",
    "us-canada",
    "us-news",
    "latin-america",
    "amerique-latine",
    "etats-unis",
    "canada",
    "mexique",
    "mexico",
    "bresil",
    "brazil",
  ],
  "asie-pacifique": [
    "asie-pacifique",
    "asia-pacific",
    "asia",
    "asie",
    "china",
    "chine",
    "hong-kong",
    "singapore",
    "taiwan",
    "japon",
    "japan",
    "inde",
    "india",
    "australia",
  ],
  "moyen-orient": [
    "moyen-orient",
    "middle-east",
    "israel",
    "iran",
    "gaza",
    "syrie",
    "syria",
    "liban",
    "lebanon",
  ],
};

function invert<K extends string>(map: Record<K, readonly string[]>): Map<string, K> {
  const result = new Map<string, K>();
  for (const [key, words] of Object.entries(map) as [K, readonly string[]][]) {
    for (const word of words) result.set(word, key);
  }
  return result;
}

const THEME_BY_WORD = invert(THEME_WORDS);
const ZONE_BY_WORD = invert(ZONE_WORDS);

/** Mots seuls et suites de 2 ou 3 mots joints par un tiret (« middle-east »). */
function withJoins(parts: string[]): string[] {
  const words = [...parts];
  for (let size = 2; size <= 3; size++) {
    for (let i = 0; i + size <= parts.length; i++) words.push(parts.slice(i, i + size).join("-"));
  }
  return words;
}

/** Mots des rubriques de l'URL ; dates, identifiants et titres d'articles sont ignorés. */
export function sectionWords(url: string): string[] {
  const words: string[] = [];
  for (const segment of pathSegments(url)) {
    const base = segment.replace(/[-_]\d+(\.html?)?$/, "").replace(/\.html?$/, "");
    if (!base || /\d/.test(base) || base.split("-").length > 3) continue;
    words.push(...withJoins(base.split("-").filter(Boolean)));
  }
  return words;
}

export function categoryWords(category: string): string[] {
  return withJoins(
    normalizeForMatch(category)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

export interface Hints {
  themes: ThemeSlug[];
  zones: ZoneSlug[];
}

/** Thèmes et zones probables d'un article, d'après sa rubrique, ses catégories et son flux. */
export function extractHints(input: {
  url: string;
  categories: string[];
  defaultTheme?: ThemeSlug | null;
  defaultZone?: ZoneSlug | null;
}): Hints {
  const themes = new Set<ThemeSlug>(input.defaultTheme ? [input.defaultTheme] : []);
  const zones = new Set<ZoneSlug>(input.defaultZone ? [input.defaultZone] : []);
  const words = [...sectionWords(input.url), ...input.categories.flatMap(categoryWords)];
  for (const word of words) {
    const theme = THEME_BY_WORD.get(word);
    if (theme) themes.add(theme);
    const zone = ZONE_BY_WORD.get(word);
    if (zone) zones.add(zone);
  }
  return { themes: [...themes], zones: [...zones] };
}
