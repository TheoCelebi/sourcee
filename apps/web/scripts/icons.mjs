// Génère les icônes PNG de la PWA à partir de public/icon.svg (à relancer si l'icône change).
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const svg = await readFile(new URL("../public/icon.svg", import.meta.url));
for (const [name, size] of [
  ["pwa-512.png", 512],
  ["pwa-192.png", 192],
  ["apple-touch-icon.png", 180],
]) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/${name}`, import.meta.url).pathname);
  console.log(`${name} (${size}×${size})`);
}
