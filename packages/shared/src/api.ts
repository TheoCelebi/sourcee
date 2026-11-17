import type { ThemeSlug, ZoneSlug } from "./taxonomy";

/** Contrat de l'API REST, partagé entre le serveur et l'interface. Dates au format ISO 8601. */

export type SummaryState = "ok" | "insufficient" | "unavailable" | "pending" | "error";

export interface ApiArticle {
  id: number;
  title: string;
  url: string;
  language: string;
  publishedAt: string;
  /** Agence de presse reprise, si elle est connue. */
  agency: string | null;
  source: {
    name: string;
    kind: "media" | "official";
    /** « links_only » : seuls le titre et le lien sont utilisés. */
    policy: "open" | "links_only";
    group: string;
  };
  /** L'article fonde au moins une phrase du résumé. */
  usedInSummary: boolean;
}

export interface ApiSentence {
  text: string;
  articleIds: number[];
}

export interface ApiEvent {
  id: number;
  day: string;
  /** Rang dans la journée, après repli des doublons ; null hors classement. */
  rank: number | null;
  title: string;
  /** Vrai si le titre affiché est celui d'un article (alors attribué à `titleSourceName`). */
  titleFromSource: boolean;
  titleSourceName: string | null;
  verification: "confirmed" | "single_source";
  independentOrigins: number;
  articleCount: number;
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  firstPublishedAt: string;
  lastPublishedAt: string;
  summary: { status: SummaryState; sentences: ApiSentence[] };
  articles: ApiArticle[];
  /** Groupes d'articles qui racontent la même histoire, repliés sous cet événement. */
  related: { id: number; title: string; articleCount: number }[];
}

export interface ApiDay {
  day: string;
  events: ApiEvent[];
}

export interface ApiEventsResponse {
  from: string;
  to: string;
  days: ApiDay[];
}

export interface ApiSourceInfo {
  slug: string;
  name: string;
  homepageUrl: string;
  kind: "media" | "official";
  policy: "open" | "links_only" | "excluded";
  policyCheckedAt: string | null;
  evidence: {
    feedAllowed: boolean;
    aiBotsBlocked: string[];
    tdmReserved: boolean;
    error: string | null;
  } | null;
}

export interface ApiStats {
  day: string;
  events: number;
  confirmed: number;
  articles: number;
  sources: { open: number; links_only: number; excluded: number };
  excluded: { opinion: number; sponsored: number };
}

export interface ApiError {
  error: string;
  details?: string[];
}
