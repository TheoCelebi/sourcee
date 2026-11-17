import { errorMessage } from "../log";
import type { HttpGet } from "../http";
import type { ComplianceEvidence } from "./policy";
import { blockedAiBots, isAllowedByRobots } from "./robots";
import { tdmReservedByFile, tdmReservedByHeaders, tdmReservedByHtml } from "./tdm";

export interface SourceUnderCheck {
  homepageUrl: string;
  feeds: { id: number; url: string }[];
}

export type InspectionResult =
  | { kind: "ok"; evidence: ComplianceEvidence; feedAccess: Map<number, boolean> }
  /** Définitif : le robots.txt refuse d'être lu (401, 403…). La source est exclue. */
  | { kind: "blocked"; reason: string }
  /** Temporaire : réseau ou erreur serveur. Le niveau précédent est conservé. */
  | { kind: "unreachable"; reason: string };

type RobotsRules =
  | { kind: "rules"; url: string; text: string }
  | { kind: "none" }
  | { kind: "blocked"; reason: string }
  | { kind: "unreachable"; reason: string };

/** Interroge robots.txt, TDMRep et les en-têtes d'une source, sans rien écrire en base. */
export class SourceInspector {
  private readonly robotsCache = new Map<string, Promise<RobotsRules>>();

  constructor(
    private readonly http: HttpGet,
    private readonly userAgent: string,
    private readonly timeoutMs = 15_000,
  ) {}

  async inspect(source: SourceUnderCheck): Promise<InspectionResult> {
    const origin = new URL(source.homepageUrl).origin;
    const siteRobots = await this.robots(origin);
    if (siteRobots.kind === "blocked" || siteRobots.kind === "unreachable") return siteRobots;

    const aiBotsBlocked =
      siteRobots.kind === "rules" ? blockedAiBots(siteRobots.url, siteRobots.text) : [];
    let tdmReserved = (await this.tdmFile(origin)) || (await this.tdmHomepage(source.homepageUrl));

    const feedAccess = new Map<number, boolean>();
    for (const feed of source.feeds) {
      const feedOrigin = new URL(feed.url).origin;
      const rules = feedOrigin === origin ? siteRobots : await this.robots(feedOrigin);
      if (rules.kind === "unreachable") return rules;
      const allowed =
        rules.kind === "none" ||
        (rules.kind === "rules" &&
          isAllowedByRobots(rules.url, rules.text, feed.url, this.userAgent));
      feedAccess.set(feed.id, allowed);
      if (allowed && !tdmReserved) tdmReserved = await this.tdmFeedHeader(feed.url);
    }

    const feedAllowed = [...feedAccess.values()].some(Boolean);
    return { kind: "ok", evidence: { feedAllowed, aiBotsBlocked, tdmReserved }, feedAccess };
  }

  private robots(origin: string): Promise<RobotsRules> {
    let pending = this.robotsCache.get(origin);
    if (!pending) {
      pending = this.fetchRobots(origin);
      this.robotsCache.set(origin, pending);
    }
    return pending;
  }

  private async fetchRobots(origin: string): Promise<RobotsRules> {
    // On garde l'URL d'origine (et non l'URL finale) : les règles s'appliquent à cette origine.
    const url = `${origin}/robots.txt`;
    try {
      const response = await this.get(url, { maxBytes: 500_000 });
      if (response.status >= 200 && response.status < 300) {
        return { kind: "rules", url, text: response.body };
      }
      if (response.status === 404 || response.status === 410) return { kind: "none" };
      if (response.status >= 500) {
        return { kind: "unreachable", reason: `robots.txt : HTTP ${response.status}` };
      }
      return { kind: "blocked", reason: `robots.txt illisible : HTTP ${response.status}` };
    } catch (error) {
      return { kind: "unreachable", reason: `robots.txt : ${errorMessage(error)}` };
    }
  }

  private async tdmFile(origin: string): Promise<boolean> {
    try {
      const response = await this.get(`${origin}/.well-known/tdmrep.json`, { maxBytes: 200_000 });
      return response.status === 200 && tdmReservedByFile(response.body);
    } catch {
      return false;
    }
  }

  private async tdmHomepage(url: string): Promise<boolean> {
    try {
      const response = await this.get(url, { maxBytes: 4_000_000 });
      return tdmReservedByHeaders(response.headers) || tdmReservedByHtml(response.body);
    } catch {
      return false;
    }
  }

  private async tdmFeedHeader(url: string): Promise<boolean> {
    try {
      return tdmReservedByHeaders((await this.get(url, { headersOnly: true })).headers);
    } catch {
      return false;
    }
  }

  private get(url: string, options: { maxBytes?: number; headersOnly?: boolean }) {
    return this.http(url, { userAgent: this.userAgent, timeoutMs: this.timeoutMs, ...options });
  }
}
