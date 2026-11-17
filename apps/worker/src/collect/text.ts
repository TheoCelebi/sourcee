const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
};

function decodeOnce(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#")) {
      const value = /^#x/i.test(code) ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Décode les entités HTML (deux passes : certains flux les encodent deux fois). */
export function decodeEntities(text: string): string {
  return decodeOnce(decodeOnce(text));
}

/** Retire les balises, décode les entités et normalise les espaces. */
export function cleanText(raw: string | null | undefined): string {
  if (!raw) return "";
  return decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Coupe un texte, de préférence à la fin d'une phrase. */
export function truncateAtSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastStop > max * 0.5) return slice.slice(0, lastStop + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 0 ? slice.slice(0, lastSpace) : slice}…`;
}

/** Minuscules sans accents, pour comparer des mots. */
export function normalizeForMatch(text: string): string {
  // Décomposition NFD, puis suppression des signes diacritiques combinants (\p{M}).
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
