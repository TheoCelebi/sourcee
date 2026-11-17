/**
 * Réserve de fouille de textes et de données (protocole TDMRep du W3C), qui peut être
 * déclarée de trois façons : fichier /.well-known/tdmrep.json, en-tête HTTP, balise meta.
 */

/** Lit le fichier tdmrep.json (tableau de règles, ou objet unique chez certains éditeurs). */
export function tdmReservedByFile(json: string, path = "/"): boolean {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return false;
  }
  const rules: unknown[] = Array.isArray(data) ? data : [data];
  return rules.some((rule) => {
    if (typeof rule !== "object" || rule === null) return false;
    const record = rule as Record<string, unknown>;
    const location = typeof record.location === "string" ? record.location : "/";
    return Number(record["tdm-reservation"]) === 1 && locationCovers(location, path);
  });
}

/**
 * Une règle posée sur « / » est lue comme valant pour tout le site : c'est l'usage
 * des éditeurs, et la lecture la plus prudente. « * » sert de joker.
 */
export function locationCovers(location: string, path: string): boolean {
  if (location === "/" || location === "/*" || location === "*") return true;
  const pattern = location
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}`).test(path);
}

export function tdmReservedByHeaders(headers: Headers): boolean {
  return headers.get("tdm-reservation")?.trim() === "1";
}

export function tdmReservedByHtml(html: string): boolean {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some(
    (tag) => /name=["']tdm-reservation["']/i.test(tag) && /content=["']1["']/i.test(tag),
  );
}
