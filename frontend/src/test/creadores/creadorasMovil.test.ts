// Contrato de teléfono para las dos pantallas que Jhon vio rotas en el iPhone
// (07/09/2026): el popup de la creadora y su perfil. Si alguien vuelve a poner
// la cabecera en una sola fila o las pestañas sin scroll, esto lo frena.
import { describe, it, expect } from "vitest";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/creadores/ViewCreadorModal.tsx", "/frontend/src/pages/creadores/CreadorProfileContent.tsx"], { query: "?raw", import: "default", eager: true });
const fuente = (nombre: string) => {
  const k = Object.keys(fuentes).find((p) => p.endsWith(nombre));
  if (!k) throw new Error(`no encontré ${nombre}`);
  return fuentes[k];
};

describe("popup de la creadora (ViewCreadorModal)", () => {
  const s = fuente("ViewCreadorModal.tsx");
  it("deja margen lateral en el teléfono y vuelve a max-w-lg en escritorio", () => {
    expect(s).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(s).toContain("sm:max-w-lg");
  });
  it("las pestañas se desplazan en vez de aplastarse", () => {
    expect(s).toMatch(/TabsList className="[^"]*overflow-x-auto/);
  });
  it("el pie queda en fila (Eliminar a la izquierda, Cerrar a la derecha)", () => {
    expect(s).toMatch(/DialogFooter className="flex-row/);
  });
});

describe("perfil de la creadora (CreadorProfileContent)", () => {
  const s = fuente("CreadorProfileContent.tsx");
  it("la cabecera se apila en el teléfono", () => {
    expect(s).toContain("flex flex-col items-center gap-4 sm:flex-row");
  });
  it("el nombre largo parte en vez de tapar", () => {
    expect(s).toMatch(/<h1 className="[^"]*break-words/);
  });
  it("la edad sale del helper con guard, no de una copia local", () => {
    expect(s).toContain('from "@/lib/edad"');
    expect(s).not.toMatch(/^function computeAge/m);
  });
});
