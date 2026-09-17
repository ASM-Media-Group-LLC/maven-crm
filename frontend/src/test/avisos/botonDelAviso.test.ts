import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// EL BOTÓN DE LOS AVISOS ("Abrir", "Actualizar", "Deshacer") Y SU SITIO.
//
// Jhon (16/09) sobre el aviso de mención: "ese botón de abrir, con un estilo
// más estético" y "la x de cerrar se monta un poco sobre el botón".
//
// Dos cosas que no pueden volver:
//  1. Estilarlo con clases de Tailwind desde el Toaster. Sonner inyecta su
//     <style> después de nuestra hoja y su regla empata en especificidad:
//     el botón salía blanco de fábrica. El estilo va en index.css con
//     selectores más específicos.
//  2. Ponerlo en el mismo renglón que el texto: la X va arriba a la derecha
//     y le caía encima. El aviso envuelve y el botón baja a su renglón; el
//     texto deja hueco a la derecha para la X.
const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = leer("../../index.css");
const toaster = leer("../../components/ui/sonner.tsx");
const aviso = leer("../../lib/avisoPersona.tsx");

describe("botón de los avisos", () => {
  it("se estila en index.css con el color de la skin y forma de píldora", () => {
    const regla = css.match(/\[data-sonner-toast\]\[data-styled='true'\] \[data-button\] \{([^}]*)\}/)?.[1] ?? "";
    expect(regla).toMatch(/color: hsl\(var\(--primary\)\)/);
    expect(regla).toMatch(/border-radius: 9999px/);
  });
  it("el aviso envuelve y deja hueco para la X", () => {
    const toast = css.match(/\[data-sonner-toast\]\[data-styled='true'\] \{([^}]*)\}/)?.[1] ?? "";
    expect(toast).toMatch(/flex-wrap: wrap/);
    expect(toast).toMatch(/padding-right: (3[0-9]|4[0-9])px/);
  });
  it("el Toaster ya no intenta estilarlo con clases (nunca aplicaban)", () => {
    expect(toaster).not.toMatch(/actionButton:|cancelButton:/);
  });
  it("el aviso de persona le pone la flecha al botón", () => {
    expect(aviso).toMatch(/ArrowUpRight/);
  });
});
