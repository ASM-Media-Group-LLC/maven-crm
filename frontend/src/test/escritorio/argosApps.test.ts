import { describe, expect, it } from "vitest";
import { duracion, resumirUso } from "@/lib/usoDeApps";
import { filasDeUso } from "@/lib/escritorio";

describe("resumen de apps del día (app de computador)", () => {
  it("suma por app, ordena por tiempo y junta las páginas", () => {
    const r = resumirUso([
      { app: "Google Chrome", titulo: "Infloww", url: null, segundos: 300, segundos_inactivo: 0 },
      { app: "WhatsApp", titulo: "", url: null, segundos: 120, segundos_inactivo: 60 },
      { app: "Google Chrome", titulo: "Infloww", url: "https://infloww.com", segundos: 200, segundos_inactivo: 100 },
      { app: "Google Chrome", titulo: "YouTube", url: null, segundos: 50, segundos_inactivo: 0 },
    ]);
    expect(r.total).toBe(670);
    expect(r.inactivos).toBe(160);
    expect(r.apps.map((a) => a.app)).toEqual(["Google Chrome", "WhatsApp"]);
    expect(r.apps[0].paginas[0]).toEqual({ titulo: "Infloww", url: "https://infloww.com", segundos: 500 });
    expect(r.apps[1].paginas).toEqual([]);
  });

  it("lo inactivo nunca pasa del tiempo del tramo", () => {
    expect(resumirUso([{ app: "X", titulo: "", url: null, segundos: 30, segundos_inactivo: 90 }]).inactivos).toBe(30);
  });

  it("duración legible", () => {
    expect(duracion(40)).toBe("40 s");
    expect(duracion(720)).toBe("12 min");
    expect(duracion(7500)).toBe("2 h 05 min");
  });
});

describe("filas que la página guarda de la app", () => {
  it("descarta tramos inválidos, recorta y solo deja URLs http", () => {
    const filas = filasDeUso([
      { app: "Chrome", titulo: "a".repeat(400), url: "javascript:alert(1)", desde: "2026-11-17T10:00:00Z", hasta: "2026-11-17T10:01:00Z", segundos: 60, inactivos: 90 },
      { app: "", titulo: "", url: null, desde: "", hasta: "", segundos: 5, inactivos: 0 },
      { app: "Zoom", titulo: "", url: "https://zoom.us", desde: "x", hasta: "y", segundos: 0, inactivos: 0 },
    ], "mac");
    expect(filas).toHaveLength(1);
    expect(filas[0].titulo).toHaveLength(300);
    expect(filas[0].url).toBeNull();
    expect(filas[0].segundos_inactivo).toBe(60);
    expect(filas[0].plataforma).toBe("mac");
  });
});
