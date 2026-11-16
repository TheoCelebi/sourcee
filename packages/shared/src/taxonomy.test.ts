import { describe, expect, it } from "vitest";
import { expandZones, isThemeSlug, isZoneSlug } from "./taxonomy";

describe("expandZones", () => {
  it("inclut la France quand on filtre sur l'Europe", () => {
    expect(expandZones(["europe"]).sort()).toEqual(["europe", "france"]);
  });

  it("ne remonte pas d'une sous-zone vers son parent", () => {
    expect(expandZones(["france"])).toEqual(["france"]);
  });

  it("ne fait pas de « monde » un parent des autres zones", () => {
    expect(expandZones(["monde"])).toEqual(["monde"]);
  });
});

describe("gardes de type", () => {
  it("reconnaît les identifiants valides", () => {
    expect(isThemeSlug("economie")).toBe(true);
    expect(isZoneSlug("asie-pacifique")).toBe(true);
  });

  it("rejette les identifiants inconnus", () => {
    expect(isThemeSlug("Économie")).toBe(false);
    expect(isZoneSlug("asie")).toBe(false);
  });
});
