import { describe, it, expect } from "vitest";
import { extraerImagenesEmbebidas, pesoDeBase64 } from "@/lib/mailInline";

// Un PNG de 1×1 de verdad, para que el base64 sea decodificable.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const img = (b64 = PNG, tipo = "image/png") => `<p><img src="data:${tipo};base64,${b64}"></p>`;

describe("extraerImagenesEmbebidas", () => {
  it("saca la imagen del cuerpo y la deja referenciada por cid", () => {
    const r = extraerImagenesEmbebidas(img());
    expect(r.imagenes).toHaveLength(1);
    expect(r.html).toContain(`src="cid:${r.imagenes[0].contentId}"`);
    expect(r.html).not.toContain("data:image");
  });

  it("⚠️ la MISMA imagen pegada dos veces viaja UNA sola vez", () => {
    // Si no, responder a un hilo que ya traía la captura duplica el peso del
    // correo cada vez que alguien contesta.
    const r = extraerImagenesEmbebidas(img() + img());
    expect(r.imagenes).toHaveLength(1);
    const cid = r.imagenes[0].contentId;
    expect(r.html.match(new RegExp(`cid:${cid}`, "g"))).toHaveLength(2);
  });

  it("dos imágenes distintas son dos partes", () => {
    const otro = PNG.replace("iVBOR", "iVBOQ");
    const r = extraerImagenesEmbebidas(img() + img(otro));
    expect(r.imagenes).toHaveLength(2);
    expect(r.imagenes[0].contentId).not.toBe(r.imagenes[1].contentId);
  });

  it("le pone la extensión que corresponde al tipo", () => {
    expect(extraerImagenesEmbebidas(img(PNG, "image/png")).imagenes[0].filename).toMatch(/\.png$/);
    expect(extraerImagenesEmbebidas(img(PNG, "image/jpeg")).imagenes[0].filename).toMatch(/\.jpg$/);
    expect(extraerImagenesEmbebidas(img(PNG, "image/webp")).imagenes[0].filename).toMatch(/\.webp$/);
  });

  it("⚠️ NO toca un data: de un tipo que no es imagen", () => {
    // Romperlo a la mitad sería peor que dejarlo pasar tal cual.
    const html = '<p><img src="data:text/html;base64,PHNjcmlwdD4="></p>';
    const r = extraerImagenesEmbebidas(html);
    expect(r.imagenes).toHaveLength(0);
    expect(r.html).toBe(html);
  });

  it("aguanta el base64 partido en renglones", () => {
    const partido = PNG.slice(0, 20) + "\n  " + PNG.slice(20);
    const r = extraerImagenesEmbebidas(img(partido));
    expect(r.imagenes).toHaveLength(1);
    expect(r.imagenes[0].contentBase64).toBe(PNG);
  });

  it("un cuerpo sin imágenes sale igual que entró", () => {
    const html = "<p>Hola <b>equipo</b></p>";
    const r = extraerImagenesEmbebidas(html);
    expect(r.html).toBe(html);
    expect(r.imagenes).toHaveLength(0);
  });

  it("no toca una imagen que ya venía por URL", () => {
    const html = '<p><img src="https://maven-ai.me/logo.png"></p>';
    expect(extraerImagenesEmbebidas(html).html).toBe(html);
  });
});

describe("pesoDeBase64", () => {
  it("devuelve los bytes reales y no el largo del base64", () => {
    expect(pesoDeBase64("aG9sYQ==")).toBe(4);
    expect(pesoDeBase64(PNG)).toBeLessThan(PNG.length);
  });
});
