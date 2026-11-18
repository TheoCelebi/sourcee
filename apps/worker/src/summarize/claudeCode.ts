import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { z } from "zod";
import { FatalModelError, type ModelResult, type SummaryModel } from "./model";
import { SummarySchema, SYSTEM_PROMPT } from "./prompt";

/** Résultat brut d'un processus `claude -p`. */
export interface CliOutput {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Lance la commande et renvoie sa sortie ; remplaçable dans les tests. */
export type CliRunner = (bin: string, args: string[], input: string) => Promise<CliOutput>;

const TIMEOUT_MS = 180_000;

/** Exécute `claude` hors du dépôt, sans clé d'API dans l'environnement : l'abonnement est utilisé. */
export const runCli: CliRunner = (bin, args, input) =>
  new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(bin, args, { cwd: tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });

/** Chemin de l'exécutable s'il est trouvé (chemin explicite ou recherche dans le PATH). */
export function findExecutable(name: string): string | null {
  const candidates = name.includes("/")
    ? [name]
    : (process.env.PATH ?? "").split(delimiter).map((dir) => join(dir, name));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Pas ici : on continue.
    }
  }
  return null;
}

// Claude Code refuse la clé « $schema » (métaschéma qu'il ne connaît pas).
const { $schema: _metaschema, ...summaryJsonSchema } = z.toJSONSchema(SummarySchema);
const JSON_SCHEMA = JSON.stringify(summaryJsonSchema);

/** Arguments de `claude -p` : aucun outil, rien d'enregistré, réponse au format imposé. */
export function cliArgs(model: string): string[] {
  return [
    "-p",
    "--model",
    model,
    "--effort",
    "low",
    "--tools",
    "",
    "--no-session-persistence",
    "--system-prompt",
    SYSTEM_PROMPT,
    "--json-schema",
    JSON_SCHEMA,
    "--output-format",
    "json",
  ];
}

const CliResult = z.object({
  is_error: z.boolean().optional(),
  subtype: z.string().optional(),
  stop_reason: z.string().nullable().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      cache_creation_input_tokens: z.number(),
      cache_read_input_tokens: z.number(),
      output_tokens: z.number(),
    })
    .partial()
    .optional(),
});

/** Option refusée par la commande : inutile de continuer la série. */
const USAGE_PROBLEM = /^Error: --/;
const AUTH_PROBLEM = /log ?in|auth|credential|unauthori[sz]ed|forbidden|subscription/i;

/** Interprète la sortie JSON de `claude -p --output-format json`. */
export function parseCliOutput(output: CliOutput): ModelResult {
  const text = output.stdout.trim();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const detail = (output.stderr || text).trim().slice(0, 300) || `code ${output.code}`;
    if (AUTH_PROBLEM.test(detail)) {
      throw new FatalModelError(`Claude Code n'est pas connecté : ${detail}`);
    }
    if (USAGE_PROBLEM.test(detail)) throw new FatalModelError(`Claude Code : ${detail}`);
    return { kind: "error", reason: `Claude Code : ${detail}` };
  }
  const parsed = CliResult.safeParse(raw);
  if (!parsed.success) return { kind: "error", reason: "sortie de Claude Code illisible" };
  const result = parsed.data;

  if (result.is_error || (result.subtype && result.subtype !== "success")) {
    const detail = result.result?.trim() || result.subtype || "erreur inconnue";
    if (AUTH_PROBLEM.test(detail)) {
      throw new FatalModelError(
        `Claude Code n'est pas connecté (lancez claude puis /login) : ${detail}`,
      );
    }
    if (USAGE_PROBLEM.test(detail)) throw new FatalModelError(`Claude Code : ${detail}`);
    return { kind: "error", reason: `Claude Code : ${detail}` };
  }
  if (result.stop_reason === "refusal") return { kind: "refusal", reason: "refus" };

  const summary = SummarySchema.safeParse(result.structured_output);
  if (!summary.success) return { kind: "error", reason: "réponse non conforme au schéma" };
  return {
    kind: "ok",
    summary: summary.data,
    // Claude Code met le prompt système en cache : on compte toutes les entrées.
    inputTokens:
      (result.usage?.input_tokens ?? 0) +
      (result.usage?.cache_creation_input_tokens ?? 0) +
      (result.usage?.cache_read_input_tokens ?? 0),
    outputTokens: result.usage?.output_tokens ?? 0,
  };
}

/**
 * Résumés via Claude Code en mode non interactif (`claude -p`), sur l'abonnement de la
 * personne connectée. Réservé à un usage personnel : un site public passe par l'API.
 */
export function createClaudeCodeModel(
  bin: string,
  model: string,
  run: CliRunner = runCli,
): SummaryModel {
  const args = cliArgs(model);
  return {
    name: `${model} (Claude Code)`,
    // Chaque appel lance un processus : deux à la fois suffisent et ménagent le quota.
    concurrency: 2,
    async summarize(userPrompt) {
      let output: CliOutput;
      try {
        output = await run(bin, args, userPrompt);
      } catch (error) {
        throw new FatalModelError(
          `Impossible de lancer Claude Code (${bin}) : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return parseCliOutput(output);
    },
  };
}
