import type { WorkerConfig } from "../config";
import { createClaudeCodeModel, findExecutable } from "./claudeCode";
import { createApiModel, hasApiKey, type SummaryModel } from "./model";

export type { SummaryModel } from "./model";

/** Choisit le moyen d'accès au modèle selon SUMMARY_PROVIDER ; null si aucun n'est disponible. */
export function createSummaryModel(
  config: Pick<WorkerConfig, "summaryProvider" | "summaryModel" | "claudeBin">,
  find: (name: string) => string | null = findExecutable,
): SummaryModel | null {
  const { summaryProvider: provider } = config;
  if (provider === "off") return null;
  if (provider === "api" || (provider === "auto" && hasApiKey())) {
    return createApiModel(config.summaryModel);
  }
  const bin = find(config.claudeBin);
  if (!bin) return null;
  return createClaudeCodeModel(bin, config.summaryModel);
}
