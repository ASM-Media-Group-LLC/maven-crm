import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
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
        // Estrategia (2026-05-14):
        //   1. Vendor base (react/router/query/supabase/radix base): siempre
        //      en el bundle inicial — todo el shell depende de eso.
        //   2. Vendors específicos (charts/dnd/pdf): NO preloadeados,
        //      cargan on-demand cuando una página los importa. Pdf por
        //      ejemplo sólo se usa en Facturación.
        //   3. Páginas: chunk por módulo (carpeta `pages/<modulo>/`). HR
        //      entero en un solo chunk, Finanzas entero en otro, etc.
        //      El AppShell hace prefetch de los chunks accesibles por
        //      permisos del user en idle, así la nav se siente instantánea.
        manualChunks(id) {
          // Vendors base — siempre en bundle inicial.
          if (id.includes('node_modules')) {
            if (id.match(/react-dom|react-router-dom|\/react\//)) return 'vendor-react';
            if (id.includes('@tanstack/react-query')) return 'vendor-query';
            if (id.includes('@supabase/supabase-js')) return 'vendor-supabase';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('date-fns')) return 'vendor-date';
            // Vendors específicos — NO en bundle inicial, cargan con la página que los usa.
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('@hello-pangea/dnd')) return 'vendor-dnd';
            if (id.includes('jspdf')) return 'vendor-pdf';
            // Resto de node_modules: cae al chunk de quien lo importe.
            return undefined;
          }

          // Páginas por módulo — un chunk por carpeta de feature. El
          // AppShell prefetchea estos en idle según permisos.
          if (id.includes('/pages/hr/')) return 'mod-hr';
          if (id.includes('/pages/finanzas/')) return 'mod-finanzas';
          if (id.includes('/pages/creadores/')) return 'mod-creadores';
          if (id.includes('/pages/eventos/')) return 'mod-eventos';
          if (id.includes('/pages/chatter-evaluator/')) return 'mod-chatter';
          if (id.includes('/pages/scouter/')) return 'mod-scouter';
          if (id.includes('/pages/agency-qa/')) return 'mod-agency-qa';
          if (id.includes('/pages/proyectomp/')) return 'mod-proyectomp';
          if (id.includes('/pages/sales-')) return 'mod-sales';
          if (id.includes('/pages/sales-audit/') || id.includes('/pages/sales-dashboard/')) return 'mod-sales';
          if (id.includes('/pages/leadgen/')) return 'mod-leadgen';
          if (id.includes('/pages/promolog/')) return 'mod-promolog';
          if (id.includes('/pages/messenger/')) return 'mod-messenger';
          if (id.includes('/pages/closers/')) return 'mod-closers';
          if (id.includes('/pages/tareas/')) return 'mod-tareas';
          if (id.includes('/pages/contactos/')) return 'mod-contactos';
          if (id.includes('/pages/cowork/')) return 'mod-cowork';
          if (id.includes('/pages/supercontacts/')) return 'mod-supercontacts';
          if (id.includes('/pages/admin/')) return 'mod-admin';
          if (id.includes('/pages/panel-de-control/')) return 'mod-dashboard';
          if (id.includes('/pages/hr-')) return 'mod-hr';

          // Páginas top-level que no tienen carpeta dedicada — agruparlas
          // por nombre.
          if (id.match(/\/pages\/(LeadGen|LeadGenBaseDatos)\.tsx$/)) return 'mod-leadgen';
          if (id.match(/\/pages\/(Closers)\.tsx$/)) return 'mod-closers';
          if (id.match(/\/pages\/(Promolog)\.tsx$/)) return 'mod-promolog';
          if (id.match(/\/pages\/(Tareas|TareaProject)\.tsx$/)) return 'mod-tareas';
          if (id.match(/\/pages\/(Contactos|NuevoContacto)\.tsx$/)) return 'mod-contactos';
          if (id.match(/\/pages\/(Eventos|NuevoEvento|EditEvento|EventoDetail)\.tsx$/)) return 'mod-eventos';
          if (id.match(/\/pages\/(Creadores|NuevoCreador|CreadorProfile)\.tsx$/)) return 'mod-creadores';
          if (id.match(/\/pages\/(Chatter\w+)\.tsx$/)) return 'mod-chatter';
          if (id.match(/\/pages\/(Messenger)\.tsx$/)) return 'mod-messenger';
          if (id.match(/\/pages\/(Tickets)\.tsx$/)) return 'mod-tickets';
          if (id.match(/\/pages\/(SuperContacts)\.tsx$/)) return 'mod-supercontacts';
          if (id.match(/\/pages\/(Dashboard|Dashboard2|PanelDeControl)\.tsx$/)) return 'mod-dashboard';
          if (id.match(/\/pages\/(SalesDashboard|SalesAudit|SalesOverview|AiSales)\.tsx$/)) return 'mod-sales';
          // Notificaciones / Settings / DesignSystem / Docs / Roadmap quedan
          // en el bundle común (son comunes y chicos) — Vite los emite
          // como chunks individuales si son lazy, o agrupados si no.
          return undefined;
        },
      },
    },
  },
}));
