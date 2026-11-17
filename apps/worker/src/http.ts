export interface HttpResponse {
  status: number;
  /** URL finale, après redirections. */
  url: string;
  headers: Headers;
  body: string;
}

export interface HttpRequest {
  userAgent: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Au-delà de cette taille, la lecture échoue. */
  maxBytes?: number;
  /** Ne lit que les en-têtes : le corps est abandonné. */
  headersOnly?: boolean;
}

export type HttpGet = (url: string, request: HttpRequest) => Promise<HttpResponse>;

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, " +
  "text/html;q=0.8, */*;q=0.5";

export const httpGet: HttpGet = async (url, request) => {
  const response = await fetch(url, {
    headers: { "User-Agent": request.userAgent, Accept: ACCEPT, ...request.headers },
    redirect: "follow",
    signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
  });
  if (request.headersOnly) {
    await response.body?.cancel();
    return { status: response.status, url: response.url, headers: response.headers, body: "" };
  }
  const bytes = await readAtMost(response, request.maxBytes ?? 5_000_000);
  return {
    status: response.status,
    url: response.url,
    headers: response.headers,
    body: decodeBody(bytes, response.headers.get("content-type")),
  };
};

async function readAtMost(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Réponse trop volumineuse (plus de ${maxBytes} octets)`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Décode selon le charset annoncé (en-tête HTTP, puis déclaration XML), UTF-8 par défaut. */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(
      new TextDecoder("latin1").decode(bytes.subarray(0, 200)),
    )?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
