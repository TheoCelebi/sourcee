import type { UsagePolicy } from "@sourcee/db";

export interface ComplianceEvidence {
  /** Au moins un flux de la source est autorisé à notre robot par robots.txt. */
  feedAllowed: boolean;
  /** Robots d'IA bloqués sur le domaine principal de l'éditeur. */
  aiBotsBlocked: string[];
  /** Réserve formelle de fouille de textes (TDMRep). */
  tdmReserved: boolean;
}

/**
 * Règle « respect strict » validée pour le projet :
 * - réserve TDM ou flux interdit → la source n'est pas collectée ;
 * - robot d'IA bloqué → titre et lien seulement, jamais envoyés au modèle de résumé ;
 * - sinon → la source peut alimenter les résumés.
 */
export function decidePolicy(evidence: ComplianceEvidence): UsagePolicy {
  if (!evidence.feedAllowed || evidence.tdmReserved) return "excluded";
  if (evidence.aiBotsBlocked.length > 0) return "links_only";
  return "open";
}
