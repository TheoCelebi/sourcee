import { dot } from "./vector";

export interface ClusteringParams {
  /** Similarité moyenne minimale entre deux groupes pour les réunir (lien moyen). */
  averageThreshold: number;
  /** Similarité minimale entre deux titres quelconques d'un même groupe. */
  minimumThreshold: number;
}

/** Réglage calibré sur des titres réels (voir docs/architecture.md). */
export const DEFAULT_CLUSTERING: ClusteringParams = {
  averageThreshold: 0.65,
  minimumThreshold: 0.5,
};

export interface ExistingGroup {
  eventId: number;
  vectors: number[][];
}

export interface NewItem {
  articleId: number;
  vector: number[];
}

export type ClusteringResult = {
  /** Nouveaux articles rattachés à un événement existant. */
  joined: Map<number, number[]>;
  /** Groupes de nouveaux articles formant de nouveaux événements. */
  created: number[][];
};

/**
 * Regroupement hiérarchique ascendant en lien moyen (UPGMA), sur une journée.
 * Les événements existants sont figés : ils peuvent accueillir de nouveaux articles,
 * mais deux événements existants ne fusionnent jamais. Vecteurs supposés normalisés.
 */
export function agglomerate(
  existing: ExistingGroup[],
  items: NewItem[],
  params: ClusteringParams = DEFAULT_CLUSTERING,
): ClusteringResult {
  interface Group {
    eventId: number | null;
    articleIds: number[];
    vectors: number[][];
    alive: boolean;
  }
  const groups: Group[] = [
    ...existing.map((g) => ({
      eventId: g.eventId,
      articleIds: [],
      vectors: g.vectors,
      alive: true,
    })),
    ...items.map((item) => ({
      eventId: null,
      articleIds: [item.articleId],
      vectors: [item.vector],
      alive: true,
    })),
  ];
  const size = groups.length;
  const average: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const minimum: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));

  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      const a = groups[i] as Group;
      const b = groups[j] as Group;
      if (a.eventId !== null && b.eventId !== null) continue;
      let sum = 0;
      let min = Infinity;
      for (const u of a.vectors) {
        for (const v of b.vectors) {
          const similarity = dot(u, v);
          sum += similarity;
          if (similarity < min) min = similarity;
        }
      }
      const avg = sum / (a.vectors.length * b.vectors.length);
      (average[i] as number[])[j] = (average[j] as number[])[i] = avg;
      (minimum[i] as number[])[j] = (minimum[j] as number[])[i] = min;
    }
  }

  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let best = -Infinity;
    for (let i = 0; i < size; i++) {
      const a = groups[i] as Group;
      if (!a.alive) continue;
      for (let j = i + 1; j < size; j++) {
        const b = groups[j] as Group;
        if (!b.alive || (a.eventId !== null && b.eventId !== null)) continue;
        const avg = (average[i] as number[])[j] as number;
        if (
          avg >= params.averageThreshold &&
          ((minimum[i] as number[])[j] as number) >= params.minimumThreshold &&
          avg > best
        ) {
          best = avg;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;

    // Le groupe conservé est celui de l'événement existant, s'il y en a un.
    const [keep, drop] =
      (groups[bestJ] as Group).eventId !== null ? [bestJ, bestI] : [bestI, bestJ];
    const kept = groups[keep] as Group;
    const dropped = groups[drop] as Group;
    const keptSize = kept.vectors.length;
    const droppedSize = dropped.vectors.length;
    for (let k = 0; k < size; k++) {
      if (k === keep || k === drop || !(groups[k] as Group).alive) continue;
      const avg =
        (keptSize * ((average[keep] as number[])[k] as number) +
          droppedSize * ((average[drop] as number[])[k] as number)) /
        (keptSize + droppedSize);
      const min = Math.min(
        (minimum[keep] as number[])[k] as number,
        (minimum[drop] as number[])[k] as number,
      );
      (average[keep] as number[])[k] = (average[k] as number[])[keep] = avg;
      (minimum[keep] as number[])[k] = (minimum[k] as number[])[keep] = min;
    }
    kept.articleIds.push(...dropped.articleIds);
    kept.vectors = [...kept.vectors, ...dropped.vectors];
    dropped.alive = false;
  }

  const result: ClusteringResult = { joined: new Map(), created: [] };
  for (const group of groups) {
    if (!group.alive || group.articleIds.length === 0) continue;
    if (group.eventId !== null) result.joined.set(group.eventId, group.articleIds);
    else result.created.push(group.articleIds);
  }
  return result;
}
