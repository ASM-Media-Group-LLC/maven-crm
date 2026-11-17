import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { pluginIdiomas } from "./scripts/i18n/vitePluginIdiomas";

export default defineConfig({
  plugins: [react(), pluginIdiomas()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./frontend/src/test/setup.ts"],
    include: ["frontend/src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./frontend/src") },
  },
});
