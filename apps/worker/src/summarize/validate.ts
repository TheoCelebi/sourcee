import type { RejectedSentence, SummarySentence } from "@sourcee/db";
import type { ThemeSlug, ZoneSlug } from "@sourcee/shared";
import type { ModelSummary, SourceArticle } from "./prompt";

export const MIN_SENTENCES = 2;
export const MAX_SENTENCES = 4;
export const MAX_TITLE_LENGTH = 140;

export interface ValidatedSummary {
  status: "ok" | "insufficient";
  /** Titre du modèle s'il a passé les contrôles, sinon null (on garde le titre d'origine). */
  title: string | null;
  sentences: SummarySentence[];
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  rejected: RejectedSentence[];
}

/** Nombres d'un texte, réduits à leurs chiffres : « 146 000 », « 146,000 » et « 146000 » se valent. */
export function numbersIn(text: string): string[] {
  // En JavaScript, \s couvre aussi les espaces insécables utilisés en typographie française.
  return (text.match(/\d+(?:[\s.,]\d+)*/g) ?? []).map((n) => n.replace(/\D/g, ""));
}

/** Passages entre guillemets (français, anglais ou droits). */
export function quotesIn(text: string): string[] {
  const quotes: string[] = [];
  for (const match of text.matchAll(/«\s*([^»]+?)\s*»|“([^”]+)”|"([^"]+)"/g)) {
    const quote = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (quote) quotes.push(quote);
  }
  return quotes;
}

const comparable = (text: string) =>
  text.replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

const sourceText = (source: SourceArticle) => `${source.title} ${source.excerpt ?? ""}`;

/** Raison du rejet d'un texte au regard des sources qu'il cite, ou null s'il passe. */
export function checkAgainstSources(text: string, cited: readonly SourceArticle[]): string | null {
  const available = new Set(cited.flatMap((source) => numbersIn(sourceText(source))));
  const missingNumber = numbersIn(text).find((number) => !available.has(number));
  if (missingNumber) return `nombre absent des sources citées : ${missingNumber}`;
  const corpus = comparable(cited.map(sourceText).join(" "));
  const missingQuote = quotesIn(text).find((quote) => !corpus.includes(comparable(quote)));
  if (missingQuote) return `citation absente des sources citées : « ${missingQuote} »`;
  return null;
}

/**
 * Contrôles déterministes appliqués après génération : une phrase sans source valide,
 * avec un nombre ou une citation introuvable dans ses sources, est retirée.
 */
export function validateSummary(
  output: ModelSummary,
  sources: readonly SourceArticle[],
): ValidatedSummary {
  const rejected: RejectedSentence[] = [];
  const sentences: SummarySentence[] = [];

  if (output.status === "ok") {
    for (const sentence of output.sentences) {
      const text = sentence.text.trim();
      if (!text) continue;
      const indexes = [...new Set(sentence.sources)].filter((n) => n >= 1 && n <= sources.length);
      if (indexes.length === 0) {
        rejected.push({ text, reason: "aucune source valide citée" });
        continue;
      }
      const cited = indexes.map((n) => sources[n - 1] as SourceArticle);
      const reason = checkAgainstSources(text, cited);
      if (reason) {
        rejected.push({ text, reason });
        continue;
      }
      sentences.push({ text, articleIds: cited.map((source) => source.articleId) });
    }
  }

  const enough = sentences.length >= MIN_SENTENCES;
  const title = output.title.trim();
  const titleOk =
    enough &&
    title.length > 0 &&
    title.length <= MAX_TITLE_LENGTH &&
    !title.endsWith("?") &&
    checkAgainstSources(title, sources) === null;

  return {
    status: enough ? "ok" : "insufficient",
    title: titleOk ? title : null,
    sentences: enough ? sentences.slice(0, MAX_SENTENCES) : [],
    themes: enough ? [...new Set(output.themes)].slice(0, 2) : [],
    zones: enough ? [...new Set(output.zones)].slice(0, 2) : [],
    rejected,
  };
}
