// Vite del banco «antes → después» (se copia a la raíz de cada árbol; no se sube).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.join(raiz, "frontend"),
  publicDir: "public",
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(raiz, "frontend/src/harness/argosAD/supabaseFalso.ts") },
      { find: "@", replacement: path.join(raiz, "frontend/src") },
    ],
  },
  server: { port: Number(process.env.PORT), strictPort: true, hmr: false },
  css: { postcss: raiz },
});
