import { describe, expect, it } from "vitest";
import { buildUserPrompt, type SourceArticle } from "./prompt";
import { checkAgainstSources, numbersIn, quotesIn, validateSummary } from "./validate";

const source = (
  articleId: number,
  title: string,
  excerpt: string | null = null,
): SourceArticle => ({
  articleId,
  sourceName: `Source ${articleId}`,
  official: false,
  language: "fr",
  publishedAt: new Date("2026-11-17T08:00:00Z"),
  title,
  excerpt,
});

describe("nombres et citations", () => {
  it("compare les nombres quelle que soit leur typographie", () => {
    expect(numbersIn("146 000 personnes, 6,1 de magnitude, 2027")).toEqual([
      "146000",
      "61",
      "2027",
    ]);
    expect(numbersIn("146,000 people")).toEqual(["146000"]);
  });

  it("extrait les passages entre guillemets", () => {
    expect(quotesIn("Il a dénoncé « une vaste arnaque » puis “a scam”.")).toEqual([
      "une vaste arnaque",
      "a scam",
    ]);
  });

  it("refuse un nombre ou une citation absents des sources citées", () => {
    const cited = [
      source(
        1,
        "146 000 manifestants selon le ministère",
        "« Une mobilisation réussie », selon la CGT.",
      ),
    ];
    expect(checkAgainstSources("Le ministère a compté 146 000 manifestants.", cited)).toBeNull();
    expect(checkAgainstSources("La CGT parle d'« une mobilisation réussie ».", cited)).toBeNull();
    expect(checkAgainstSources("Les syndicats annoncent 500 000 manifestants.", cited)).toMatch(
      /500000/,
    );
    expect(checkAgainstSources("Le gouvernement parle d'« un échec ».", cited)).toMatch(/un échec/);
  });
});

describe("validateSummary", () => {
  const sources = [
    source(
      11,
      "Le pont de Crimée touché par des drones",
      "Selon Kiev, 3 travées sont endommagées.",
    ),
    source(12, "Le pont de Crimée endommagé"),
  ];

  it("garde les phrases sourcées et rattache les identifiants d'articles", () => {
    const result = validateSummary(
      {
        status: "ok",
        title: "Le pont de Crimée endommagé par des drones",
        sentences: [
          { text: "Selon Kiev, 3 travées du pont de Crimée sont endommagées.", sources: [1] },
          { text: "Deux médias rapportent que le pont est endommagé.", sources: [1, 2, 2] },
          { text: "Le bilan s'élève à 12 morts.", sources: [1] },
          { text: "Une phrase sans source.", sources: [9] },
        ],
        themes: ["international", "international"],
        zones: ["europe"],
      },
      sources,
    );
    expect(result.status).toBe("ok");
    expect(result.title).toBe("Le pont de Crimée endommagé par des drones");
    expect(result.sentences).toEqual([
      { text: "Selon Kiev, 3 travées du pont de Crimée sont endommagées.", articleIds: [11] },
      { text: "Deux médias rapportent que le pont est endommagé.", articleIds: [11, 12] },
    ]);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "nombre absent des sources citées : 12",
      "aucune source valide citée",
    ]);
    expect(result.themes).toEqual(["international"]);
  });

  it("passe en « informations insuffisantes » sous deux phrases valides", () => {
    const result = validateSummary(
      {
        status: "ok",
        title: "Titre",
        sentences: [{ text: "Le pont est endommagé.", sources: [2] }],
        themes: ["international"],
        zones: [],
      },
      sources,
    );
    expect(result).toMatchObject({
      status: "insufficient",
      title: null,
      sentences: [],
      themes: [],
    });
  });

  it("rejette un titre qui pose une question ou contient un chiffre inventé", () => {
    const sentences = [
      { text: "Le pont de Crimée est touché par des drones.", sources: [1] },
      { text: "Le pont de Crimée est endommagé.", sources: [2] },
    ];
    const ask = validateSummary(
      { status: "ok", title: "Le pont va-t-il tenir ?", sentences, themes: [], zones: [] },
      sources,
    );
    expect(ask.title).toBeNull();
    const invented = validateSummary(
      { status: "ok", title: "40 drones sur le pont", sentences, themes: [], zones: [] },
      sources,
    );
    expect(invented.title).toBeNull();
    expect(invented.status).toBe("ok");
  });
});

describe("buildUserPrompt", () => {
  it("numérote les sources et signale les sources officielles", () => {
    const prompt = buildUserPrompt([
      { ...source(1, "Communiqué"), official: true, sourceName: "Commission européenne" },
      source(2, "Article", "Chapô de l'article"),
    ]);
    expect(prompt).toContain("[1] Commission européenne (source officielle)");
    expect(prompt).toContain("[2] Source 2 (média)");
    expect(prompt).toContain("Chapô : Chapô de l'article");
    expect(prompt).toContain("Chapô : (aucun)");
  });
});
