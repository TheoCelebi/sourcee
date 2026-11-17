import { describe, expect, it } from "vitest";
import { detectAgency, detectContentType } from "./classify";
import { buildArticles, type FeedToCollect } from "./collect";
import { extractHints, sectionWords } from "./hints";
import { canonicalUrl, pathSegments } from "./normalize";
import { parseFeed } from "./parse";
import { cleanText, truncateAtSentence } from "./text";

describe("texte", () => {
  it("retire les balises et décode les entités, même encodées deux fois", () => {
    expect(cleanText("<p>L&#039;alerte &amp;#039;levée&amp;#039; </p>")).toBe("L'alerte 'levée'");
  });

  it("coupe de préférence à la fin d'une phrase", () => {
    const text = "Première phrase assez longue. Deuxième phrase qui dépasse la limite fixée.";
    expect(truncateAtSentence(text, 45)).toBe("Première phrase assez longue.");
  });
});

describe("URL", () => {
  it("retire fragment et paramètres de suivi, garde les autres", () => {
    expect(canonicalUrl("https://Exemple.fr/a?id=3&utm_source=rss&xtor=RSS-1#top")).toBe(
      "https://exemple.fr/a?id=3",
    );
  });

  it("rejette ce qui n'est pas une page web", () => {
    expect(canonicalUrl("mailto:redaction@exemple.fr")).toBeNull();
    expect(canonicalUrl("pas une url")).toBeNull();
  });

  it("décode les segments du chemin", () => {
    expect(pathSegments("https://www.france24.com/fr/am%C3%A9riques/20261117-x")).toEqual([
      "fr",
      "ameriques",
      "20261117-x",
    ]);
  });
});

describe("type de contenu", () => {
  const news = { categories: [] as string[] };

  it("repère les tribunes par l'URL, le titre ou la catégorie", () => {
    expect(
      detectContentType({
        ...news,
        url: "https://www.theguardian.com/commentisfree/2026/nov/17/x",
        title: "A column",
      }),
    ).toBe("opinion");
    expect(
      detectContentType({ ...news, url: "https://exemple.fr/a", title: "Tribune : il faut agir" }),
    ).toBe("opinion");
    expect(
      detectContentType({
        ...news,
        url: "https://exemple.fr/a",
        title: "The Guardian view on budgets",
      }),
    ).toBe("opinion");
    expect(
      detectContentType({ url: "https://exemple.fr/a", title: "Un titre", categories: ["Idées"] }),
    ).toBe("opinion");
  });

  it("repère les contenus sponsorisés", () => {
    expect(
      detectContentType({ ...news, url: "https://exemple.fr/partenaire/offre", title: "Offre" }),
    ).toBe("sponsored");
    expect(
      detectContentType({
        ...news,
        url: "https://exemple.fr/a",
        title: "Contenu sponsorisé : voyage",
      }),
    ).toBe("sponsored");
  });

  it("laisse les articles d'information, y compris « Comment… »", () => {
    expect(
      detectContentType({
        ...news,
        url: "https://exemple.fr/international/a",
        title: "Comment la Chine prépare le sommet",
      }),
    ).toBe("news");
  });
});

describe("agence de presse", () => {
  it("lit le champ auteur", () => {
    expect(detectAgency({ creator: "Le Journal avec AFP" })).toBe("AFP");
    expect(detectAgency({ creator: "Reuters" })).toBe("Reuters");
    expect(detectAgency({ creator: "AP" })).toBe("AP");
    expect(detectAgency({ creator: "Apolline Martin" })).toBeNull();
  });

  it("ne retient dans le texte que les formules d'attribution", () => {
    expect(detectAgency({ texts: ["Séisme au large du Japon (AFP)"] })).toBe("AFP");
    expect(detectAgency({ texts: ["Un journaliste de Reuters libéré"] })).toBeNull();
  });
});

describe("indices de thème et de zone", () => {
  it("lit la rubrique et ignore le titre de l'article dans l'URL", () => {
    expect(
      sectionWords(
        "https://www.lemonde.fr/planete/article/2026/11/17/la-france-au-sommet-du-climat-a-belem_6612345_3244.html",
      ),
    ).toEqual(["planete", "article"]);
    expect(
      extractHints({ url: "https://www.bbc.com/news/world-europe-12345678", categories: [] }),
    ).toEqual({
      themes: ["international"],
      zones: ["europe"],
    });
  });

  it("reconnaît les rubriques composées", () => {
    expect(
      extractHints({
        url: "https://www.scmp.com/news/hong-kong/politics/article/3374713/x",
        categories: [],
      }),
    ).toEqual({ themes: ["politique"], zones: ["asie-pacifique"] });
  });

  it("combine catégories et valeurs par défaut du flux", () => {
    expect(
      extractHints({
        url: "https://exemple.org/2026/11/17/story",
        categories: ["Middle East", "Climate crisis"],
        defaultTheme: "international",
      }),
    ).toEqual({ themes: ["international", "environnement"], zones: ["moyen-orient"] });
  });
});

