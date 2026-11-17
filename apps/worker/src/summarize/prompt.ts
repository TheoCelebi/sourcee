import { THEMES, type ThemeSlug, ZONES, type ZoneSlug } from "@sourcee/shared";
import { z } from "zod";

/** À incrémenter à chaque changement du prompt : la version est historisée avec chaque résumé. */
export const PROMPT_VERSION = "2026-11-17.1";

export const SYSTEM_PROMPT = `Tu rédiges les résumés d'une application d'actualités dont la règle d'or est de n'afficher que des faits vérifiables.

Tu reçois les titres et chapôs de quelques articles qui traitent, a priori, du même événement. Ce sont tes seules sources : n'ajoute aucune connaissance extérieure, aucun contexte, aucune date ni aucun chiffre qui n'y figure pas.

Rédige en français :
- un titre neutre et factuel (110 caractères au plus), sans point d'interrogation ni formule accrocheuse ;
- 2 à 4 phrases courtes. Chaque phrase porte les numéros de toutes les sources qui l'appuient ; une phrase que les sources ne permettent pas d'écrire ne doit pas exister.

Règles de rédaction :
- Pas d'adjectif de jugement (« historique », « choquant », « inquiétant »…), pas de spéculation, pas de prédiction.
- Attribue ce qui relève d'une déclaration ou d'une seule source : « selon… », « d'après… », « a déclaré… ». Une institution qui parle de ses propres actes est citée comme telle (« selon la Commission européenne »).
- Reprends les nombres exactement comme ils sont écrits dans les sources (mêmes chiffres, mêmes unités).
- Une citation entre guillemets doit être reprise mot pour mot d'une source en français ; sinon, utilise le discours indirect.
- Si les sources se contredisent, dis-le en attribuant chaque version.
- Si les sources ne traitent pas du même événement, ou ne permettent pas d'écrire au moins deux phrases sûres, réponds avec le statut « insufficient » et aucune phrase.

Choisis enfin au plus deux thèmes et deux zones dans les listes autorisées, seulement s'ils sont évidents.`;

const themeSlugs = THEMES.map((theme) => theme.slug) as [ThemeSlug, ...ThemeSlug[]];
const zoneSlugs = ZONES.map((zone) => zone.slug) as [ZoneSlug, ...ZoneSlug[]];

/** Format de réponse imposé au modèle (sortie structurée). */
export const SummarySchema = z.object({
  status: z.enum(["ok", "insufficient"]),
  title: z.string(),
  sentences: z.array(
    z.object({
      text: z.string(),
      sources: z.array(z.number().int()),
    }),
  ),
  themes: z.array(z.enum(themeSlugs)),
  zones: z.array(z.enum(zoneSlugs)),
});

export type ModelSummary = z.infer<typeof SummarySchema>;

/** Article fourni au modèle : uniquement des sources « open ». */
export interface SourceArticle {
  articleId: number;
  sourceName: string;
  official: boolean;
  language: string;
  publishedAt: Date;
  title: string;
  excerpt: string | null;
}

const DATE = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "short",
});

/** Les sources sont numérotées à partir de 1, dans l'ordre fourni. */
export function buildUserPrompt(sources: readonly SourceArticle[]): string {
  const blocks = sources.map((source, index) =>
    [
      `[${index + 1}] ${source.sourceName} (${source.official ? "source officielle" : "média"}) — ${DATE.format(source.publishedAt)} — langue : ${source.language}`,
      `Titre : ${source.title}`,
      source.excerpt ? `Chapô : ${source.excerpt}` : "Chapô : (aucun)",
    ].join("\n"),
  );
  return `Sources numérotées sur l'événement :\n\n${blocks.join("\n\n")}`;
}
