import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";

/** Modèle multilingue (50+ langues), 384 dimensions, exécuté localement. */
export const EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

/** Les modèles téléchargés sont mis en cache à la racine du dépôt (dossier ignoré par git). */
const CACHE_DIR = fileURLToPath(new URL("../../../../.cache/models", import.meta.url));
const BATCH_SIZE = 64;

/** Transforme des textes en vecteurs normalisés (norme 1). */
export type Embedder = (texts: string[]) => Promise<number[][]>;

export function createEmbedder(model = EMBEDDING_MODEL): Embedder {
  let extractor: ReturnType<typeof pipeline<"feature-extraction">> | undefined;
  return async (texts) => {
    if (texts.length === 0) return [];
    env.cacheDir = CACHE_DIR;
    extractor ??= pipeline("feature-extraction", model, { dtype: "q8" });
    const run = await extractor;
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const output = await run(texts.slice(start, start + BATCH_SIZE), {
        pooling: "mean",
        normalize: true,
      });
      vectors.push(...(output.tolist() as number[][]));
    }
    return vectors;
  };
}
