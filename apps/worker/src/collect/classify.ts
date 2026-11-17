import type { ContentType } from "@sourcee/db";
import { pathSegments } from "./normalize";
import { normalizeForMatch } from "./text";

const OPINION_SEGMENTS = new Set([
  "opinion",
  "opinions",
  "idees",
  "tribune",
  "tribunes",
  "editorial",
  "editoriaux",
  "edito",
  "editos",
  "chronique",
  "chroniques",
  "blog",
  "blogs",
  "debats",
  "commentisfree",
  "op-ed",
  "oped",
  "columnists",
  "point-de-vue",
]);

const SPONSORED_SEGMENTS = new Set([
  "partenaire",
  "partenaires",
  "sponsored",
  "sponsorise",
  "contenu-sponsorise",
  "publi-redactionnel",
  "publireportage",
  "brandvoice",
  "advertorial",
  "partner-content",
]);

const SPONSORED_TEXT =
  /contenu sponsoris|publi-?redactionnel|\bsponsoris|\bsponsored\b|partner content|en partenariat avec|brandvoice|advertorial|publireportage/;
const OPINION_TITLE =
  /^(tribune|editorial|edito|chronique|opinion|point de vue|op-ed|lettre ouverte)\s*[:|–—-]|^the guardian view on\b|\|\s*(opinion|letters?|editorial)\s*$/;
const OPINION_CATEGORY =
  /\b(opinion|opinions|tribunes?|idees|editorial|editoriaux|edito|chroniques?|commentary|comment is free|op-ed|point de vue|debats?)\b/;

export interface ClassifyInput {
  url: string;
  title: string;
  categories: string[];
}

/** Sépare les articles d'information des tribunes, éditoriaux et contenus sponsorisés. */
export function detectContentType({ url, title, categories }: ClassifyInput): ContentType {
  const segments = pathSegments(url);
  const normalizedTitle = normalizeForMatch(title);
  const normalizedCategories = categories.map(normalizeForMatch);

  if (
    segments.some((segment) => SPONSORED_SEGMENTS.has(segment)) ||
    SPONSORED_TEXT.test(normalizedTitle) ||
    normalizedCategories.some((category) => SPONSORED_TEXT.test(category))
  ) {
    return "sponsored";
  }
  if (
    segments.some((segment) => OPINION_SEGMENTS.has(segment)) ||
    OPINION_TITLE.test(normalizedTitle) ||
    normalizedCategories.some((category) => OPINION_CATEGORY.test(category))
  ) {
    return "opinion";
  }
  return "news";
}

const AGENCIES = ["AFP", "Reuters", "AP"] as const;
type Agency = (typeof AGENCIES)[number];

/** Champ auteur : toute mention d'une agence vaut reprise de dépêche. */
const AUTHOR_PATTERNS: Record<Agency, RegExp> = {
  AFP: /\bAFP\b|Agence France[- ]Presse/i,
  Reuters: /\bReuters\b/i,
  AP: /\bAP\b|Associated Press/,
};

/**
 * Titre ou chapô : seules les formules d'attribution comptent (« (AFP) », « avec AFP »,
 * « Reuters - ») ; un article qui parle de l'agence n'est pas une reprise.
 */
const TEXT_PATTERNS: Record<Agency, RegExp> = {
  AFP: /\(AFP\)|\bavec (l')?AFP\b|^AFP\s*[-–—:]|[-–—]\s*AFP\s*$|\(Agence France[- ]Presse\)/i,
  Reuters: /\(Reuters\)|\bavec Reuters\b|^Reuters\s*[-–—:]|[-–—]\s*Reuters\s*$/i,
  AP: /\(AP\)|\bavec (l')?AP\b|^AP\s*[-–—:]/,
};

export function detectAgency(input: {
  creator?: string | null;
  texts?: Array<string | null | undefined>;
}): Agency | null {
  for (const agency of AGENCIES) {
    if (input.creator && AUTHOR_PATTERNS[agency].test(input.creator)) return agency;
  }
  for (const text of input.texts ?? []) {
    if (!text) continue;
    for (const agency of AGENCIES) {
      if (TEXT_PATTERNS[agency].test(text)) return agency;
    }
  }
  return null;
}
