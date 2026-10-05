import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ⚠️ Se lee el fuente con `fs` y no con `?raw`: el `?raw` no llega fuera de
// frontend/ y una guarda que no carga pasa como verde sin revisar nada.
const raiz = resolve(process.cwd(), "supabase/functions");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

// El trigger validate_notification_fields rechaza cualquier otra prioridad
// ('Invalid priority: …') y el aviso no se guarda. 05/10/2026: las menciones
// del Correo mandaban "normal" desde que existen y nunca le llegó una a nadie.
const VALIDAS = ["high", "medium", "low"];

describe("los avisos de las edge functions usan una prioridad que la base acepta", () => {
  const archivos = readdirSync(raiz, { recursive: true, encoding: "utf8" }).filter(
    (f) => f.endsWith(".ts") && !f.includes("test"),
  );

  it("encuentra las edge functions (si no, la guarda no revisa nada)", () => {
    expect(archivos.length).toBeGreaterThan(20);
    expect(archivos).toContain(join("mail-fetch", "index.ts"));
  });

  it("ninguna escribe una prioridad fuera de high/medium/low", () => {
    const malas: string[] = [];
    for (const f of archivos) {
      for (const m of leer(f).matchAll(/\bpriority\s*:\s*["'`]([^"'`]+)["'`]/g)) {
        if (!VALIDAS.includes(m[1])) malas.push(`${f}: ${m[1]}`);
      }
    }
    expect(malas).toEqual([]);
  });

  it("la mención del Correo va como la del Messenger (high)", () => {
    const fuente = leer(join("mail-fetch", "index.ts"));
    const i = fuente.indexOf('type: "correo_mencion"');
    expect(i, "no está el aviso de mención").toBeGreaterThan(-1);
    expect(fuente.slice(i, i + 600)).toMatch(/priority:\s*"high"/);
  });
});
