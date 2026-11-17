import type {
  ApiError,
  ApiEventsResponse,
  ApiSourceInfo,
  ApiStats,
  ThemeSlug,
  ZoneSlug,
} from "@sourcee/shared";

export interface EditionQuery {
  from: string;
  to: string;
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  q: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(body?.details?.join(" ; ") ?? body?.error ?? `Erreur ${response.status}`);
  }
  return (await response.json()) as T;
}

export function eventsUrl(query: EditionQuery): string {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.themes.length) params.set("themes", query.themes.join(","));
  if (query.zones.length) params.set("zones", query.zones.join(","));
  if (query.q.trim()) params.set("q", query.q.trim());
  return `/api/events?${params}`;
}

export const fetchEvents = (query: EditionQuery) => getJson<ApiEventsResponse>(eventsUrl(query));
export const fetchStats = (day: string) => getJson<ApiStats>(`/api/stats?day=${day}`);
export const fetchSources = () => getJson<ApiSourceInfo[]>("/api/sources");
