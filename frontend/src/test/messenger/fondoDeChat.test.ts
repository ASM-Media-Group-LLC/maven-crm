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
  it("la tinta de los garabatos se aclara en oscuro: con un primario oscuro no se veían", () => {
    // Jhon (16/09): "solo veo el degradado" con Rojo Kash. El primario a secas
    // al 8 % desaparece en las skins oscuras; la tinta va mezclada con blanco.
    expect(css).toMatch(/\.dark \{[^}]*--fondo-chat-hacia: white/);
    // La mezcla vive en el ::after (donde el primario se hereda del contexto
    // real), NO en un token de :root con var(--primary) adentro: ahí se
    // resolvía donde se declara y podía quedar inválida, anulando el fondo.
    expect(css).toMatch(/\.fondo-de-chat::after \{[^}]*color-mix\(in oklab, hsl\(var\(--primary\)\) var\(--fondo-chat-mezcla\), var\(--fondo-chat-hacia\)\) var\(--fondo-chat-tapiz\),\s*transparent/);
    expect(css).not.toMatch(/--fondo-chat-tinta:/);
  });
  it("la baldosa se pinta entera: el tamaño de la máscara es el del SVG", () => {
    // Jhon (16/09): "con la cara completa, no el que sale solo la mitad". Los
    // garabatos viven dentro de la baldosa sin tocar el borde; si el tamaño
    // de la máscara no coincide con el del SVG, la baldosa se recorta o se
    // deforma y vuelven las medias caras.
    const lado = css.match(/--tapiz-de-chat: url\("data:image\/svg\+xml;utf8,<svg[^>]*width='(\d+)' height='(\d+)'/);
    expect(lado?.[1]).toBe(lado?.[2]);
    expect(css).toMatch(new RegExp(`mask: var\\(--tapiz-de-chat\\) 0 0 / ${lado?.[1]}px ${lado?.[1]}px repeat`));
  });
  it("en alto contraste los garabatos NO se apagan", () => {
    // Se apagaban "por legibilidad", pero el texto del hilo va siempre dentro
    // de burbujas opacas: nunca hay letras sobre el dibujo. La cuenta de Jhon
    // tiene contraste activo y por eso él no los veía (16/09).
    expect(css).not.toMatch(/\[data-contrast="high"\] \.fondo-de-chat/);
  });
});
