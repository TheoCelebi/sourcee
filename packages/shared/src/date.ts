const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Journée (AAAA-MM-JJ) d'un instant, à l'heure de Paris. */
export function parisDay(date: Date): string {
  return PARIS_DAY.format(date);
}

/** Vrai si la chaîne est une date de calendrier valide au format AAAA-MM-JJ. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Décale une journée AAAA-MM-JJ d'un nombre de jours. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Nombre de journées entre deux dates AAAA-MM-JJ (bornes comprises). */
export function daySpan(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}
