import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { pluginMarcaDeBuild } from "./frontend/src/lib/marcaDeBuild";
import { TARJETAS, conTarjeta } from "./frontend/src/lib/tarjetasDeLink";
import fs from "node:fs";
import { pluginIdiomas } from "./scripts/i18n/vitePluginIdiomas";

// https://vitejs.dev/config/
//
// Repo layout (since the frontend / backend / servicios split):
//   frontend/index.html  ← Vite entry
//   frontend/src/        ← UI source
//   frontend/public/     ← static assets
//   backend/supabase/    ← edge functions + migrations (deno, separate runtime)
//   servicios/           ← reserved for future microservices
//
// Vite is told `root: 'frontend'` so it picks up index.html from there,
// and `build.outDir: '../dist'` so the build output still ends up at
// the repo root for Dokploy / nginx to serve.
// La tarjeta de WhatsApp de los links de reunión y de Cowork (src/lib/tarjetasDeLink.ts):
// una copia de index.html por tarjeta, con sus <meta og:…>. nginx.conf entrega cada
// copia en su ruta; la app que arranca es la misma.
function pluginTarjetasDeLink() {
  return {
    name: "tarjetas-de-link",
    apply: "build" as const,
    writeBundle(options: { dir?: string }) {
      const dir = options.dir;
      if (!dir) return;
      const base = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      for (const t of [TARJETAS.reunion, TARJETAS.cowork]) {
        fs.writeFileSync(path.join(dir, t.archivo), conTarjeta(base, t));
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: "frontend",
  publicDir: "public",
  server: {
    host: "::",
    // Honour the PORT env var when present (Claude Code preview /
    // Dokploy / generic harnesses set it). Falls back to 8080 for
    // bare `npm run dev` invocations.
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Un paquete de traducciones por idioma (lib/i18n.ts → cargarIdioma).
    pluginIdiomas(),
    // La hora del build va como <meta> en index.html, NO en el JavaScript: así dos
    // builds del mismo código dan los mismos chunks y el mismo sw.js (ver
    // lib/marcaDeBuild.ts). En `npm run dev` es la hora en que arrancó el servidor.
    pluginMarcaDeBuild(),
    pluginTarjetasDeLink(),
    mode === "production" && VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Maven",
        short_name: "Maven",
        description: "Correo, chat, oficina virtual y operación, en una sola sesión.",
        theme_color: "#1a1a2e",
        background_color: "#101827",
        display: "standalone",
        // id/scope fijos para que el navegador reconozca la misma app entre
        // deploys. start_url: la app instalada abre el dashboard (o el login si
        // no hay sesión), no la portada de marketing.
        id: "/",
        scope: "/",
        start_url: "/dashboard",
        lang: "es",
        // La baldosa de la marca (la misma del logo). Antes el único icono era
        // el .ico de 64px con el nombre recortado, y al instalar Maven en el
        // teléfono quedaba borroso.
        icons: [
          { src: "/icon-192.png?v=6", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png?v=6", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        shortcuts: [
          {
            name: "Messenger",
            short_name: "Chat",
            url: "/messenger",
            icons: [{ src: "/icon-192.png?v=6", sizes: "192x192", type: "image/png" }],
          },
        ],
      },
      workbox: {
        // Sin mapas para el service worker: con build.sourcemap prendido (abajo),
        // workbox los generaba y sw.js los nombraba; el Dockerfile los borra y
        // quedaba un pedido a un archivo que no existe.
        sourcemap: false,
        skipWaiting: true,
        clientsClaim: true,
        // Handlers de Web Push (llamada entrante con Maven cerrado). Se importan
        // al SW generado en vez de reescribirlo. El archivo vive en public/.
        importScripts: ["sw-push.js"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        // SOLO EL ARMAZÓN, no la app entera.
        //
        // Antes era "**/*.js", así que el service worker se descargaba los 245
        // chunks —8,8 MB— en segundo plano apenas alguien abría Maven, y cada
        // deploy lo invalidaba entero. Con treinta personas y varios deploys por
        // día, eso es una cantidad enorme de tráfico saliendo del servidor, que
        // encima compite con el video de LiveKit por el mismo uplink.
        //
        // Ahora se precachea lo que hace falta para arrancar —el entry, los
        // vendors compartidos, estilos, fuentes e íconos— y las páginas se
        // cachean cuando alguien realmente las abre (regla de abajo). Los
        // nombres llevan hash, así que una versión cacheada nunca queda vieja:
        // un deploy genera nombres nuevos.
        globPatterns: [
          "**/*.{css,ico,png,svg,woff2}",
          "assets/index-*.js",
          "assets/vendor-*.js",
        ],
        navigateFallback: undefined,
        // /aportar/ también queda fuera del fallback del SW: nunca debería
        // servirse HTML cacheado para ese link público (ver fetch handler en
        // sw-push.js que además auto-desinstala el SW cuando lo ve).
        navigateFallbackDenylist: [/^\/~oauth/, /^\/aportar\//, /^\/subir\//],
        runtimeCaching: [
          {
            // Los chunks de página: se guardan la primera vez que alguien entra
            // a esa sección y de ahí en adelante salen de la caché. El hash en
            // el nombre hace que StaleWhileRevalidate sea seguro — el contenido
            // de un nombre dado no cambia nunca.
            urlPattern: /\/assets\/.*\.js$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "chunks-cache",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "html-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/chat_messages/,
            handler: "NetworkFirst",
            options: {
              cacheName: "chat-messages-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/chat_conversations/,
            handler: "NetworkFirst",
            options: {
              cacheName: "chat-conversations-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend/src"),
    },
  },
  build: {
    // Build output goes to <repo-root>/dist so Dokploy/nginx still find
    // the static files at the same path they used before the split.
    outDir: path.resolve(__dirname, "./dist"),
    emptyOutDir: true,
    // QUÉ CONGELA LA PÁGINA (17/11/2026). llamada_salud.datos.trabas dice el
    // archivo y la función que trabaron la página («vendor-radix.js:B»,
    // «index.js:m»), pero con nombres minificados. Los mapas de fuente dicen a
    // qué código corresponden. «hidden»: se generan, pero los .js no los
    // nombran (el navegador no los pide) y el Dockerfile los saca de la imagen,
    // así que nunca se sirven. Para leerlos: scripts/mapas-de-produccion.sh.
    // ⚠️ Solo con MAVEN_MAPAS=1: generarlos en el build de la imagen se quedaba
    // sin memoria (heap de 2 GB, CI del 17/11) y habría tumbado el deploy.
    sourcemap: process.env.MAVEN_MAPAS === "1" ? "hidden" : false,
    // The eager-loaded sidebar pages push the main chunk over Vite's
    // default 500 KB warning threshold. We don't care about the warning
    // since manualChunks below splits it into reasonable vendor pieces.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      ...(mode !== "production" && {
        external: ["virtual:pwa-register"],
      }),
      output: {
        // Split heavy vendors into their own chunks so the main bundle
        // stays small enough for the workbox precache and the browser
        // can cache them independently across deploys (vendor versions
        // change less often than app code).
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-label",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-toast",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
          ],
          "vendor-date": ["date-fns"],
          "vendor-icons": ["lucide-react"],
          // recharts, jspdf y dnd NO se listan a proposito. Nombrarlos aca los
          // convierte en parte del grafo inicial: Vite les pone un
          // <link rel="modulepreload"> en el index.html y se descargan al abrir
          // el login, donde nadie ve un grafico ni genera un PDF. Sin listarlos,
          // Vite los reparte con las paginas que si los usan y llegan cuando
          // alguien entra a esa seccion. Son 846 KB que dejan de viajar en cada
          // primera carga.
        },
      },
    },
  },
}));
