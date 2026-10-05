import { describe, it, expect } from "vitest";

// El trigger validate_notification_fields rechaza cualquier otra prioridad
// ('Invalid priority: …') y el aviso no se guarda. 05/10/2026: las menciones
// del Correo mandaban "normal" desde que existen y nunca le llegó una a nadie.
const VALIDAS = ["high", "medium", "low"];

// ── Las fuentes de las edge functions, como texto ───────────────────────────
// (glob con un patrón literal: Vite lo resuelve al armar, no en tiempo de ejecución)
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/supabase/functions/**/*.ts", "!/supabase/functions/**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("los avisos de las edge functions usan una prioridad que la base acepta", () => {
  const archivos = Object.keys(fuentes);

  it("encuentra las edge functions (si no, la guarda no revisa nada)", () => {
    expect(archivos.length).toBeGreaterThan(20);
    expect(archivos.some((k) => k.endsWith("/mail-fetch/index.ts"))).toBe(true);
  });

  it("ninguna escribe una prioridad fuera de high/medium/low", () => {
    const malas: string[] = [];
    for (const [archivo, texto] of Object.entries(fuentes)) {
      for (const m of texto.matchAll(/\bpriority\s*:\s*["'`]([^"'`]+)["'`]/g)) {
        if (!VALIDAS.includes(m[1])) malas.push(`${archivo}: ${m[1]}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it("la mención del Correo va como la del Messenger (high)", () => {
    const fuente = Object.entries(fuentes).find(([k]) => k.endsWith("/mail-fetch/index.ts"))?.[1] ?? "";
    const i = fuente.indexOf('type: "correo_mencion"');
    expect(i, "no está el aviso de mención").toBeGreaterThan(-1);
    expect(fuente.slice(i, i + 600)).toMatch(/priority:\s*"high"/);
  });
});
