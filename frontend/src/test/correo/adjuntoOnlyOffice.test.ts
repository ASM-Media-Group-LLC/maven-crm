import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extensionDe, seAbreEnOnlyOffice } from "@/hooks/useAdjuntoEnOnlyOffice";

// Lo pidió Jhon: «que deje de convertir todo a pdf, por ejemplo los excel y
// los docs, ya tenemos onlyoffice en maven».
//
// Convertir a PDF era ver una FOTO del documento: las fórmulas de una hoja no
// se podían mirar, las pestañas no se podían cambiar, y una tabla ancha salía
// cortada por el salto de página que LibreOffice le inventaba.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const conv = leer("supabase/functions/document-convert/index.ts");
const ofi = leer("supabase/functions/oficina-doc/index.ts");
const visor = leer("frontend/src/components/correo/AdjuntoVisor.tsx");

describe("qué abre ONLYOFFICE y qué sigue por LibreOffice", () => {
  it("los tres modernos van a ONLYOFFICE", () => {
    for (const f of ["hoja.xlsx", "contrato.docx", "pitch.pptx"]) {
      expect(seAbreEnOnlyOffice(f), f).toBe(true);
    }
  });

  it("⚠️ los VIEJOS siguen por el conversor", () => {
    // ONLYOFFICE los abre peor que LibreOffice, y son los que menos llegan.
    for (const f of ["viejo.doc", "viejo.xls", "viejo.ppt", "a.odt", "b.rtf"]) {
      expect(seAbreEnOnlyOffice(f), f).toBe(false);
    }
  });

  it("no se confunde con un nombre que contiene la extensión", () => {
    expect(seAbreEnOnlyOffice("docx-instructivo.pdf")).toBe(false);
    expect(extensionDe("Hoja.de.Vida.FINAL.xlsx")).toBe("xlsx");
  });

  it("la lista del frontend y la de la edge coinciden", () => {
    // Si acá sobra algo, la persona espera y termina en error.
    expect(conv).toMatch(/ONLYOFFICE_ABRE = new Set\(\["docx", "xlsx", "pptx"\]\)/);
  });
});

describe("⚠️ lo que no puede salir mal en la edge", () => {
  it("la URL que se le da a ONLYOFFICE tiene que ser de R2", () => {
    // Va DENTRO de la config firmada y ONLYOFFICE la pide desde su servidor:
    // aceptar cualquiera lo convertiría en un cliente HTTP nuestro apuntando a
    // donde diga quien llame.
    const i = ofi.indexOf('if (accion === "adjunto")');
    const j = ofi.indexOf("return responder({ servidor: servidorOO", i);
    expect(i, "no está la acción").toBeGreaterThan(-1);
    const bloque = ofi.slice(i, j);
    expect(bloque).toMatch(/r2\\\.cloudflarestorage\\\.com/);
    expect(bloque).toMatch(/La URL del adjunto no es de R2/);
  });

  it("⚠️ se abre en SOLO LECTURA, sin callbackUrl", () => {
    // Un adjunto no es un documento de Maven: no hay dónde guardarlo, el
    // correo ya se mandó. Dejar editar sería ofrecer un guardar que no guarda.
    const i = ofi.indexOf('if (accion === "adjunto")');
    const j = ofi.indexOf("return responder({ servidor: servidorOO", i);
    const bloque = ofi.slice(i, j);
    expect(bloque).toMatch(/edit: false/);
    expect(bloque).toMatch(/mode: "view"/);
    // La CLAVE del config, no la palabra: el comentario de al lado explica
    // justamente por qué no está, y nombrarla ahí no es ponerla.
    expect(bloque).not.toMatch(/callbackUrl\s*:/);
  });

  it("la config va firmada", () => {
    expect(ofi).toMatch(/configAdj\.token = await firmar\(configAdj, secretoOO\)/);
  });

  it("el original se guarda con SU tipo, no como PDF", () => {
    // ONLYOFFICE mira el Content-Type de lo que baja: un .xlsx servido como
    // application/pdf lo rechaza sin decir por qué.
    expect(conv).toMatch(/MIME_ORIGINAL/);
    expect(conv).toMatch(/subirAR2\(llaveOrig, bytesO, MIME_ORIGINAL\[ext\]\)/);
  });

  it("guardar el original NO consume el cupo de conversión", () => {
    // No hay LibreOffice de por medio; cobrarle el cupo haría que abrir tres
    // adjuntos seguidos entre en la fila de espera sin motivo.
    const i = conv.indexOf('accion === "check_original"');
    const j = conv.indexOf('if (accion !== "convert")', i);
    expect(conv.slice(i, j)).not.toMatch(/tomarCupo/);
  });
});

describe("el visor", () => {
  it("tiene un tipo propio y no reusa el de convertir", () => {
    expect(visor).toMatch(/if \(seAbreEnOnlyOffice\(a\.filename\)\) return "office";/);
    expect(visor).toMatch(/if \(sePuedeConvertir\(a\.filename\)\) return "convertible";/);
  });

  it("⚠️ el contenedor lleva el índice del adjunto", () => {
    // Reusar el mismo div al pasar al siguiente dejaba el documento anterior
    // dibujado debajo.
    expect(visor).toMatch(/visor-adjunto-office-\$\{indice\}/);
  });

  it("si falla, ofrece descargarlo en vez de dejar la pantalla muda", () => {
    const i = visor.indexOf('tipo === "office"');
    const j = visor.indexOf('tipo === "convertible"', i);
    // «Descargar {nombre}», ya por el diccionario (i18n, ola 3).
    expect(visor.slice(i, j)).toMatch(/t\("mail\.viewer\.downloadFile", \{ name: actual\.filename \}\)/);
  });
});
