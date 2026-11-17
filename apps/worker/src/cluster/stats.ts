import type { SourceKind, Verification } from "@sourcee/db";
import type { ThemeSlug, ZoneSlug } from "@sourcee/shared";
import { addInto, dot, normalize } from "./vector";

export interface EventMember {
  articleId: number;
  title: string;
  sourceName: string;
  sourceKind: SourceKind;
  independenceGroup: string;
  agency: string | null;
  publishedAt: Date;
  themeHints: ThemeSlug[];
  zoneHints: ZoneSlug[];
  embedding: number[];
}

export interface EventStats {
  articleCount: number;
  independentOrigins: number;
  verification: Verification;
  score: number;
  firstPublishedAt: Date;
  lastPublishedAt: Date;
  centroid: number[];
  /** Titre de l'article le plus représentatif (le plus proche du centroïde). */
  representativeTitle: string;
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  searchText: string;
}

/**
 * Origine d'un article : l'agence reprise si elle est connue, sinon le groupe de la source.
 * Les sources officielles ne comptent pas : une institution qui parle de ses propres actes
 * n'est pas une confirmation indépendante.
 */
export function independentOrigins(members: readonly EventMember[]): Set<string> {
  return new Set(
    members
      .filter((member) => member.sourceKind === "media")
      .map((member) => member.agency ?? member.independenceGroup),
  );
}

/** Classement du jour : d'abord le nombre d'origines indépendantes, puis le volume. */
export function eventScore(origins: number, articleCount: number): number {
  return origins * 10 + Math.log2(1 + articleCount);
}

/**
 * Indices partagés par une majorité stricte des articles, deux au plus, les plus fréquents
 * d'abord : un seul flux à la rubrique trompeuse ne suffit pas à étiqueter l'événement.
 */
export function dominant<T extends string>(lists: readonly (readonly T[])[], max = 2): T[] {
  const counts = new Map<T, number>();
  for (const list of lists)
    for (const value of new Set(list)) counts.set(value, (counts.get(value) ?? 0) + 1);
  const minimum = Math.floor(lists.length / 2) + 1;
  return [...counts.entries()]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([value]) => value);
}

export function computeEventStats(members: readonly EventMember[]): EventStats {
  if (members.length === 0) throw new Error("Un événement doit compter au moins un article");
  const sum = new Array<number>(members[0]?.embedding.length ?? 0).fill(0);
  for (const member of members) addInto(sum, member.embedding);
  const centroid = normalize(sum);

  const byTime = [...members].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const representative = [...byTime].sort(
    (a, b) => dot(b.embedding, centroid) - dot(a.embedding, centroid),
  )[0] as EventMember;
  const origins = independentOrigins(members).size;

  const searchParts = new Set([
    representative.title,
    ...members.map((member) => member.title),
    ...members.map((member) => member.sourceName),
  ]);

  return {
    articleCount: members.length,
    independentOrigins: origins,
    verification: origins >= 2 ? "confirmed" : "single_source",
    score: eventScore(origins, members.length),
    firstPublishedAt: (byTime[0] as EventMember).publishedAt,
    lastPublishedAt: (byTime[byTime.length - 1] as EventMember).publishedAt,
    centroid,
    representativeTitle: representative.title,
    themes: dominant(members.map((member) => member.themeHints)),
    zones: dominant(members.map((member) => member.zoneHints)),
    searchText: [...searchParts].join(" · ").slice(0, 8000),
  };
}
