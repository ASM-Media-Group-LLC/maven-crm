import { describe, it, expect } from "vitest";

// EL CONTRATO DEL BUILD: el frontend NO importa nada de supabase/.
//
// El Dockerfile de la raíz construye el frontend con un contexto que EXCLUYE
// supabase/ (.dockerignore, a propósito: así un push que solo toca SQL o edges
// reusa la cache). Un import "../../../supabase/..." compila en tu máquina,
// pasa tsc y `npm run build` locales, y ROMPE el build de Dokploy en silencio:
// el 07/09/2026 seis PR quedaron sin llegar a producción durante tres horas.
//
// Los tests SÍ pueden importar de supabase/ (no entran al build): sirven
// justamente para comprobar que una copia del frontend y la edge coinciden.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

describe("contrato del build: el frontend no importa de supabase/", () => {
  it("ningún archivo fuera de test/ importa desde ../supabase", () => {
    const culpables = Object.entries(fuentes)
      .filter(([ruta]) => !ruta.startsWith("/frontend/src/test/"))
      .filter(([, src]) => /^\s*import\s[^;]*["'](?:\.\.\/)+supabase\//m.test(src))
      .map(([ruta]) => ruta);
    expect(culpables).toEqual([]);
  });
});
