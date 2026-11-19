import { describe, expect, it } from "vitest";
import translations from "@/lib/i18n";
import { CATALOGO_POSICIONES, TODAS_LAS_CLAVES } from "@/lib/posiciones/catalogo";

// Guarda del catálogo de Posiciones (estilo Blu): cada etiqueta existe en el
// diccionario y ninguna función se repite (un check repetido guardaría dos
// veces la misma llave y el «Todo» de la sección contaría mal).
describe("catálogo de posiciones", () => {
  it("toda etiqueta tiene su texto en es y en", () => {
    const dic = translations as unknown as Record<string, { es?: string; en?: string }>;
    const etiquetas = CATALOGO_POSICIONES.flatMap((s) => [s.etiqueta, ...s.grupos.flatMap((g) => [g.etiqueta, ...g.filas.flatMap((f) => [f.etiqueta, ...f.funciones.map((x) => x.etiqueta)])])]);
    const faltan = etiquetas.filter((k) => !dic[k]?.es || !dic[k]?.en);
    expect(faltan).toEqual([]);
  });
  it("ninguna función se repite", () => {
    expect(new Set(TODAS_LAS_CLAVES).size).toBe(TODAS_LAS_CLAVES.length);
  });
});
