import { describe, it, expect } from "vitest";

// EDITAR UN MENSAJE VACÍA EL TEXTO RICO.
//
// Jhon (18/09): "al editar un mensaje y darle guardar, no se guarda lo que
// edité". Se guardaba content, pero la burbuja pinta content_rich cuando
// existe, y ese quedaba con el documento viejo. La caja de edición es texto
// plano: al guardar, content_rich se vacía (en la base y en el optimista).
//
// (Sin node:fs: el tsconfig del front no trae los tipos de Node.)
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/hooks/useChat.ts", { query: "?raw", import: "default", eager: true });
const src = Object.values(fuentes)[0] ?? "";

describe("editar un mensaje", () => {
  it("la fuente se cargó", () => {
    expect(src.length).toBeGreaterThan(1000);
  });
  it("vacía content_rich en la base", () => {
    expect(src).toMatch(/\.update\(\{ content: newContent, is_edited: true, content_rich: null \}\)/);
  });
  it("y en la actualización optimista", () => {
    expect(src).toMatch(/\{ \.\.\.m, content: newContent, is_edited: true, content_rich: null \}/);
  });
});
