import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
export default defineConfig(({ mode }) => ({
  root: "frontend",
  publicDir: "public",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "MAVEN Messenger",
        short_name: "MAVEN",
        description: "All in one platform for Creators' management",
        theme_color: "#1a1a2e",
        background_color: "#0f0f23",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/favicon.ico", sizes: "64x64", type: "image/x-icon" },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Bumped from 5 MB to 12 MB so the main bundle can include the
        // eager-loaded sidebar pages without blowing past the precache
        // limit. Workbox refuses to precache anything larger than this
        // value and aborts the build, hence the deploy error.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: undefined,
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
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
          "vendor-charts": ["recharts"],
          "vendor-date": ["date-fns"],
          "vendor-icons": ["lucide-react"],
          "vendor-dnd": ["@hello-pangea/dnd"],
          "vendor-pdf": ["jspdf", "jspdf-autotable"],
        },
      },
    },
  },
}));
