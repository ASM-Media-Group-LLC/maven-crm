import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      ...(mode !== "production" && {
        external: ["virtual:pwa-register"],
      }),
    },
  },
}));
