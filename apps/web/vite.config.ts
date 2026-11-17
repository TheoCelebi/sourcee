import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Le .env est à la racine du dépôt : on y lit le port de l'API pour le relais de développement.
  const env = loadEnv(mode, "../..", "");
  const apiPort = env.API_PORT || "3000";

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icon.svg", "apple-touch-icon.png"],
        manifest: {
          name: "Sourcé — les faits du jour",
          short_name: "Sourcé",
          description: "Les faits du jour, chacun avec ses sources.",
          lang: "fr",
          start_url: "/",
          display: "standalone",
          theme_color: "#1d1b16",
          background_color: "#f6f1e7",
          icons: [
            { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Les polices (sous-ensembles latins) sont précachées pour une lecture hors ligne fidèle.
          globPatterns: ["**/*.{js,css,html,svg,png}", "**/*-latin-*.woff2"],
          navigateFallbackDenylist: [/^\/api\//],
          // La dernière édition consultée reste lisible hors connexion.
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
              handler: "NetworkFirst",
              options: {
                cacheName: "api",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
  };
});
