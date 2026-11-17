import { EMBEDDING_DIMENSIONS } from "@sourcee/db";
import type { Embedder } from "./cluster/embedder";
import type { HttpGet, HttpRequest, HttpResponse } from "./http";

/**
 * Embedder factice et déterministe : un axe par mot-clé reconnu dans le titre ;
 * les autres titres reçoivent chacun un axe distinct (donc aucun rapprochement).
 */
export function fakeEmbedder(keywords: string[]): Embedder {
  return async (texts) =>
    texts.map((text) => {
      const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      const index = keywords.findIndex((keyword) => text.toLowerCase().includes(keyword));
      const hash = [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7);
      vector[index >= 0 ? index : keywords.length + (hash % 300)] = 1;
      return vector;
    });
}

export interface FakeRoute {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

type Handler = (url: string, request: HttpRequest) => FakeRoute | undefined;

/** Client HTTP factice pour les tests : 404 pour toute URL non prévue. */
export function fakeHttp(
  routes: Record<string, FakeRoute> | Handler,
  calls: string[] = [],
): HttpGet {
  return async (url, request): Promise<HttpResponse> => {
    calls.push(url);
    const route = typeof routes === "function" ? routes(url, request) : routes[url];
    return {
      status: route?.status ?? 404,
      url,
      headers: new Headers(route?.headers ?? {}),
      body: route?.body ?? "",
    };
  };
}

/** Flux RSS 2.0 minimal pour les tests. */
export function rssFeed(
  items: Array<{ title: string; link: string; date: Date; description?: string; creator?: string }>,
): string {
  const entries = items
    .map(
      (item) => `<item>
  <title><![CDATA[${item.title}]]></title>
  <link>${item.link}</link>
  <pubDate>${item.date.toUTCString()}</pubDate>
  ${item.creator ? `<dc:creator>${item.creator}</dc:creator>` : ""}
  <description><![CDATA[${item.description ?? ""}]]></description>
</item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Test</title>
${entries}
</channel></rss>`;
}
