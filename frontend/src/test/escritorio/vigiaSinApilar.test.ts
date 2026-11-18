import { describe, expect, it } from "vitest";

// Guarda (18/11/2026): revisión de 8 h seguidas con la app. En Mac cada lectura
// de la ventana del frente es un proceso aparte, cada 5 s; si una tardaba, se
// apilaban sin tope. Y la insignia del chat rearmaba el menú en cada cambio.
const apps = Object.values(import.meta.glob("../../../../desktop/src/apps.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("la app aguanta el día entero", () => {
  it("el vigía de apps hace una lectura a la vez", () => {
    expect(apps).toContain("if (leyendo) return;");
    expect(apps).toMatch(/: lectura\s*\n\s*\? null/);
  });

  it("la insignia no rearma el menú si el número no cambió", () => {
    expect(main).toContain("if (nuevo === sinLeer && insigniaPuesta) return;");
  });
});
