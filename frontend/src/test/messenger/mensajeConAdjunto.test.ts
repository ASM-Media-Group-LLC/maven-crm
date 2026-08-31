import { describe, it, expect } from "vitest";
import { contenidoDeAdjunto, muestraTextoDebajo } from "@/lib/mensajeConAdjunto";

// EL BUG QUE ESTO CUIDA (31/08/2026): al mandar una imagen con un comentario,
// se veía el nombre crudo del archivo pegado debajo:
//
//   Prueba 📎 Captura de pantalla 2026-08-30 a la(s) 7.25.27 a.m..png
//
// Y de paso se veía feo: la burbuja se encoge a su contenido, así que ese
// nombre de sesenta caracteres la estiraba hasta el 70% del ancho, dejando un
// vacío enorme al lado de una captura vertical. Dos síntomas, un solo bug.
//
// La burbuja YA tenía una guarda para no repetir el nombre
// (`content !== file_name`), pero el que enviaba la anulaba al concatenar.

const CAPTURA = "Captura de pantalla 2026-08-30 a la(s) 7.25.27 a.m..png";

describe("qué texto lleva un mensaje con archivo", () => {
  it("con comentario: SOLO el comentario, sin el nombre pegado", () => {
    const contenido = contenidoDeAdjunto("Prueba", CAPTURA);
    expect(contenido).toBe("Prueba");
    expect(contenido).not.toContain("Captura de pantalla");
    expect(contenido).not.toContain("📎");
  });

  it("sin comentario: el nombre, para que la búsqueda y la lista tengan qué mostrar", () => {
    expect(contenidoDeAdjunto("", CAPTURA)).toBe(CAPTURA);
    expect(contenidoDeAdjunto("   ", CAPTURA)).toBe(CAPTURA);
    expect(contenidoDeAdjunto(null, CAPTURA)).toBe(CAPTURA);
  });

  it("nunca los dos juntos — eso es lo que rompía la guarda de la burbuja", () => {
    for (const texto of ["Prueba", "mirá esto", "a"]) {
      expect(contenidoDeAdjunto(texto, CAPTURA)).not.toContain(CAPTURA);
    }
  });
});

describe("cuándo la burbuja dibuja el texto debajo", () => {
  it("con comentario, sí", () => {
    expect(muestraTextoDebajo(contenidoDeAdjunto("Prueba", CAPTURA), CAPTURA)).toBe(true);
  });

  it("sin comentario, NO: repetiría el nombre que ya se muestra", () => {
    expect(muestraTextoDebajo(contenidoDeAdjunto("", CAPTURA), CAPTURA)).toBe(false);
  });

  it("sin contenido, no dibuja nada", () => {
    expect(muestraTextoDebajo("", CAPTURA)).toBe(false);
    expect(muestraTextoDebajo(null, CAPTURA)).toBe(false);
  });

  it("las dos reglas encajan: lo que manda el emisor es lo que la burbuja espera", () => {
    // Este es el contrato que se había roto. Con el nombre concatenado,
    // `muestraTextoDebajo` daba true y se leía el nombre crudo.
    const conTexto = contenidoDeAdjunto("Prueba", CAPTURA);
    const sinTexto = contenidoDeAdjunto("", CAPTURA);
    expect(muestraTextoDebajo(conTexto, CAPTURA)).toBe(true);
    expect(muestraTextoDebajo(sinTexto, CAPTURA)).toBe(false);
  });
});
