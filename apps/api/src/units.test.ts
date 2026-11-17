import { describe, expect, it } from "vitest";
import { HttpError } from "./errors";
import { foldDuplicates } from "./fold";
import { toTsQuery } from "./queries";
import { parseEventsQuery } from "./validation";

describe("foldDuplicates", () => {
  const unit = (x: number, y: number) => {
    const norm = Math.hypot(x, y);
    return [x / norm, y / norm];
  };

  it("replie un doublon sous l'événement mieux classé, de proche en proche", () => {
    const groups = foldDuplicates(
      [
        { id: 1, centroid: unit(1, 0) },
        { id: 2, centroid: unit(0, 1) },
        { id: 3, centroid: unit(1, 0.4) }, // proche de 1
        { id: 4, centroid: unit(1, 1.1) }, // loin de 1, mais proche de 3 qui a été replié
      ],
      10,
      0.78,
    );
    expect(groups.map((g) => [g.kept.id, g.related.map((r) => r.id)])).toEqual([
      [1, [3, 4]],
      [2, []],
    ]);
  });

  it("respecte la limite tout en continuant à replier les doublons", () => {
    const groups = foldDuplicates(
      [
        { id: 1, centroid: unit(1, 0) },
        { id: 2, centroid: unit(0, 1) },
        { id: 3, centroid: unit(0.05, 1) },
      ],
      1,
      0.78,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.related).toEqual([]);
  });
});

describe("toTsQuery", () => {
  it("cherche chaque mot comme préfixe, sans accents", () => {
    expect(toTsQuery("Élections européennes")).toBe("elections:* & europeennes:*");
    expect(toTsQuery("IA")).toBe("ia:*");
    expect(toTsQuery("a ' !")).toBeNull();
  });
});

describe("parseEventsQuery", () => {
  const today = "2026-11-17";

  it("prend la journée en cours par défaut", () => {
    expect(parseEventsQuery({}, today)).toEqual({
      from: today,
      to: today,
      themes: [],
      zones: [],
      q: null,
      limit: 10,
    });
  });

  it("lit une période, des listes et un mot-clé", () => {
    expect(
      parseEventsQuery(
        {
          from: "2026-11-10",
          to: today,
          themes: "politique,economie",
          zones: "europe",
          q: " COP ",
          limit: "5",
        },
        today,
      ),
    ).toEqual({
      from: "2026-11-10",
      to: today,
      themes: ["politique", "economie"],
      zones: ["europe"],
      q: "COP",
      limit: 5,
    });
  });

  it.each([
    [{ from: "2026-13-01" }, "date invalide"],
    [{ themes: "meteo" }, "thème inconnu « meteo »"],
    [{ zones: "asie" }, "zone inconnue « asie »"],
    [{ from: "2026-11-18", to: today }, "la date de début doit précéder"],
    [{ from: "2026-09-01", to: today }, "31 jours au plus"],
    [{ limit: "0" }, "limit"],
  ])("refuse %o", (query, message) => {
    try {
      parseEventsQuery(query, today);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(400);
      expect((error as HttpError).details?.join(" ")).toContain(message);
    }
  });
});
