import { describe, it, expect } from "vitest";
import { hayQueMirarAdentro, tipoPorFirma, vistaConFirma } from "@/lib/drive/tipoDeArchivo";

// EL VISOR Y LOS ARCHIVOS SIN EXTENSIÓN (Jhon, 06/10: «el visor de documentos de
// Maven está mal, no me deja previsualizar»). 13.593 archivos importados de
// Google no tienen extensión y llegaron como application/octet-stream: todo
// «ENTREGA DE CARGO» (grabaciones de Meet y de pantalla). Probado en su Chrome:
// el NAS responde «bytes=0-15» con 206 y la firma «ftypmp41».

const bytes = (...partes: (string | number[])[]) =>
  new Uint8Array(partes.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const caja = (marca: string) => bytes([0, 0, 0, 24], "ftyp", marca, [0, 0, 0, 0]);

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/oficina/drive/VistasDelVisor.tsx", "/frontend/src/pages/oficina/ArchivoDelDrivePage.tsx"], { query: "?raw", import: "default", eager: true });
const fuente = (n: string) => Object.entries(fuentes).find(([k]) => k.endsWith(n))?.[1] ?? "";

describe("tipoPorFirma", () => {
  it("videos ISO (mp4, mov), HEIC, AVIF y M4A por la marca de «ftyp»", () => {
    expect(tipoPorFirma(caja("mp41"))).toEqual({ mime: "video/mp4", ext: "mp4" });
    expect(tipoPorFirma(caja("isom"))).toEqual({ mime: "video/mp4", ext: "mp4" });
    expect(tipoPorFirma(caja("qt  "))).toEqual({ mime: "video/quicktime", ext: "mov" });
    expect(tipoPorFirma(caja("heic"))).toEqual({ mime: "image/heic", ext: "heic" });
    expect(tipoPorFirma(caja("mif1"))).toEqual({ mime: "image/heic", ext: "heic" });
    expect(tipoPorFirma(caja("avif"))).toEqual({ mime: "image/avif", ext: "avif" });
    expect(tipoPorFirma(caja("M4A "))).toEqual({ mime: "audio/mp4", ext: "m4a" });
  });

  it("imágenes, PDF, audio y webm", () => {
    expect(tipoPorFirma(bytes([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(tipoPorFirma(bytes([0x89], "PNG", [13, 10, 26, 10]))?.ext).toBe("png");
    expect(tipoPorFirma(bytes("GIF89a"))?.ext).toBe("gif");
    expect(tipoPorFirma(bytes("%PDF-1.7"))?.ext).toBe("pdf");
    expect(tipoPorFirma(bytes("RIFF", [0, 0, 0, 0], "WEBP"))?.ext).toBe("webp");
    expect(tipoPorFirma(bytes("RIFF", [0, 0, 0, 0], "WAVE"))?.ext).toBe("wav");
    expect(tipoPorFirma(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.ext).toBe("webm");
    expect(tipoPorFirma(bytes("OggS", [0]))?.ext).toBe("ogg");
    expect(tipoPorFirma(bytes("ID3", [4, 0]))?.ext).toBe("mp3");
    expect(tipoPorFirma(bytes([0xff, 0xfb, 0x90, 0x00]))?.ext).toBe("mp3");
  });

  it("lo que no se reconoce no se inventa: un .zip (puede ser un Word o un Excel), un AVI, muy corto", () => {
    expect(tipoPorFirma(bytes("PK", [3, 4]))).toBeNull();
    expect(tipoPorFirma(bytes("RIFF", [0, 0, 0, 0], "AVI "))).toBeNull();
    expect(tipoPorFirma(bytes("ab"))).toBeNull();
    expect(tipoPorFirma(bytes("hola mundo, esto es texto"))).toBeNull();
  });
});

describe("cuándo se mira adentro", () => {
  const hubstaff = { nombre: "EXPLICACIÓN DE HUBSTAFF", mime: "application/octet-stream", size: 144_495_654 };

  it("sin extensión y con un tipo genérico, sí (el caso de ENTREGA DE CARGO)", () => {
    expect(hayQueMirarAdentro(hubstaff)).toBe(true);
    expect(hayQueMirarAdentro({ nombre: "Contratación - 2026／09／04 11:05 GMT-05:00 - Recording", mime: null, size: 1 })).toBe(true);
  });

  it("si el nombre o la ficha ya lo dicen, no", () => {
    expect(hayQueMirarAdentro({ nombre: "foto.jpg", mime: "application/octet-stream", size: 1 })).toBe(false);
    expect(hayQueMirarAdentro({ nombre: "Grabación", mime: "video/mp4", size: 1 })).toBe(false);
  });

  it("con la firma, el archivo sin extensión se ve como lo que es", () => {
    expect(vistaConFirma(hubstaff, { mime: "video/mp4", ext: "mp4" }).tipo).toBe("video");
    expect(vistaConFirma({ nombre: "DOCUMENTOS CONTRATACIÓN", mime: null, size: 1 }, { mime: "application/pdf", ext: "pdf" }).tipo).toBe("pdf");
    expect(vistaConFirma(hubstaff, null).tipo).toBe("ninguno");
  });
});

describe("las pantallas", () => {
  it("el visor mira la firma antes de decir «no tiene vista previa»", () => {
    const visor = fuente("VistasDelVisor.tsx");
    expect(visor.length).toBeGreaterThan(1000);
    expect(visor).toMatch(/hayQueMirarAdentro\(archivo\)/);
    expect(visor).toMatch(/useFirmaDelArchivo\(/);
    expect(visor.indexOf("if (mirando)")).toBeLessThan(visor.indexOf('if (vista.tipo === "ninguno")'));
  });

  it("el enlace directo de algo que no es de Oficina abre el visor, no la Oficina", () => {
    const pagina = fuente("ArchivoDelDrivePage.tsx");
    expect(pagina).toMatch(/!comoSeAbreEnLaOficina\(ficha\.data\)/);
    expect(pagina).toMatch(/<VisorArchivo items=\{\[ficha\.data\]\}/);
  });
});
