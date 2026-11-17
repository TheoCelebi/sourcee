import {
  daySpan,
  isIsoDay,
  isThemeSlug,
  isZoneSlug,
  type ThemeSlug,
  type ZoneSlug,
} from "@sourcee/shared";
import { z } from "zod";
import { HttpError } from "./errors";

/** Période maximale d'une requête, en jours. */
export const MAX_RANGE_DAYS = 31;

export interface EventFilters {
  from: string;
  to: string;
  themes: ThemeSlug[];
  zones: ZoneSlug[];
  q: string | null;
  /** Nombre d'événements par journée. */
  limit: number;
}

const day = z.string().refine(isIsoDay, "date invalide, format attendu AAAA-MM-JJ");
const csv = z.string().transform((value) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const eventsQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  themes: csv.optional(),
  zones: csv.optional(),
  q: z.string().trim().max(100, "100 caractères au plus").optional(),
  limit: z.coerce.number().int("nombre entier attendu").min(1).max(50).default(10),
});

function invalid(details: string[]): never {
  throw new HttpError(400, "Paramètres invalides", details);
}

/** Valide les paramètres de GET /api/events ; par défaut, la journée en cours. */
export function parseEventsQuery(query: unknown, today: string): EventFilters {
  const parsed = eventsQuery.safeParse(query);
  if (!parsed.success) {
    invalid(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "requête"} : ${issue.message}`),
    );
  }
  const { from, to, themes = [], zones = [], q, limit } = parsed.data;

  const unknownTheme = themes.find((theme) => !isThemeSlug(theme));
  if (unknownTheme) invalid([`themes : thème inconnu « ${unknownTheme} »`]);
  const unknownZone = zones.find((zone) => !isZoneSlug(zone));
  if (unknownZone) invalid([`zones : zone inconnue « ${unknownZone} »`]);

  const end = to ?? from ?? today;
  const start = from ?? end;
  if (start > end) invalid(["from : la date de début doit précéder la date de fin"]);
  if (daySpan(start, end) > MAX_RANGE_DAYS) {
    invalid([`période : ${MAX_RANGE_DAYS} jours au plus`]);
  }

  return {
    from: start,
    to: end,
    themes: themes.filter(isThemeSlug),
    zones: zones.filter(isZoneSlug),
    q: q || null,
    limit,
  };
}

/** Valide un paramètre de journée facultatif (GET /api/stats). */
export function parseDay(value: unknown, today: string): string {
  if (value === undefined) return today;
  if (typeof value !== "string" || !isIsoDay(value))
    invalid(["day : date invalide, format attendu AAAA-MM-JJ"]);
  return value;
}
