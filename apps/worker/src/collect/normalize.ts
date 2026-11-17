import { normalizeForMatch } from "./text";

const TRACKING_PARAMS =
  /^(utm_\w+|fbclid|gclid|dclid|msclkid|xtor|at_\w+|ns_\w+|ocid|cmpid|ito|icid|mc_cid|mc_eid|_ga)$/i;

/** URL canonique d'un article : sans fragment ni paramètres de suivi. `null` si invalide. */
export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

/** Segments du chemin, décodés et normalisés (minuscules, sans accents). */
export function pathSegments(url: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return normalizeForMatch(decodeURIComponent(segment));
      } catch {
        return normalizeForMatch(segment);
      }
    });
}
