import { describe, it, expect } from "vitest";
import {
  adjuntosIncrustados, cidsDelHtml, incrustarCids, normalizarCid,
  TOPE_INCRUSTADO_BYTES,
} from "@/lib/mailCid";

// El caso real del 18/09: Jhon pegó una captura en un correo, se envió bien,
// y al releerlo en Maven se veía un ícono roto. En la base:
//   html         → src="cid:img1.012d7e3b@maven-ai.me"
//   attachments  → [{ filename: "imagen-1.png", contentId: "img1.012d7e3b@maven-ai.me" }]
// Estaba todo. Lo que faltaba era el paso que los junta.
const CID = "img1.012d7e3b@maven-ai.me";
const HTML = `<p>Buenas tardes,</p><img src="cid:${CID}" alt="">`;
const ADJUNTOS = [
  { filename: "imagen-1.png", contentType: "image/png", sizeBytes: 229657, contentId: CID },
];

describe("normalizarCid", () => {
  it("⚠️ saca los picos, que es por lo que nunca emparejaban", () => {
    // La cabecera los lleva (`Content-ID: <x@y>`) y el `src` no. Comparar sin
    // normalizar da siempre falso.
    expect(normalizarCid("<x@y>")).toBe("x@y");
    expect(normalizarCid("  x@y  ")).toBe("x@y");
    expect(normalizarCid("x@y")).toBe("x@y");
  });
});

describe("cidsDelHtml", () => {
  it("encuentra el del correo de verdad", () => {
    expect(cidsDelHtml(HTML)).toEqual([CID]);
  });

  it("no repite el mismo cid usado dos veces", () => {
    expect(cidsDelHtml(`<img src="cid:${CID}"><img src="cid:${CID}">`)).toEqual([CID]);
  });

  it("aguanta comillas simples", () => {
    expect(cidsDelHtml(`<img src='cid:${CID}'>`)).toEqual([CID]);
  });

  it("no confunde una imagen normal con una pegada", () => {
    expect(cidsDelHtml('<img src="https://a/1.png"><img src="data:image/png;base64,AA">'))
      .toEqual([]);
  });

  it("sin html no explota", () => {
    expect(cidsDelHtml(null)).toEqual([]);
    expect(cidsDelHtml("")).toEqual([]);
  });
});

describe("adjuntosIncrustados", () => {
  it("devuelve la POSICIÓN, que es como se pide un adjunto", () => {
    expect(adjuntosIncrustados(HTML, ADJUNTOS)).toEqual([{ index: 0, cid: CID }]);
  });

  it("⚠️ empareja aunque el adjunto guarde el cid CON picos", () => {
    const conPicos = [{ ...ADJUNTOS[0], contentId: `<${CID}>` }];
    expect(adjuntosIncrustados(HTML, conPicos)).toEqual([{ index: 0, cid: CID }]);
  });

  it("⚠️ NO baja lo que el cuerpo no nombra", () => {
    // Un correo con una imagen pegada y un PDF de 40 MB adjunto no tiene por
    // qué bajar el PDF para verse.
    const conPdf = [
      { filename: "contrato.pdf", contentType: "application/pdf", sizeBytes: 40e6, contentId: null },
      ADJUNTOS[0],
    ];
    expect(adjuntosIncrustados(HTML, conPdf)).toEqual([{ index: 1, cid: CID }]);
  });

  it("si nadie tiene ese cid, no pide nada", () => {
    const otros = [{ ...ADJUNTOS[0], contentId: "otro@maven-ai.me" }];
    expect(adjuntosIncrustados(HTML, otros)).toEqual([]);
  });

  it("un correo sin adjuntos no pide nada", () => {
    expect(adjuntosIncrustados(HTML, [])).toEqual([]);
    expect(adjuntosIncrustados(HTML, null)).toEqual([]);
  });
});

describe("incrustarCids", () => {
  const bytes = new Map([[CID, { contentType: "image/png", contentBase64: "QUJD" }]]);

  it("cambia el cid: por los bytes en data:", () => {
    const r = incrustarCids(HTML, bytes);
    expect(r).toContain('src="data:image/png;base64,QUJD"');
    expect(r).not.toContain("cid:");
  });

  it("deja intacto lo que no pudo resolver", () => {
    const r = incrustarCids(`<img src="cid:otro@z">`, bytes);
    expect(r).toBe(`<img src="cid:otro@z">`);
  });

  it("⚠️ un tipo que no es imagen no se pinta como venga", () => {
    // El `contentType` lo eligió quien mandó el correo. No es un agujero de
    // ejecución (el lector no corre scripts), pero tampoco hay razón para
    // repetir a ciegas lo que diga un tercero dentro de un `<img>`.
    const raro = new Map([[CID, { contentType: "text/html", contentBase64: "QUJD" }]]);
    expect(incrustarCids(HTML, raro)).toContain("data:image/png;base64,");
  });

  it("⚠️ pasado el tope, las que sobran quedan como estaban", () => {
    // El cuerpo se pinta con `srcDoc`: cada imagen resuelta es texto adentro
    // de una cadena. Veinte capturas armarían decenas de MB y dejarían la
    // pestaña clavada. Una imagen rota se ve mal; un Correo que no responde
    // es peor.
    const gordo = "A".repeat(Math.ceil((TOPE_INCRUSTADO_BYTES * 4) / 3));
    const dos = new Map([
      ["a@z", { contentType: "image/png", contentBase64: gordo }],
      ["b@z", { contentType: "image/png", contentBase64: "QUJD" }],
    ]);
    const r = incrustarCids(`<img src="cid:a@z"><img src="cid:b@z">`, dos);
    expect(r).toContain("data:image/png;base64,AAA");
    expect(r).toContain('src="cid:b@z"');
  });

  it("sin nada que poner devuelve el html tal cual", () => {
    expect(incrustarCids(HTML, new Map())).toBe(HTML);
  });
});
