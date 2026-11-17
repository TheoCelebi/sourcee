import { THEMES, type ThemeSlug, ZONES, type ZoneSlug } from "@sourcee/shared";

/** Espace insécable, pour que « 07 h 42 » ne se coupe jamais. */
export const NBSP = String.fromCharCode(0xa0);

const TIME = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});
const PARTS = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Heure de Paris au format « 07 h 42 ». */
export function hhmm(iso: string): string {
  return TIME.format(new Date(iso)).replace(":", `${NBSP}h${NBSP}`);
}

/** Minutes écoulées depuis minuit, heure de Paris (pour la frise). */
export function minutesOfDay(iso: string): number {
  const parts = PARTS.formatToParts(new Date(iso));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** « Mardi 17 novembre 2026 » pour une journée AAAA-MM-JJ. */
export function longDay(day: string): string {
  return capitalize(
    new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
}

/** « 17 novembre » ou « 17 novembre 2026 ». */
export function shortDay(day: string, withYear = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export const themeLabel = (slug: ThemeSlug) => THEMES.find((t) => t.slug === slug)?.label ?? slug;
export const zoneLabel = (slug: ZoneSlug) => ZONES.find((z) => z.slug === slug)?.label ?? slug;

/** Insère l'appel de note avant le point final, selon l'usage typographique français. */
export function splitFinalPunctuation(text: string): [string, string] {
  const match = /[.!?…]$/.exec(text);
  return match ? [text.slice(0, -1), match[0]] : [text, ""];
}
