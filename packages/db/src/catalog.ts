import type { ThemeSlug, ZoneSlug } from "@sourcee/shared";

export interface CatalogFeed {
  url: string;
  language: "fr" | "en";
  /** Thème et zone par défaut quand la rubrique du flux les indique. */
  theme?: ThemeSlug;
  zone?: ZoneSlug;
}

export interface CatalogSource {
  slug: string;
  name: string;
  /** Domaine principal de l'éditeur : son robots.txt et sa réserve TDM font foi. */
  homepageUrl: string;
  kind: "media" | "official";
  independenceGroup: string;
  feeds: CatalogFeed[];
}

/**
 * Sources suivies. Le niveau d'usage (open, links_only, excluded) n'est pas fixé ici :
 * il est recalculé chaque jour par le contrôle de conformité (robots.txt, TDMRep).
 * Constat du 17 novembre 2026 : seules les institutions et les médias de la première
 * section n'opposent aucune réserve à l'analyse automatique de leurs contenus.
 */
export const CATALOG: CatalogSource[] = [
  // Institutions
  {
    slug: "onu-info",
    name: "ONU Info",
    homepageUrl: "https://news.un.org/fr/",
    kind: "official",
    independenceGroup: "Nations unies",
    feeds: [
      {
        url: "https://news.un.org/feed/subscribe/fr/news/all/rss.xml",
        language: "fr",
        theme: "international",
      },
    ],
  },
  {
    slug: "commission-europeenne",
    name: "Commission européenne",
    homepageUrl: "https://ec.europa.eu/",
    kind: "official",
    independenceGroup: "Commission européenne",
    feeds: [
      {
        url: "https://ec.europa.eu/commission/presscorner/api/rss?language=fr",
        language: "fr",
        zone: "europe",
      },
    ],
  },
  {
    slug: "parlement-europeen",
    name: "Parlement européen",
    homepageUrl: "https://www.europarl.europa.eu/",
    kind: "official",
    independenceGroup: "Parlement européen",
    feeds: [
      {
        url: "https://www.europarl.europa.eu/rss/doc/top-stories/fr.xml",
        language: "fr",
        theme: "politique",
        zone: "europe",
      },
    ],
  },
  {
    slug: "bce",
    name: "Banque centrale européenne",
    homepageUrl: "https://www.ecb.europa.eu/",
    kind: "official",
    independenceGroup: "Banque centrale européenne",
    feeds: [
      {
        url: "https://www.ecb.europa.eu/rss/press.html",
        language: "en",
        theme: "economie",
        zone: "europe",
      },
    ],
  },
  {
    slug: "insee",
    name: "Insee",
    homepageUrl: "https://www.insee.fr/",
    kind: "official",
    independenceGroup: "Insee",
    feeds: [
      { url: "https://www.insee.fr/fr/flux/1", language: "fr", theme: "economie", zone: "france" },
    ],
  },

  // Médias sans réserve constatée
  {
    slug: "public-senat",
    name: "Public Sénat",
    homepageUrl: "https://www.publicsenat.fr/",
    kind: "media",
    independenceGroup: "Public Sénat",
    feeds: [
      {
        url: "https://www.publicsenat.fr/feed",
        language: "fr",
        theme: "politique",
        zone: "france",
      },
    ],
  },
  {
    slug: "africanews",
    name: "Africanews",
    homepageUrl: "https://fr.africanews.com/",
    kind: "media",
    independenceGroup: "Euronews",
    feeds: [{ url: "https://fr.africanews.com/feed/rss", language: "fr", zone: "afrique" }],
  },
  {
    slug: "global-voices",
    name: "Global Voices",
    homepageUrl: "https://fr.globalvoices.org/",
    kind: "media",
    independenceGroup: "Global Voices",
    feeds: [{ url: "https://fr.globalvoices.org/feed/", language: "fr" }],
  },
  {
    slug: "voa",
    name: "Voice of America",
    homepageUrl: "https://www.voanews.com/",
    kind: "media",
    independenceGroup: "USAGM",
    feeds: [{ url: "https://www.voanews.com/api/", language: "en" }],
  },
  {
    slug: "rferl",
    name: "RFE/RL",
    homepageUrl: "https://www.rferl.org/",
    kind: "media",
    independenceGroup: "USAGM",
    feeds: [{ url: "https://www.rferl.org/api/", language: "en" }],
  },
  {
    slug: "cna",
    name: "CNA",
    homepageUrl: "https://www.channelnewsasia.com/",
    kind: "media",
    independenceGroup: "Mediacorp",
    feeds: [
      {
        url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
        language: "en",
        zone: "asie-pacifique",
      },
    ],
  },
  {
    slug: "scmp",
    name: "South China Morning Post",
    homepageUrl: "https://www.scmp.com/",
    kind: "media",
    independenceGroup: "SCMP",
    feeds: [{ url: "https://www.scmp.com/rss/91/feed/", language: "en", theme: "international" }],
  },

  // Médias qui réservent leurs contenus (liens seulement ou exclusion, selon le contrôle)
  {
    slug: "bbc",
    name: "BBC News",
    homepageUrl: "https://www.bbc.com/",
    kind: "media",
    independenceGroup: "BBC",
    feeds: [
      {
        url: "https://feeds.bbci.co.uk/news/world/rss.xml",
        language: "en",
        theme: "international",
      },
    ],
  },
  {
    slug: "le-monde",
    name: "Le Monde",
    homepageUrl: "https://www.lemonde.fr/",
    kind: "media",
    independenceGroup: "Groupe Le Monde",
    feeds: [
      { url: "https://www.lemonde.fr/rss/une.xml", language: "fr" },
      {
        url: "https://www.lemonde.fr/international/rss_full.xml",
        language: "fr",
        theme: "international",
      },
    ],
  },
  {
    slug: "france-24",
    name: "France 24",
    homepageUrl: "https://www.france24.com/",
    kind: "media",
    independenceGroup: "France Médias Monde",
    feeds: [{ url: "https://www.france24.com/fr/rss", language: "fr" }],
  },
  {
    slug: "rfi",
    name: "RFI",
    homepageUrl: "https://www.rfi.fr/",
    kind: "media",
    independenceGroup: "France Médias Monde",
    feeds: [{ url: "https://www.rfi.fr/fr/rss", language: "fr" }],
  },
  {
    slug: "the-guardian",
    name: "The Guardian",
    homepageUrl: "https://www.theguardian.com/",
    kind: "media",
    independenceGroup: "Guardian Media Group",
    feeds: [
      { url: "https://www.theguardian.com/world/rss", language: "en", theme: "international" },
    ],
  },
  {
    slug: "dw",
    name: "DW",
    homepageUrl: "https://www.dw.com/",
    kind: "media",
    independenceGroup: "Deutsche Welle",
    feeds: [{ url: "https://rss.dw.com/rdf/rss-en-all", language: "en" }],
  },
  {
    slug: "al-jazeera",
    name: "Al Jazeera",
    homepageUrl: "https://www.aljazeera.com/",
    kind: "media",
    independenceGroup: "Al Jazeera Media Network",
    feeds: [{ url: "https://www.aljazeera.com/xml/rss/all.xml", language: "en" }],
  },
  {
    slug: "npr",
    name: "NPR",
    homepageUrl: "https://www.npr.org/",
    kind: "media",
    independenceGroup: "NPR",
    feeds: [{ url: "https://feeds.npr.org/1001/rss.xml", language: "en" }],
  },
  {
    slug: "euronews",
    name: "Euronews",
    homepageUrl: "https://fr.euronews.com/",
    kind: "media",
    independenceGroup: "Euronews",
    feeds: [{ url: "https://fr.euronews.com/rss", language: "fr" }],
  },
  {
    slug: "liberation",
    name: "Libération",
    homepageUrl: "https://www.liberation.fr/",
    kind: "media",
    independenceGroup: "Libération",
    feeds: [
      {
        url: "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml",
        language: "fr",
      },
    ],
  },
  {
    slug: "franceinfo",
    name: "franceinfo",
    homepageUrl: "https://www.francetvinfo.fr/",
    kind: "media",
    independenceGroup: "France Télévisions",
    feeds: [{ url: "https://www.francetvinfo.fr/titres.rss", language: "fr" }],
  },
  {
    slug: "le-figaro",
    name: "Le Figaro",
    homepageUrl: "https://www.lefigaro.fr/",
    kind: "media",
    independenceGroup: "Groupe Figaro",
    feeds: [{ url: "https://www.lefigaro.fr/rss/figaro_actualites.xml", language: "fr" }],
  },
];
