// ⚠️ EL QUERY BUILDER DE SUPABASE-JS ES PEREZOSO.
//
// `supabase.from("x").update({...}).eq(...)` NO envía nada por sí solo: construye
// la consulta y espera a que alguien la consuma (`await` o `.then`). Un `void`
// suelto delante la deja construida y **nunca enviada**, sin error, sin aviso y
// sin nada en la pestaña de red. El código se lee como si guardara.
//
// Costó dos rondas de "sigue el error": el estado del Messenger no se guardaba
// nunca desde el menú (usaba `void`) mientras el del diálogo sí (usa `await`).
// Buscando el patrón aparecieron cinco escrituras más del Chatter Evaluator
// —el "está escribiendo" del fan y el "leído por el examinador"— que llevaban
// tiempo muertas en silencio por lo mismo.
//
// Cómo se cumple: si de verdad es fire-and-forget, cerrar con
// `.then(() => {}, () => {})`. Si importa el resultado, `await`.

import { describe, it, expect } from "vitest";

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

/** Statements `void supabase ... ;` que tocan una tabla. Los `void
 *  supabase.functions.invoke(...)` y `void supabase.removeChannel(...)` quedan
 *  fuera: esos SÍ devuelven una promesa de verdad y se ejecutan solos. */
function escriturasMudas(src: string): number {
  const statements: string[] = src.match(/void supabase[\s\S]*?;/g) ?? [];
  return statements.filter((s) => s.includes(".from(") && !s.includes(".then(")).length;
}

describe("las escrituras a Supabase de verdad salen", () => {
  it("ningún `void supabase.from(...)` se queda sin consumir", () => {
    const culpables: string[] = [];
    for (const [ruta, src] of Object.entries(fuentes)) {
      if (ruta.includes("/test/")) continue;
      const n = escriturasMudas(src);
      if (n > 0) culpables.push(`${ruta} (${n})`);
    }

    // Si esto falla: cierra la cadena con `.then(() => {}, () => {})` cuando el
    // resultado no importa, o con `await` cuando sí. No agregues excepciones:
    // una consulta que nunca sale es indistinguible de una que falla en
    // silencio, y es exactamente lo que hay que evitar.
    expect(culpables).toEqual([]);
  });

  it("el guard reconoce el patrón (si esto falla, la detección dejó de servir)", () => {
    expect(escriturasMudas('void supabase.from("t").update({a:1}).eq("id", x);')).toBe(1);
    expect(escriturasMudas('void supabase.from("t").update({a:1}).eq("id", x).then(() => {});')).toBe(0);
    // Estos se ejecutan solos: no son el bicho.
    expect(escriturasMudas('void supabase.functions.invoke("f", { body });')).toBe(0);
    expect(escriturasMudas("void supabase.removeChannel(canal);")).toBe(0);
  });
});
