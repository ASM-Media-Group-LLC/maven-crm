import { describe, it, expect } from "vitest";
// La edge es Deno y el front no puede importar de supabase/ en el build, pero
// el test sí: mismo patrón que coworkTiempoEstado.test.ts.
import {
  parsearBodyStructure,
  parteDelAdjunto,
} from "../../../../supabase/functions/_shared/bodystructure";

describe("parsearBodyStructure", () => {
  it("numera las partes de un multipart/mixed: el texto es la 1 y el adjunto la 2", () => {
    const bs =
      '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 120 4)' +
      '("APPLICATION" "PDF" ("NAME" "cv.pdf") NIL NIL "BASE64" 27000 NIL ' +
      '("ATTACHMENT" ("FILENAME" "cv.pdf")) NIL NIL)' +
      ' "MIXED" ("BOUNDARY" "xxx") NIL NIL)';

    const partes = parsearBodyStructure(bs);
    expect(partes.map((p) => p.seccion)).toEqual(["1", "2"]);

    expect(partes[0].esAdjunto).toBe(false);
    expect(partes[1]).toMatchObject({
      seccion: "2",
      tipo: "APPLICATION",
      subtipo: "PDF",
      codificacion: "base64",
      bytes: 27000,
      nombre: "cv.pdf",
      esAdjunto: true,
    });
  });

  it("hereda el prefijo en un multipart anidado (1.1, 1.2, 2)", () => {
    // Lo típico de verdad: alternative (texto+html) y al lado un adjunto.
    const bs =
      "((" +
      '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 10 1)' +
      '("TEXT" "HTML" ("CHARSET" "utf-8") NIL NIL "7BIT" 20 1)' +
      ' "ALTERNATIVE" ("BOUNDARY" "a") NIL NIL)' +
      '("APPLICATION" "PDF" ("NAME" "x.pdf") NIL NIL "BASE64" 100 NIL ' +
      '("ATTACHMENT" ("FILENAME" "x.pdf")) NIL NIL)' +
      ' "MIXED" ("BOUNDARY" "b") NIL NIL)';

    const partes = parsearBodyStructure(bs);
    expect(partes.map((p) => p.seccion)).toEqual(["1.1", "1.2", "2"]);
    expect(partes.filter((p) => p.esAdjunto).map((p) => p.seccion)).toEqual(["2"]);
  });

  it("un mensaje de una sola parte es la parte 1", () => {
    const bs = '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 120 4)';
    const partes = parsearBodyStructure(bs);
    expect(partes).toHaveLength(1);
    expect(partes[0].seccion).toBe("1");
  });

  it("⚠️ encuentra el disposition de un TEXT, que lleva un campo de más", () => {
    // TEXT trae el número de líneas después del tamaño, así que las
    // extensiones arrancan un lugar más allá que en el resto. Si se ignora,
    // un .txt o un .csv adjunto deja de reconocerse como adjunto.
    const bs =
      '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 10 1)' +
      '("TEXT" "CSV" ("NAME" "datos.csv") NIL NIL "BASE64" 500 9 NIL ' +
      '("ATTACHMENT" ("FILENAME" "datos.csv")) NIL NIL)' +
      ' "MIXED" ("BOUNDARY" "b") NIL NIL)';

    const partes = parsearBodyStructure(bs);
    expect(partes[1]).toMatchObject({
      seccion: "2",
      nombre: "datos.csv",
      esAdjunto: true,
    });
  });

  it("lee un nombre que vino como literal y no como cadena", () => {
    // Pasa cuando el nombre tiene acentos o comillas: el servidor lo manda
    // como {N} + N bytes. Sin contemplarlo, el tokenizador se come el resto.
    const bs =
      '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 10 1)' +
      '("APPLICATION" "PDF" ("NAME" {16}\r\nHoja de vida.pdf) NIL NIL "BASE64" 100 NIL ' +
      '("ATTACHMENT" ("FILENAME" {16}\r\nHoja de vida.pdf)) NIL NIL)' +
      ' "MIXED" ("BOUNDARY" "b") NIL NIL)';

    const partes = parsearBodyStructure(bs);
    expect(partes).toHaveLength(2);
    expect(partes[1].nombre).toBe("Hoja de vida.pdf");
    expect(partes[1].seccion).toBe("2");
  });

  it("no explota con basura: devuelve vacío para que quien llama use el camino viejo", () => {
    expect(parsearBodyStructure("")).toEqual([]);
    expect(parsearBodyStructure("NIL")).toEqual([]);
  });
});

describe("parteDelAdjunto", () => {
  const partes = parsearBodyStructure(
    '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 10 1)' +
      '("APPLICATION" "PDF" ("NAME" "ana.pdf") NIL NIL "BASE64" 1000 NIL ("ATTACHMENT" ("FILENAME" "ana.pdf")) NIL NIL)' +
      '("APPLICATION" "PDF" ("NAME" "beto.pdf") NIL NIL "BASE64" 2000 NIL ("ATTACHMENT" ("FILENAME" "beto.pdf")) NIL NIL)' +
      ' "MIXED" ("BOUNDARY" "b") NIL NIL)',
  );

  it("manda el NOMBRE por encima del orden", () => {
    // El índice dice 0 pero el nombre dice beto: gana el nombre. Así un
    // desacuerdo entre mailparser y el BODYSTRUCTURE no entrega otro archivo.
    expect(parteDelAdjunto(partes, 0, { nombre: "beto.pdf" })?.seccion).toBe("3");
    expect(parteDelAdjunto(partes, 1, { nombre: "ana.pdf" })?.seccion).toBe("2");
  });

  it("cae al orden cuando no hay nombre o no coincide", () => {
    expect(parteDelAdjunto(partes, 0)?.seccion).toBe("2");
    expect(parteDelAdjunto(partes, 1)?.seccion).toBe("3");
    expect(parteDelAdjunto(partes, 0, { nombre: "no-existe.pdf" })?.seccion).toBe("2");
  });

  it("desempata por tamaño cuando el nombre se repite", () => {
    const repes = parsearBodyStructure(
      '(("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 10 1)' +
        '("APPLICATION" "PDF" ("NAME" "cv.pdf") NIL NIL "BASE64" 1400 NIL ("ATTACHMENT" ("FILENAME" "cv.pdf")) NIL NIL)' +
        '("APPLICATION" "PDF" ("NAME" "cv.pdf") NIL NIL "BASE64" 140000 NIL ("ATTACHMENT" ("FILENAME" "cv.pdf")) NIL NIL)' +
        ' "MIXED" ("BOUNDARY" "b") NIL NIL)',
    );
    // 105000 bytes reales → ~140000 codificados en base64: es el segundo.
    expect(parteDelAdjunto(repes, 0, { nombre: "cv.pdf", bytes: 105000 })?.seccion).toBe("3");
  });

  it("devuelve null si el índice se pasa", () => {
    expect(parteDelAdjunto(partes, 9)).toBeNull();
  });
});
