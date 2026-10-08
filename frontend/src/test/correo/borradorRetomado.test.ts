import { describe, expect, it } from "vitest";
import { repartirBorradorRetomado } from "@/lib/correo/borradorRetomado";

const pdfMeta = { filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 9, contentId: null };
const pdf = { filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 9, contentBase64: "JVBERi0x" };
const imgMeta = { filename: "imagen-1.png", contentType: "image/png", sizeBytes: 6, contentId: "<img1.ab12@maven-ai.me>" };
const img = { filename: "imagen-1.png", contentType: "image/png", sizeBytes: 6, contentBase64: "iVBORw0K" };

describe("repartirBorradorRetomado", () => {
  it("la imagen pegada vuelve al cuerpo y el PDF a los adjuntos", () => {
    const html = '<p>Hola</p><img src="cid:img1.ab12@maven-ai.me" width="400">';
    const r = repartirBorradorRetomado(html, [imgMeta, pdfMeta], [img, pdf]);
    expect(r.html).toContain('src="data:image/png;base64,iVBORw0K"');
    expect(r.html).toContain('width="400"');
    expect(r.html).not.toContain("cid:");
    expect(r.adjuntos).toEqual([pdf]);
  });

  it("un archivo con Content-ID que el cuerpo NO nombra sigue siendo adjunto", () => {
    const conCid = { ...pdfMeta, contentId: "<pdf.1@zoho.com>" };
    const r = repartirBorradorRetomado("<p>Hola</p>", [conCid], [pdf]);
    expect(r.adjuntos).toEqual([pdf]);
    expect(r.html).toBe("<p>Hola</p>");
  });

  it("el cid escrito con otra caja en el HTML también se resuelve", () => {
    const html = '<img src="cid:IMG1.AB12@maven-ai.me">';
    const r = repartirBorradorRetomado(html, [imgMeta], [img]);
    expect(r.html).toContain("data:image/png;base64,");
    expect(r.adjuntos).toEqual([]);
  });

  it("una imagen grande no se queda como cid: (el lector tiene tope, el compositor no)", () => {
    const grande = { ...img, contentBase64: "A".repeat(17 * 1024 * 1024) };
    const r = repartirBorradorRetomado('<img src="cid:img1.ab12@maven-ai.me">', [imgMeta], [grande]);
    expect(r.html).not.toContain("cid:");
  });

  it("sin adjuntos ni HTML no inventa nada", () => {
    expect(repartirBorradorRetomado(null, [], [])).toEqual({ html: null, adjuntos: [] });
  });
});
