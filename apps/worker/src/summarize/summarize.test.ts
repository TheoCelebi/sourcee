import { afterEach, describe, expect, it } from "vitest";
import { createClaudeCodeModel, parseCliOutput } from "./claudeCode";
import { FatalModelError } from "./model";
import { buildUserPrompt, type SourceArticle } from "./prompt";
import { createSummaryModel } from "./provider";
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

describe("résumés via Claude Code", () => {
  const summary = {
    status: "ok",
    title: "Le pont de Crimée endommagé",
    sentences: [{ text: "Le pont a été touché.", sources: [1] }],
    themes: [],
    zones: [],
  };
  const output = (body: object, code = 0) => ({ code, stdout: JSON.stringify(body), stderr: "" });

  it("lance claude -p sans outil, avec le schéma imposé, et lit la sortie structurée", async () => {
    const calls: { bin: string; args: string[]; input: string }[] = [];
    const model = createClaudeCodeModel(
      "/usr/local/bin/claude",
      "claude-haiku-5-5",
      (bin, args, input) => {
        calls.push({ bin, args, input });
        return Promise.resolve(
          output({
            type: "result",
            subtype: "success",
            is_error: false,
            structured_output: summary,
            usage: { input_tokens: 812, output_tokens: 95 },
          }),
        );
      },
    );
    expect(model.concurrency).toBe(2);
    expect(await model.summarize("Sources numérotées…")).toEqual({
      kind: "ok",
      summary,
      inputTokens: 812,
      outputTokens: 95,
    });
    const [call] = calls;
    expect(call?.input).toBe("Sources numérotées…");
    expect(call?.args.slice(0, 7)).toEqual([
      "-p",
      "--model",
      "claude-haiku-5-5",
      "--effort",
      "low",
      "--tools",
      "",
    ]);
    expect(call?.args).toContain("--no-session-persistence");
    const schema = JSON.parse(call?.args[call.args.indexOf("--json-schema") + 1] ?? "{}");
    expect(schema.$schema).toBeUndefined();
    expect(Object.keys(schema.properties)).toEqual([
      "status",
      "title",
      "sentences",
      "themes",
      "zones",
    ]);
  });

  it("interrompt la série si Claude Code n'est pas connecté ou introuvable", async () => {
    expect(() =>
      parseCliOutput(
        output(
          { is_error: true, subtype: "success", result: "Not logged in · Please run /login" },
          1,
        ),
      ),
    ).toThrow(FatalModelError);
    const missing = createClaudeCodeModel("claude", "claude-haiku-5-5", () =>
      Promise.reject(new Error("spawn claude ENOENT")),
    );
    await expect(missing.summarize("…")).rejects.toThrow(/Impossible de lancer Claude Code/);
  });

  it("traite une réponse hors schéma ou une erreur passagère comme une erreur ordinaire", () => {
    expect(
      parseCliOutput(output({ subtype: "success", structured_output: { status: "ok" } })),
    ).toEqual({
      kind: "error",
      reason: "réponse non conforme au schéma",
    });
    expect(parseCliOutput({ code: 1, stdout: "", stderr: "API Error: 529 Overloaded" })).toEqual({
      kind: "error",
      reason: "Claude Code : API Error: 529 Overloaded",
    });
    expect(parseCliOutput(output({ subtype: "error_max_turns", is_error: true }))).toMatchObject({
      kind: "error",
    });
  });
});

describe("choix du fournisseur des résumés", () => {
  const config = { summaryModel: "claude-haiku-5-5", claudeBin: "claude" } as const;
  const found = () => "/usr/local/bin/claude";
  const notFound = () => null;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    if (savedToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
    else process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
  });

  it("préfère l'API quand une clé existe, sinon Claude Code s'il est installé", () => {
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = "cle-de-test";
    expect(createSummaryModel({ ...config, summaryProvider: "auto" }, found)?.name).toBe(
      "claude-haiku-5-5",
    );
    delete process.env.ANTHROPIC_API_KEY;
    expect(createSummaryModel({ ...config, summaryProvider: "auto" }, found)?.name).toBe(
      "claude-haiku-5-5 (Claude Code)",
    );
    expect(createSummaryModel({ ...config, summaryProvider: "auto" }, notFound)).toBeNull();
    expect(createSummaryModel({ ...config, summaryProvider: "api" }, found)).toBeNull();
  });

  it("respecte un choix explicite", () => {
    process.env.ANTHROPIC_API_KEY = "cle-de-test";
    expect(createSummaryModel({ ...config, summaryProvider: "claude-code" }, found)?.name).toBe(
      "claude-haiku-5-5 (Claude Code)",
    );
    expect(createSummaryModel({ ...config, summaryProvider: "off" }, found)).toBeNull();
  });
});
