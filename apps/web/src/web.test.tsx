// @vitest-environment jsdom
import type { ApiArticle, ApiEvent } from "@sourcee/shared";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventCard, MinuteCard } from "./components/EventCard";
import { PULL_THRESHOLD, resist } from "./components/PullToRefresh";
import { fitZoom, layoutTimeline, MAX_ZOOM } from "./components/Timeline";
import { readState, toQuery, writeState } from "./state";

afterEach(cleanup);

const article = (id: number, name: string, overrides: Partial<ApiArticle> = {}): ApiArticle => ({
  id,
  title: `Titre de ${name}`,
  url: `https://exemple.org/${id}`,
  language: "fr",
  publishedAt: "2026-11-17T07:42:00Z",
  agency: null,
  source: { name, kind: "media", policy: "open", group: name },
  usedInSummary: false,
  ...overrides,
});

const event = (overrides: Partial<ApiEvent> = {}): ApiEvent => ({
  id: 7,
  day: "2026-11-17",
  rank: 1,
  title: "Le pont de Crimée endommagé",
  titleFromSource: false,
  titleSourceName: null,
  verification: "confirmed",
  independentOrigins: 2,
  articleCount: 3,
  themes: ["international"],
  zones: ["europe"],
  firstPublishedAt: "2026-11-17T07:42:00Z",
  lastPublishedAt: "2026-11-17T15:10:00Z",
  summary: {
    status: "ok",
    sentences: [
      { text: "Selon The Guardian, le pont a été touché.", articleIds: [2] },
      { text: "Le trafic est interrompu.", articleIds: [2, 1] },
    ],
  },
  articles: [
    article(1, "Africanews", { usedInSummary: true, agency: "AFP" }),
    article(2, "The Guardian", { usedInSummary: true, language: "en" }),
    article(3, "Le Monde", {
      source: { name: "Le Monde", kind: "media", policy: "links_only", group: "Groupe Le Monde" },
    }),
  ],
  related: [],
  ...overrides,
});

