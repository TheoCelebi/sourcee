/**
 * Repli des doublons dans le classement du jour. Un même événement peut former deux
 * groupes (souvent un par langue) ; s'ils se ressemblent assez, le second est replié
 * sous le premier au lieu d'occuper une autre place du top.
 * Seuil calibré le 17 novembre 2026 : les doublons observés dépassaient 0,79, un
 * événement distinct mais voisin atteignait 0,754.
 */
export const FOLD_THRESHOLD = 0.78;

export interface FoldCandidate {
  id: number;
  centroid: number[] | null;
}

export interface FoldedGroup<T> {
  kept: T;
  related: T[];
}

function dot(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/**
 * `ranked` est trié du mieux classé au moins bien classé. Un candidat proche d'un membre
 * quelconque d'un groupe déjà formé (événement retenu ou déjà replié) le rejoint.
 */
export function foldDuplicates<T extends FoldCandidate>(
  ranked: readonly T[],
  limit: number,
  threshold = FOLD_THRESHOLD,
): FoldedGroup<T>[] {
  const groups: (FoldedGroup<T> & { vectors: number[][] })[] = [];
  for (const candidate of ranked) {
    const centroid = candidate.centroid;
    if (centroid) {
      const host = groups.find((group) =>
        group.vectors.some((vector) => dot(vector, centroid) >= threshold),
      );
      if (host) {
        host.related.push(candidate);
        host.vectors.push(centroid);
        continue;
      }
    }
    if (groups.length < limit) {
      groups.push({ kept: candidate, related: [], vectors: centroid ? [centroid] : [] });
    }
  }
  return groups.map(({ kept, related }) => ({ kept, related }));
}
