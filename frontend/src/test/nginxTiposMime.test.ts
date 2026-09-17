import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Guarda del `nginx.conf` que sirve el frontend.
 *
 *  El 17/09/2026 ningún PDF del correo se podía ver: el worker de pdf.js es un
 *  `.mjs` y se servía como `application/octet-stream`. El navegador se NIEGA a
 *  ejecutar un módulo con ese tipo, así que el `import()` moría con "Failed to
 *  fetch dynamically imported module". El archivo estaba y daba 200 — lo que
 *  estaba mal era el tipo, que es de las cosas que no se ven mirando el código.
 *
 *  ⚠️ Se lee con `fs` y no con `?raw`: un import que no resuelve deja el test
 *  sin cargar y el gate lo cuenta como verde (ver vitest_gate_test_files).
 */
// Desde la raíz del repo (root de vitest), como campanaEnVivo.test.ts:
// `__dirname` no existe en módulos ES y además molesta a tsc.
const conf = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");

describe("nginx.conf: los módulos .mjs", () => {
  it("tiene un bloque propio para .mjs", () => {
    expect(conf).toMatch(/location\s+~\*\s+\\\.mjs\$/);
  });

  it("los sirve con un tipo de JavaScript, no como octet-stream", () => {
    const bloque = conf.slice(conf.search(/location\s+~\*\s+\\\.mjs\$/));
    const hasta = bloque.indexOf("}");
    expect(bloque.slice(0, hasta)).toMatch(
      /default_type\s+(application|text)\/javascript\s*;/,
    );
  });

  it("⚠️ va ANTES del regex de estáticos, porque nginx toma el primero que matchea", () => {
    const mjs = conf.search(/location\s+~\*\s+\\\.mjs\$/);
    const estaticos = conf.search(/location\s+~\*\s+\\\.\(js\|css\|/);
    expect(mjs).toBeGreaterThan(-1);
    expect(estaticos).toBeGreaterThan(-1);
    expect(mjs).toBeLessThan(estaticos);
  });

  it("⚠️ el regex de estáticos NO agarra .mjs, y por eso hace falta el bloque aparte", () => {
    // ".mjs" no termina en ".js": el grupo (js|css|…) exige un punto justo
    // antes. Si alguien "arregla" esto metiendo mjs en ese grupo, el archivo
    // recuperaría la caché pero seguiría sin tipo — y el bug vuelve.
    const m = conf.match(/location\s+~\*\s+\\\.\(([^)]+)\)\$/);
    expect(m).not.toBeNull();
    const extensiones = m![1].split("|");
    const regex = new RegExp(`\\.(${m![1]})$`, "i");
    expect(regex.test("pdf.worker.min-yatZIOMy.mjs")).toBe(false);
    expect(extensiones).toContain("js");
  });
});