describe("EventCard", () => {
  it("numérote les sources dans l'ordre de citation et place l'appel avant le point", () => {
    const { container } = render(<EventCard event={event()} lead />);
    const summary = container.querySelector("p.font-serif") as HTMLElement;
    expect(summary.textContent).toBe(
      "Selon The Guardian, le pont a été touché1. Le trafic est interrompu1,2.",
    );
    const basis = within(container.querySelector("ol") as HTMLElement);
    expect(basis.getAllByRole("listitem").map((item) => item.textContent?.slice(0, 13))).toEqual([
      "1The Guardian",
      "2AfricanewsFR",
    ]);
    expect(screen.getByText("reprend une dépêche AFP")).toBeTruthy();
    expect(screen.getByText(/Également rapporté par 1 média/)).toBeTruthy();
    expect(screen.getByText("À la une")).toBeTruthy();
    expect(screen.getByText("Confirmé · 2 origines indépendantes")).toBeTruthy();
  });

  it("ouvre les articles d'origine dans un nouvel onglet, sans fuite de l'opener", () => {
    render(<EventCard event={event()} />);
    for (const link of screen.getAllByRole("link", { name: /« Titre de/ })) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("affiche « informations insuffisantes » et le titre d'origine attribué", () => {
    render(
      <EventCard
        event={event({
          title: "Titre de Le Monde",
          titleFromSource: true,
          titleSourceName: "Le Monde",
          verification: "single_source",
          summary: { status: "unavailable", sentences: [] },
        })}
      />,
    );
    expect(screen.getByText("Titre d'origine · Le Monde")).toBeTruthy();
    expect(
      screen.getByText(/aucune source ouverte à l'analyse ne couvre cet événement/),
    ).toBeTruthy();
    expect(screen.getByText("Source unique · à confirmer")).toBeTruthy();
    expect(screen.getByText("Sources (3)")).toBeTruthy();
  });

  it("résume l'essentiel en mode 1 minute", () => {
    render(<MinuteCard event={event()} />);
    expect(screen.getByText("Selon The Guardian, le pont a été touché.")).toBeTruthy();
    expect(screen.getByText(/et 1 autre média/)).toBeTruthy();
  });
});

describe("état de l'édition dans l'URL", () => {
  const today = "2026-11-17";

  it("lit et réécrit les filtres", () => {
    const state = readState(
      "?date=2026-11-16&themes=politique,meteo&zones=europe&q=COP&minute=1",
      today,
    );
    expect(state).toMatchObject({
      mode: "day",
      day: "2026-11-16",
      themes: ["politique"],
      zones: ["europe"],
      q: "COP",
      minute: true,
    });
    expect(writeState(state, today)).toBe(
      "?date=2026-11-16&themes=politique&zones=europe&q=COP&minute=1",
    );
    expect(toQuery(state)).toEqual({
      from: "2026-11-16",
      to: "2026-11-16",
      themes: ["politique"],
      zones: ["europe"],
      q: "COP",
    });
  });

  it("reconnaît une période et ignore une date invalide", () => {
    expect(readState("?from=2026-11-10&to=2026-11-17", today)).toMatchObject({
      mode: "period",
      from: "2026-11-10",
      to: "2026-11-17",
    });
    expect(readState("?date=2026-02-30", today)).toMatchObject({ mode: "day", day: today });
    expect(writeState(readState("", today), today)).toBe("");
  });
});

describe("frise de la journée", () => {
  it("place les événements à leur heure et décale ceux qui se chevauchent", () => {
    const layout = layoutTimeline(
      [
        event({ id: 1, firstPublishedAt: "2026-11-17T11:00:00Z" }),
        event({ id: 2, firstPublishedAt: "2026-11-17T11:10:00Z" }),
        event({ id: 3, firstPublishedAt: "2026-11-17T17:00:00Z" }),
      ],
      1000,
    );
    // 12 h et 18 h à Paris : 50 % et 75 % de la largeur.
    expect(
      layout.markers.map((marker) => [marker.event.id, Math.round(marker.pct), marker.top]),
    ).toEqual([
      [1, 50, 0],
      [2, 51, 30],
      [3, 75, 0],
    ]);
    expect(layout.ticks).toHaveLength(9);
  });

  it("sépare les événements proches et resserre les graduations quand on zoome", () => {
    const close = [
      event({ id: 1, firstPublishedAt: "2026-11-17T11:00:00Z" }),
      event({ id: 2, firstPublishedAt: "2026-11-17T11:10:00Z" }),
    ];
    const zoomed = layoutTimeline(close, 1000 * 8);
    expect(zoomed.markers.map((marker) => marker.top)).toEqual([0, 0]);
    expect(zoomed.ticks[1]?.minutes).toBe(30);
  });

  it("ajuste le zoom à la plage des événements, avec une marge", () => {
    expect(
      fitZoom([
        event({ id: 1, firstPublishedAt: "2026-11-17T08:00:00Z" }),
        event({ id: 2, firstPublishedAt: "2026-11-17T10:00:00Z" }),
      ]),
    ).toEqual({ zoom: 8, start: 510 });
    // Un seul événement : une heure à l'écran au plus près.
    expect(fitZoom([event({ firstPublishedAt: "2026-11-17T11:00:00Z" })])).toEqual({
      zoom: MAX_ZOOM,
      start: 690,
    });
    expect(fitZoom([])).toEqual({ zoom: 1, start: 0 });
  });
});

describe("tirer pour actualiser", () => {
  it("freine le geste et le plafonne", () => {
    expect(resist(-20)).toBe(0);
    expect(resist(100)).toBe(50);
    // Il faut tirer d'environ 144 px pour atteindre le seuil.
    expect(resist(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD);
    expect(resist(1000)).toBe(110);
  });
});
