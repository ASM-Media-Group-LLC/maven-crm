import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lo sin leer TIENE que notarse (Jhon, 25/09: «el sombreado de los no leídos es
// demasiado tenue»). Tras el rediseño "tarjetas limpias" (Alvaro, 31/10) el
// Correo ya NO usa la barra de acento lateral: el no-leído se marca con un PUNTO
// morado + el nombre en NEGRITA + un tinte suave, y el hover lo OSCURECE (nunca
// lo aclara). Este test ata esos marcadores para que no se vuelvan invisibles.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const correo = leer("frontend/src/pages/correo/CorreoPage.tsx");

/** El tinte de la fila sin leer, p. ej. 0.07 en `bg-primary/[0.07] hover:…`. */
function tinteSinLeer(fuente: string): number | null {
  const m = fuente.match(/bg-primary\/\[(0\.\d+)\]\s+hover:bg-primary\/\[0\.\d+\]/);
  return m ? Number(m[1]) : null;
}

describe("⚠️ lo sin leer se tiene que VER", () => {
  it("la fila sin leer lleva un tinte, no queda invisible", () => {
    const t = tinteSinLeer(correo);
    expect(t, "no encontré el tinte del no-leído").not.toBeNull();
    // 0.04 y 0.09 fueron los valores que se probaron invisibles en su momento.
    expect(t!).toBeGreaterThanOrEqual(0.06);
    expect(correo).not.toMatch(/sinLeer[^\n]*bg-primary\/\[0\.04\]/);
  });

  it("⚠️ al pasar el mouse la fila sin leer se OSCURECE, no se aclara", () => {
    const m = correo.match(/bg-primary\/\[(0\.\d+)\]\s+hover:bg-primary\/\[(0\.\d+)\]/);
    expect(m, "la fila sin leer no tiene hover propio").not.toBeNull();
    expect(Number(m![2]), "el hover aclara en vez de oscurecer").toBeGreaterThan(Number(m![1]));
  });

  it("el no-leído se marca con punto morado + nombre en negrita (sin barra lateral)", () => {
    // Los marcadores del diseño nuevo: el punto de acento y la negrita del nombre.
    expect(correo, "falta el punto morado de no-leído").toMatch(/h-1\.5 w-1\.5 shrink-0 rounded-full bg-primary/);
    expect(correo, "el nombre del no-leído no va en negrita").toMatch(/sinLeer \? "font-bold/);
  });
});
