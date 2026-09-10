import { describe, it, expect } from "vitest";

// LA MINIATURA DEL ADJUNTO NO SE DECODIFICA EN ASYNC.
//
// Jhon (10/09): "mientras escribo, la miniatura del archivo que voy a mandar
// parpadea". No era React: un MutationObserver sobre la tira registró 0
// mutaciones tecleando 25 letras. Era el pintado — con decoding="async", cada
// cambio de alto del compositor invalida la capa y Chrome pinta un frame vacío
// hasta tener el bitmap. Esta guarda evita que alguien lo "optimice" de vuelta.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/messenger/components/MessageInput.tsx", { query: "?raw", import: "default", eager: true });

describe("miniatura de adjuntos pendientes", () => {
  it("existe y dibuja la preview", () => {
    const c = Object.values(fuentes)[0];
    expect(c).toBeTruthy();
    expect(c).toMatch(/<img src=\{pf\.preview\}/);
  });

  it("no lleva decoding=\"async\"", () => {
    const c = Object.values(fuentes)[0];
    const miniatura = c.match(/<img src=\{pf\.preview\}[^>]*>/)?.[0] ?? "";
    expect(miniatura).not.toContain('decoding="async"');
    expect(miniatura).toContain('decoding="sync"');
  });
});
