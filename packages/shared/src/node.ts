import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Fichier .env à la racine du dépôt, quel que soit le dossier d'où l'on lance la commande. */
const ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

/** Charge le .env racine s'il existe ; les variables déjà définies ne sont pas écrasées. */
export function loadRootEnv(): void {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
}

/** Lit une variable obligatoire et échoue avec un message clair si elle manque. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}
