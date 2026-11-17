import robotsParser from "robots-parser";

/** Robots d'IA surveillés : un blocage de l'un d'eux exprime un refus de l'IA. */
export const AI_BOTS = ["ClaudeBot", "anthropic-ai", "GPTBot", "CCBot", "Google-Extended"] as const;

/** Robots d'IA auxquels le robots.txt interdit la racine du site. */
export function blockedAiBots(robotsUrl: string, robotsTxt: string): string[] {
  const robots = robotsParser(robotsUrl, robotsTxt);
  const root = new URL("/", robotsUrl).toString();
  return AI_BOTS.filter((bot) => robots.isDisallowed(root, bot) === true);
}

/** L'URL est-elle autorisée à notre robot ? (`robotsUrl` doit être sur la même origine.) */
export function isAllowedByRobots(
  robotsUrl: string,
  robotsTxt: string,
  url: string,
  userAgent: string,
): boolean {
  return robotsParser(robotsUrl, robotsTxt).isAllowed(url, userAgent) !== false;
}
