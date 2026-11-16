/** Thèmes proposés dans les filtres et attribués aux événements. */
export const THEMES = [
  { slug: "international", label: "International" },
  { slug: "politique", label: "Politique" },
  { slug: "economie", label: "Économie" },
  { slug: "science", label: "Science" },
  { slug: "tech", label: "Tech" },
  { slug: "sport", label: "Sport" },
  { slug: "environnement", label: "Environnement" },
  { slug: "sante", label: "Santé" },
  { slug: "societe", label: "Société" },
  { slug: "culture", label: "Culture" },
] as const;

/**
 * Zones géographiques. « monde » désigne une portée mondiale ou multilatérale ;
 * une zone peut en contenir d'autres (l'Europe contient la France).
 */
export const ZONES = [
  { slug: "monde", label: "Monde", parent: null },
  { slug: "europe", label: "Europe", parent: null },
  { slug: "france", label: "France", parent: "europe" },
  { slug: "afrique", label: "Afrique", parent: null },
  { slug: "ameriques", label: "Amériques", parent: null },
  { slug: "asie-pacifique", label: "Asie-Pacifique", parent: null },
  { slug: "moyen-orient", label: "Moyen-Orient", parent: null },
] as const;

export type ThemeSlug = (typeof THEMES)[number]["slug"];
export type ZoneSlug = (typeof ZONES)[number]["slug"];

export const THEME_SLUGS: readonly ThemeSlug[] = THEMES.map((t) => t.slug);
export const ZONE_SLUGS: readonly ZoneSlug[] = ZONES.map((z) => z.slug);

export function isThemeSlug(value: string): value is ThemeSlug {
  return (THEME_SLUGS as readonly string[]).includes(value);
}

export function isZoneSlug(value: string): value is ZoneSlug {
  return (ZONE_SLUGS as readonly string[]).includes(value);
}

/** Ajoute à chaque zone ses sous-zones : filtrer sur l'Europe inclut la France. */
export function expandZones(slugs: readonly ZoneSlug[]): ZoneSlug[] {
  const result = new Set<ZoneSlug>(slugs);
  let added = true;
  while (added) {
    added = false;
    for (const zone of ZONES) {
      if (zone.parent && result.has(zone.parent) && !result.has(zone.slug)) {
        result.add(zone.slug);
        added = true;
      }
    }
  }
  return [...result];
}
