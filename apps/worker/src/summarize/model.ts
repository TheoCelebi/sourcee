import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type ModelSummary, SummarySchema, SYSTEM_PROMPT } from "./prompt";

export type ModelResult =
  | { kind: "ok"; summary: ModelSummary; inputTokens: number; outputTokens: number }
  | { kind: "refusal"; reason: string }
  | { kind: "error"; reason: string };

/** Génère un résumé à partir du prompt utilisateur. Remplaçable dans les tests. */
export interface SummaryModel {
  name: string;
  /** Appels simultanés conseillés (3 par défaut). */
  concurrency?: number;
  summarize(userPrompt: string): Promise<ModelResult>;
}

/** Erreur qui doit interrompre toute la série (clé absente ou refusée). */
export class FatalModelError extends Error {}

/** Une clé d'API (ou un jeton) est-elle configurée ? */
export function hasApiKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Client de l'API Claude ; null si aucune clé n'est configurée. */
export function createApiModel(model: string): SummaryModel | null {
  if (!hasApiKey()) return null;
  const client = new Anthropic();

  return {
    name: model,
    async summarize(userPrompt) {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
          // Tâche d'extraction bornée par les sources : un effort faible suffit.
          output_config: { effort: "low", format: zodOutputFormat(SummarySchema) },
        });
        if (response.stop_reason === "refusal") {
          return { kind: "refusal", reason: response.stop_details?.category ?? "refus" };
        }
        if (response.stop_reason === "max_tokens") {
          return { kind: "error", reason: "réponse tronquée (max_tokens)" };
        }
        if (!response.parsed_output)
          return { kind: "error", reason: "réponse non conforme au schéma" };
        return {
          kind: "ok",
          summary: response.parsed_output,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        if (
          error instanceof Anthropic.AuthenticationError ||
          error instanceof Anthropic.PermissionDeniedError
        ) {
          throw new FatalModelError(`Accès à l'API Claude refusé : ${error.message}`);
        }
        if (error instanceof Anthropic.APIError) {
          return {
            kind: "error",
            reason: `API Claude ${error.status ?? ""} : ${error.message}`.trim(),
          };
        }
        return { kind: "error", reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
