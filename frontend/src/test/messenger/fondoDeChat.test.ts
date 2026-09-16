import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// EL FONDO DEL HILO: resplandor + papel tapiz, en la ventanita y en el grande.
//
// Jhon (16/09): "el fondo es un poco soso" → opción 3 del mock. Vive en la
// raíz de MessageList (la misma pieza en los dos sitios) como dos pseudo-
// elementos en z-index negativo con `isolation: isolate`: detrás del
// scroller, encima del fondo de la raíz. Sin el isolate, el negativo se iría
// detrás del bg-card/85 de la ventanita y no se vería nada.
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = leer("../../index.css");
const lista = leer("../../pages/messenger/components/MessageList.tsx");

describe("fondo de chat", () => {
  it("la raíz de MessageList lo lleva, con y sin mensajes", () => {
    expect(lista.match(/cn\("fondo-de-chat /g)?.length).toBe(2);
  });
  it("aísla el apilado y pinta los dos pseudo-elementos detrás del contenido", () => {
    const raiz = css.match(/\.fondo-de-chat \{([^}]*)\}/)?.[1] ?? "";
    expect(raiz).toMatch(/isolation: isolate/);
    const pseudos = css.match(/\.fondo-de-chat::before,\s*\.fondo-de-chat::after \{([^}]*)\}/)?.[1] ?? "";
    expect(pseudos).toMatch(/z-index: -1/);
    expect(pseudos).toMatch(/pointer-events: none/);
  });
  it("las luces y los garabatos toman el color de la skin", () => {
    // `[^}]*` no cruza bloques: si el primer `::after {` (el compartido con
    // ::before) no trae la máscara, el motor sigue hasta el propio.
    expect(css).toMatch(/\.fondo-de-chat::before \{[^}]*radial-gradient\([^)]*hsl\(var\(--primary\)/);
    expect(css).toMatch(/\.fondo-de-chat::after \{[^}]*mask: var\(--tapiz-de-chat\)/);
    expect(css).toMatch(/--tapiz-de-chat: url\("data:image\/svg\+xml/);
  });
  it("en alto contraste se apagan los garabatos", () => {
    expect(css).toMatch(/\[data-contrast="high"\] \.fondo-de-chat::after \{[^}]*display: none/);
  });
});
