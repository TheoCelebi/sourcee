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
