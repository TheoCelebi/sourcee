import { describe, expect, it } from "vitest";
import { agglomerate } from "./agglomerate";
import { parisDay } from "./day";
import { computeEventStats, dominant, type EventMember } from "./stats";
import { normalize } from "./vector";

/** Vecteur unitaire orienté par des poids sur les premiers axes. */
const v = (...weights: number[]) => normalize(weights);

describe("agglomerate", () => {
  const params = { averageThreshold: 0.65, minimumThreshold: 0.5 };

  it("réunit les titres proches et laisse les autres seuls", () => {
    const result = agglomerate(
      [],
      [
        { articleId: 1, vector: v(1, 0.1, 0) },
        { articleId: 2, vector: v(1, 0.2, 0) },
        { articleId: 3, vector: v(0, 0, 1) },
      ],
      params,
    );
    expect(result.created.map((group) => group.sort())).toEqual([[1, 2], [3]]);
  });

  it("rattache un nouvel article à l'événement existant le plus proche", () => {
    const result = agglomerate(
      [
        { eventId: 10, vectors: [v(1, 0, 0), v(1, 0.1, 0)] },
        { eventId: 20, vectors: [v(0, 1, 0)] },
      ],
      [{ articleId: 5, vector: v(1, 0.05, 0) }],
      params,
    );
    expect(result.joined).toEqual(new Map([[10, [5]]]));
    expect(result.created).toEqual([]);
  });

  it("ne fusionne jamais deux événements existants", () => {
    const result = agglomerate(
      [
        { eventId: 10, vectors: [v(1, 0, 0)] },
        { eventId: 20, vectors: [v(1, 0.01, 0)] },
      ],
      [],
      params,
    );
    expect(result.joined.size).toBe(0);
  });

  it("refuse l'enchaînement de sujets voisins grâce à la similarité minimale", () => {
    // A–B et B–C sont proches (0,87), A–C ne l'est pas (0,5) : le lien moyen (0,68)
    // suffirait à tout réunir, la similarité minimale l'empêche.
    const items = [
      { articleId: 1, vector: v(1, 0, 0) },
      { articleId: 2, vector: v(0.866, 0.5, 0) },
      { articleId: 3, vector: v(0.5, 0.866, 0) },
    ];
    const strict = agglomerate([], items, { averageThreshold: 0.6, minimumThreshold: 0.55 });
    expect(strict.created.some((group) => group.length === 3)).toBe(false);
    const loose = agglomerate([], items, { averageThreshold: 0.6, minimumThreshold: 0 });
    expect(loose.created.some((group) => group.length === 3)).toBe(true);
  });
});

describe("statistiques d'un événement", () => {
  const member = (overrides: Partial<EventMember>): EventMember => ({
    articleId: 1,
    title: "Titre",
    sourceName: "Média",
    sourceKind: "media",
    independenceGroup: "Groupe A",
    agency: null,
    publishedAt: new Date("2026-11-17T08:00:00Z"),
    themeHints: [],
    zoneHints: [],
    embedding: v(1, 0, 0),
    ...overrides,
  });

  it("compte les origines : groupes, agences reprises, sources officielles exclues", () => {
    const stats = computeEventStats([
      member({ independenceGroup: "France Médias Monde" }),
      member({ independenceGroup: "France Médias Monde", sourceName: "Autre titre du groupe" }),
      member({ independenceGroup: "Libération", agency: "AFP" }),
      member({ independenceGroup: "Groupe Le Monde", agency: "AFP" }),
      member({ sourceKind: "official", independenceGroup: "Commission européenne" }),
    ]);
    expect(stats.independentOrigins).toBe(2);
    expect(stats.verification).toBe("confirmed");
    expect(stats.articleCount).toBe(5);
  });

  it("marque « source unique » quand une seule origine rapporte l'événement", () => {
    const stats = computeEventStats([
      member({ sourceKind: "official", independenceGroup: "BCE" }),
      member({ independenceGroup: "Groupe A" }),
    ]);
    expect(stats.verification).toBe("single_source");
  });

  it("choisit comme titre l'article le plus proche du centre du groupe", () => {
    const stats = computeEventStats([
      // Angles : 53°, 24° et 3° ; le centroïde est vers 27°, donc « Central » est le plus proche.
      member({ title: "Excentré", embedding: v(0.6, 0.8, 0) }),
      member({ title: "Central", embedding: v(1, 0.45, 0) }),
      member({ title: "Autre", embedding: v(1, 0.05, 0) }),
    ]);
    expect(stats.representativeTitle).toBe("Central");
  });

  it("retient les indices partagés par une majorité stricte des articles", () => {
    expect(dominant([["politique"], ["politique", "economie"], ["politique"], ["sport"]])).toEqual([
      "politique",
    ]);
    // Un article sur deux ne suffit pas : la rubrique d'un seul flux n'étiquette pas l'événement.
    expect(dominant([["afrique"], []])).toEqual([]);
    expect(dominant([["afrique"]])).toEqual(["afrique"]);
  });
});

describe("parisDay", () => {
  it("rattache un instant à la journée de Paris", () => {
    expect(parisDay(new Date("2026-11-17T23:30:00Z"))).toBe("2026-11-18");
    expect(parisDay(new Date("2026-11-17T22:30:00Z"))).toBe("2026-11-17");
  });
});
