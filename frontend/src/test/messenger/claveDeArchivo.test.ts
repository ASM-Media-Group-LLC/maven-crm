import { describe, it, expect } from "vitest";
import { claveSeguraParaArchivo } from "@/lib/claveDeArchivo";

// EL BUG QUE ESTO CUIDA (31/08/2026): adjuntar una imagen o un video en el
// Messenger fallaba con "Invalid key". El nombre del archivo se metía CRUDO en
// la clave de Supabase Storage, que valida contra una lista corta de
// caracteres.
//
// Lo desconcertante era que el nombre PARECE inofensivo: macOS nombra las
// capturas con un ESPACIO ANGOSTO SIN SALTO (U+202F) antes de "p. m." —y antes
// de "PM" en inglés—, que es invisible. Se confirmó en la consola del usuario:
// la URL de la petición mostraba `%E2%80%AF`, que es exactamente ese carácter.
//
// Y no era solo eso: `\w` en JavaScript es SOLO ASCII, así que cualquier tilde
// o eñe rompía la subida también. En un equipo que trabaja en español, eso es
// la mitad de los archivos.
//
// Pegar con Ctrl+V funcionaba porque el archivo del portapapeles se llama
// `image.png`.

/** El validador REAL de Supabase Storage (storage-api, isValidKey).
 *  Ojo: en JavaScript `\w` es solo [A-Za-z0-9_] — no incluye acentuadas. */
const storageLoAcepta = (clave: string) =>
  clave.length > 0 && /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/.test(clave);

const ESPACIO_ANGOSTO = "\u202f";   // el carácter invisible, escrito de forma VISIBLE

describe("los nombres que ROMPÍAN la subida", () => {
  it("la captura de macOS en español (con el espacio invisible)", () => {
    const real = `Captura de pantalla 2026-08-31 a la(s) 5.19.35 p.${ESPACIO_ANGOSTO}m..png`;
    // Antes: se metía crudo y Storage rechazaba la clave entera.
    expect(storageLoAcepta(real)).toBe(false);
    // Ahora:
    expect(storageLoAcepta(claveSeguraParaArchivo(real))).toBe(true);
  });

  it("la grabación de pantalla de macOS en inglés (mismo carácter antes de PM)", () => {
    const real = `Screen Recording 2026-08-25 at 4.49.07${ESPACIO_ANGOSTO}PM.mov`;
    expect(storageLoAcepta(real)).toBe(false);
    const seguro = claveSeguraParaArchivo(real);
    expect(storageLoAcepta(seguro)).toBe(true);
    expect(seguro.endsWith(".mov")).toBe(true);   // no puede perder la extensión
  });

  it("cualquier tilde o eñe — el caso más común en un equipo hispanohablante", () => {
    for (const n of ["Diseño final.png", "Análisis de ventas.pdf", "Contraseña.txt"]) {
      expect(storageLoAcepta(n)).toBe(false);
      expect(storageLoAcepta(claveSeguraParaArchivo(n))).toBe(true);
    }
    expect(claveSeguraParaArchivo("Diseño final.png")).toBe("diseno-final.png");
  });

  it("emoji en el nombre", () => {
    const n = "foto 😀.png";
    expect(storageLoAcepta(n)).toBe(false);
    expect(storageLoAcepta(claveSeguraParaArchivo(n))).toBe(true);
  });
});

describe("lo que ya funcionaba sigue funcionando", () => {
  it("el archivo pegado con Ctrl+V queda igual", () => {
    expect(claveSeguraParaArchivo("image.png")).toBe("image.png");
  });

  it("un nombre normal solo se pasa a minúsculas", () => {
    expect(claveSeguraParaArchivo("Reporte-2026.pdf")).toBe("reporte-2026.pdf");
  });
});

describe("la extensión no se pierde nunca", () => {
  it("un nombre larguísimo se recorta por el MEDIO, no por la extensión", () => {
    // Recortar a ciegas dejaba un `.mov` sin extensión, y ahí se pierden el
    // tipo de contenido y la vista previa.
    const largo = "a".repeat(300) + ".mov";
    const seguro = claveSeguraParaArchivo(largo);
    expect(seguro.endsWith(".mov")).toBe(true);
    expect(seguro.length).toBeLessThan(100);
  });

  it("un archivo sin extensión no inventa un punto suelto", () => {
    expect(claveSeguraParaArchivo("README")).toBe("readme");
  });

  it("un nombre oculto tipo .gitignore no se queda sin nada", () => {
    expect(claveSeguraParaArchivo(".gitignore")).toBe("gitignore");
  });
});

describe("entradas rotas: nunca devolver una clave inválida", () => {
  it("nombre vacío o ausente", () => {
    for (const n of ["", "   ", null, undefined]) {
      const seguro = claveSeguraParaArchivo(n as string);
      expect(seguro.length).toBeGreaterThan(0);
      expect(storageLoAcepta(seguro)).toBe(true);
    }
  });

  it("un nombre que es SOLO caracteres inválidos", () => {
    // No puede quedar en cadena vacía: una clave vacía también es "Invalid key".
    const seguro = claveSeguraParaArchivo("😀😀😀");
    expect(seguro.length).toBeGreaterThan(0);
    expect(storageLoAcepta(seguro)).toBe(true);
  });

  it("no deja guiones ni puntos colgando en los bordes", () => {
    expect(claveSeguraParaArchivo("  ...archivo...  .png")).not.toMatch(/^[-.]|[-.]$/);
  });

  it("nunca produce algo que Storage rechace, sea cual sea la entrada", () => {
    const muestras = [
      "a b c.png", "%%%.jpg", "árbol ñandú.PNG", "x".repeat(500),
      `sin${ESPACIO_ANGOSTO}nada`, "../../escape.png", "a/b/c.png",
    ];
    for (const m of muestras) {
      expect(storageLoAcepta(claveSeguraParaArchivo(m))).toBe(true);
    }
  });
});
