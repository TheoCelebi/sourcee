import { useCallback, useEffect, useState } from "react";
import {
  addDays,
  isIsoDay,
  isThemeSlug,
  isZoneSlug,
  parisDay,
  type ThemeSlug,
  type ZoneSlug,
} from "@sourcee/shared";
import type { EditionQuery } from "./api";

/** État de l'édition, reflété dans l'URL pour pouvoir partager une vue filtrée. */
export interface EditionState {
  mode: "day" | "period";
  day: string;
  from: string;
  to: string;
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  q: string;
  minute: boolean;
}

export const today = () => parisDay(new Date());

const list = (value: string | null) => (value ?? "").split(",").filter(Boolean);

export function readState(search: string, now = today()): EditionState {
  const params = new URLSearchParams(search);
  const date = params.get("date");
  const from = params.get("from");
  const to = params.get("to");
  const period = !!from && !!to && isIsoDay(from) && isIsoDay(to) && from <= to;
  const day = date && isIsoDay(date) ? date : now;
  return {
    mode: period ? "period" : "day",
    day,
    from: period ? from : addDays(now, -6),
    to: period ? to : now,
    themes: list(params.get("themes")).filter(isThemeSlug),
    zones: list(params.get("zones")).filter(isZoneSlug),
    q: params.get("q") ?? "",
    minute: params.get("minute") === "1",
  };
}

export function writeState(state: EditionState, now = today()): string {
  const params = new URLSearchParams();
  if (state.mode === "period") {
    params.set("from", state.from);
    params.set("to", state.to);
  } else if (state.day !== now) {
    params.set("date", state.day);
  }
  if (state.themes.length) params.set("themes", state.themes.join(","));
  if (state.zones.length) params.set("zones", state.zones.join(","));
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.minute) params.set("minute", "1");
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function toQuery(state: EditionState): EditionQuery {
  const from = state.mode === "period" ? state.from : state.day;
  const to = state.mode === "period" ? state.to : state.day;
  return { from, to, themes: state.themes, zones: state.zones, q: state.q };
}

/** Chemin courant, mis à jour par la navigation et par les boutons précédent/suivant. */
export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}

export function navigate(href: string): void {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0 });
}

/** État de l'édition lu depuis l'URL ; chaque modification met l'URL à jour. */
export function useEditionState(): [EditionState, (next: EditionState, replace?: boolean) => void] {
  const [state, setState] = useState(() => readState(window.location.search));
  useEffect(() => {
    const update = () => setState(readState(window.location.search));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const update = useCallback((next: EditionState, replace = false) => {
    const url = `${window.location.pathname}${writeState(next)}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setState(next);
  }, []);
  return [state, update];
}
