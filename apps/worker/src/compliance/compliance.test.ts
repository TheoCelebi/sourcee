import { describe, expect, it } from "vitest";
import { fakeHttp } from "../testing";
import { SourceInspector } from "./inspector";
import { decidePolicy } from "./policy";
import { blockedAiBots, isAllowedByRobots } from "./robots";
import { locationCovers, tdmReservedByFile, tdmReservedByHeaders, tdmReservedByHtml } from "./tdm";

const UA = "Mozilla/5.0 (compatible; rss-collector/0.1)";
const ROBOTS_URL = "https://exemple.fr/robots.txt";

describe("robots.txt", () => {
  const robots = [
    "User-agent: GPTBot",
    "Disallow: /",
    "",
    "User-agent: ClaudeBot",
    "Disallow: /",
    "",
    "User-agent: *",
    "Disallow: /prive/",
  ].join("\n");

  it("repère les robots d'IA bloqués à la racine", () => {
    expect(blockedAiBots(ROBOTS_URL, robots).sort()).toEqual(["ClaudeBot", "GPTBot"]);
  });

  it("ne compte pas un blocage limité à une rubrique", () => {
    expect(blockedAiBots(ROBOTS_URL, "User-agent: GPTBot\nDisallow: /archives/\n")).toEqual([]);
  });

  it("applique un refus général à tous les robots d'IA", () => {
    expect(blockedAiBots(ROBOTS_URL, "User-agent: *\nDisallow: /\n")).toHaveLength(5);
  });

  it("autorise ou refuse un flux à notre robot", () => {
    expect(isAllowedByRobots(ROBOTS_URL, robots, "https://exemple.fr/rss.xml", UA)).toBe(true);
    expect(isAllowedByRobots(ROBOTS_URL, robots, "https://exemple.fr/prive/rss.xml", UA)).toBe(
      false,
    );
  });
});

describe("réserve TDM", () => {
  it("lit le fichier tdmrep.json sous forme de tableau ou d'objet", () => {
    expect(tdmReservedByFile('[{"location":"/","tdm-reservation":1}]')).toBe(true);
    expect(tdmReservedByFile('{"location":"/","tdm-reservation":1,"tdm-policy":"x"}')).toBe(true);
    expect(tdmReservedByFile('[{"location":"/","tdm-reservation":0}]')).toBe(false);
    expect(tdmReservedByFile("pas du json")).toBe(false);
  });

  it("respecte l'emplacement des règles", () => {
    expect(locationCovers("/", "/n-importe-quoi")).toBe(true);
    expect(locationCovers("/archives/*", "/")).toBe(false);
    expect(locationCovers("/archives/*", "/archives/2024/article")).toBe(true);
  });

  it("lit l'en-tête HTTP et la balise meta", () => {
    expect(tdmReservedByHeaders(new Headers({ "tdm-reservation": "1" }))).toBe(true);
    expect(tdmReservedByHeaders(new Headers())).toBe(false);
    expect(tdmReservedByHtml('<meta name="tdm-reservation" content="1">')).toBe(true);
    expect(tdmReservedByHtml('<meta content="1" name="tdm-reservation" />')).toBe(true);
    expect(tdmReservedByHtml('<meta name="tdm-reservation" content="0">')).toBe(false);
  });
});

describe("decidePolicy", () => {
  const base = { feedAllowed: true, aiBotsBlocked: [], tdmReserved: false };

  it("ouvre une source sans réserve", () => {
    expect(decidePolicy(base)).toBe("open");
  });

  it("limite aux liens une source qui bloque un robot d'IA", () => {
    expect(decidePolicy({ ...base, aiBotsBlocked: ["GPTBot"] })).toBe("links_only");
  });

  it("exclut une source avec réserve TDM ou flux interdit", () => {
    expect(decidePolicy({ ...base, aiBotsBlocked: ["GPTBot"], tdmReserved: true })).toBe(
      "excluded",
    );
    expect(decidePolicy({ ...base, feedAllowed: false })).toBe("excluded");
  });
});

describe("SourceInspector", () => {
  const source = {
    homepageUrl: "https://www.exemple.fr/",
    feeds: [{ id: 1, url: "https://flux.exemple.fr/une.xml" }],
  };

  it("réunit robots du site, TDM et robots de l'hôte du flux", async () => {
    const inspector = new SourceInspector(
      fakeHttp({
        "https://www.exemple.fr/robots.txt": {
          status: 200,
          body: "User-agent: CCBot\nDisallow: /",
        },
        "https://flux.exemple.fr/robots.txt": { status: 200, body: "User-agent: *\nAllow: /" },
      }),
      UA,
    );
    const result = await inspector.inspect(source);
    expect(result).toMatchObject({
      kind: "ok",
      evidence: { feedAllowed: true, aiBotsBlocked: ["CCBot"], tdmReserved: false },
    });
  });

  it("détecte une réserve TDM déclarée dans les en-têtes du flux", async () => {
    const inspector = new SourceInspector(
      fakeHttp({
        "https://flux.exemple.fr/une.xml": { status: 200, headers: { "tdm-reservation": "1" } },
      }),
      UA,
    );
    const result = await inspector.inspect(source);
    expect(result.kind === "ok" && result.evidence.tdmReserved).toBe(true);
  });

  it("refuse un flux interdit par le robots.txt de son hôte", async () => {
    const inspector = new SourceInspector(
      fakeHttp({
        "https://flux.exemple.fr/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /" },
      }),
      UA,
    );
    const result = await inspector.inspect(source);
    expect(result.kind === "ok" && result.feedAccess.get(1)).toBe(false);
    expect(result.kind === "ok" && result.evidence.feedAllowed).toBe(false);
  });

  it("distingue un robots.txt refusé (définitif) d'une panne (temporaire)", async () => {
    const forbidden = new SourceInspector(
      fakeHttp({ "https://www.exemple.fr/robots.txt": { status: 403 } }),
      UA,
    );
    expect((await forbidden.inspect(source)).kind).toBe("blocked");

    const down = new SourceInspector(
      fakeHttp({ "https://www.exemple.fr/robots.txt": { status: 503 } }),
      UA,
    );
    expect((await down.inspect(source)).kind).toBe("unreachable");
  });
});
