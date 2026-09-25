import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Lo marcó Jhon el 25/09: «el sombreado para los correos no leídos es
// demasiado tenue, tuvimos algo parecido en Messenger hace algún tiempo».
//
// Era exactamente eso. La fila del Correo se copió de la de Messenger, pero de
// una versión VIEJA: tenía `bg-primary/[0.04]`, el valor que Messenger ya había
// probado y descartado — «0.04 y después 0.09 seguían siendo casi invisibles,
// sobre todo en modo claro» (ChatSidebar). Arreglarlo en un lado no lo arregló
// en el otro. Este test ata los dos para que no vuelvan a separarse.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const correo = leer("frontend/src/pages/correo/CorreoPage.tsx");
const messenger = leer("frontend/src/pages/messenger/ChatSidebar.tsx");

/** El tinte que se le pone a la fila sin leer, por ejemplo `0.16`. */
function tinteSinLeer(fuente: string): number | null {
  const m = fuente.match(/bg-primary\/\[(0\.\d+)\]\s+shadow-\[inset_3px_0_0_0_hsl\(var\(--primary\)\)\]/);
  return m ? Number(m[1]) : null;
}

describe("⚠️ lo sin leer se tiene que VER", () => {
  it("el Correo usa el mismo tinte que Messenger", () => {
    const deMessenger = tinteSinLeer(messenger);
    expect(deMessenger, "no encontré el tinte de Messenger").not.toBeNull();
    expect(tinteSinLeer(correo), "el Correo se separó de Messenger").toBe(deMessenger);
  });

  it("y nunca vuelve a los valores que ya se probaron invisibles", () => {
    // 0.04 y 0.09 son los dos que Messenger descartó antes de llegar a 0.16.
    expect(correo).not.toMatch(/sinLeer[^\n]*bg-primary\/\[0\.0[49]\]/);
    expect(tinteSinLeer(correo)!).toBeGreaterThanOrEqual(0.16);
  });

  it("lleva la barra de acento, no solo el tinte", () => {
    // Con un primario claro, el tinte solo se pierde; la barra no.
    expect(correo).toMatch(/shadow-\[inset_3px_0_0_0_hsl\(var\(--primary\)\)\]/);
  });

  it("⚠️ al pasar el mouse la fila sin leer se OSCURECE, no se aclara", () => {
    // Con solo el `hover:bg-primary/5` de las leídas, pasar por encima de una
    // fila sin leer la dejaba en 5% — más clara que su propio tinte.
    const m = correo.match(/shadow-\[inset_3px_0_0_0_hsl\(var\(--primary\)\)\]\s+hover:bg-primary\/\[(0\.\d+)\]/);
    expect(m, "la fila sin leer no tiene hover propio").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(tinteSinLeer(correo)!);
  });
});