describe("lecture des flux", () => {
  it("lit un flux RSS 2.0", async () => {
    const [item] = await parseFeed(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title>
<item>
  <title><![CDATA[Séisme : l&#039;alerte au tsunami levée]]></title>
  <link>https://exemple.fr/monde/article-1?utm_source=rss</link>
  <guid isPermaLink="false">abc-1</guid>
  <pubDate>Tue, 17 Nov 2026 08:30:00 +0100</pubDate>
  <dc:creator>Le Journal avec AFP</dc:creator>
  <category domain="https://exemple.fr">International</category>
  <category>Asie</category>
  <description><![CDATA[<p>Un séisme de magnitude 6,1 a frappé l'archipel.</p>]]></description>
</item></channel></rss>`);
    expect(item).toEqual({
      guid: "abc-1",
      link: "https://exemple.fr/monde/article-1?utm_source=rss",
      title: "Séisme : l'alerte au tsunami levée",
      excerpt: "Un séisme de magnitude 6,1 a frappé l'archipel.",
      publishedAt: new Date("2026-11-17T07:30:00Z"),
      categories: ["International", "Asie"],
      creator: "Le Journal avec AFP",
    });
  });

  it("lit un flux Atom", async () => {
    const [item] = await parseFeed(`<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<entry><title>Budget voted</title><link href="https://example.org/a/1"/><id>tag:example.org,2026:1</id>
<updated>2026-11-17T10:00:00Z</updated><author><name>Reuters</name></author>
<summary>The parliament adopted the budget.</summary></entry></feed>`);
    expect(item).toMatchObject({
      link: "https://example.org/a/1",
      title: "Budget voted",
      publishedAt: new Date("2026-11-17T10:00:00Z"),
      creator: "Reuters",
    });
  });

  it("lit un flux RSS 1.0 (RDF)", async () => {
    const [item] = await parseFeed(`<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://dw.example/"><title>DW</title><link>https://dw.example/</link><description>x</description></channel>
<item rdf:about="https://dw.example/en/story/a-1"><title>Story</title><link>https://dw.example/en/story/a-1</link>
<description>Text</description><dc:date>2026-11-17T09:00:00Z</dc:date></item></rdf:RDF>`);
    expect(item).toMatchObject({
      link: "https://dw.example/en/story/a-1",
      title: "Story",
      publishedAt: new Date("2026-11-17T09:00:00Z"),
    });
  });
});

describe("buildArticles", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const feed: FeedToCollect = {
    id: 1,
    url: "https://exemple.fr/rss",
    language: "fr",
    etag: null,
    lastModified: null,
    sourceId: 7,
    policy: "open",
    defaultTheme: null,
    defaultZone: "france",
  };
  const item = {
    guid: null,
    link: "https://exemple.fr/politique/a?utm_medium=rss",
    title: "Le budget adopté",
    excerpt: "Les députés ont adopté le budget (AFP).",
    publishedAt: new Date("2026-11-17T10:00:00Z"),
    categories: [],
    creator: null,
  };

  it("garde le chapô des sources ouvertes seulement", () => {
    expect(buildArticles([item], feed, now, 72)[0]).toMatchObject({
      url: "https://exemple.fr/politique/a",
      excerpt: "Les députés ont adopté le budget (AFP).",
      agency: "AFP",
      contentType: "news",
      themeHints: ["politique"],
      zoneHints: ["france"],
    });
    const linksOnly = buildArticles([item], { ...feed, policy: "links_only" }, now, 72)[0];
    expect(linksOnly?.excerpt).toBeNull();
    expect(linksOnly?.agency).toBeNull();
  });

  it("écarte les doublons et les articles trop anciens, ramène le futur à maintenant", () => {
    const rows = buildArticles(
      [
        item,
        { ...item, link: "https://exemple.fr/politique/a?utm_source=x" },
        { ...item, link: "https://exemple.fr/b", publishedAt: new Date("2026-11-10T10:00:00Z") },
        { ...item, link: "https://exemple.fr/c", publishedAt: new Date("2026-11-18T10:00:00Z") },
      ],
      feed,
      now,
      72,
    );
    expect(rows.map((row) => row.url)).toEqual([
      "https://exemple.fr/politique/a",
      "https://exemple.fr/c",
    ]);
    expect(rows[1]?.publishedAt).toEqual(now);
  });
});
