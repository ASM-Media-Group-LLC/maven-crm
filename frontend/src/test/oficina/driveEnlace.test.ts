import { describe, it, expect } from "vitest";
import { estadoDelEnlace } from "@/hooks/useDrive";

// EL ENLACE A UNA CARPETA DEL DRIVE (Brayan, 03/11: «cada vez que alguien
// comparte un link de drive sale una carpeta en blanco como que se reenruta»).
// Con un enlace a una carpeta que no está compartida contigo (o que está en la
// papelera), la RLS no devuelve nada y la página pintaba «Mi unidad · Esta
// carpeta está vacía». Ahora dice qué pasa.

const pagina = import.meta.glob("../../pages/oficina/DrivePage.tsx", { query: "?raw", import: "default", eager: true });
const fuente = Object.values(pagina)[0] as string;

describe("estadoDelEnlace", () => {
  it("sin ficha visible es «sin acceso», no una carpeta vacía", () => {
    expect(estadoDelEnlace(null)).toBe("sin_acceso");
  });
  it("una carpeta tirada es «papelera»", () => {
    expect(estadoDelEnlace({ trashed_at: "2026-10-05T16:39:07Z" })).toBe("papelera");
  });
  it("una carpeta normal se abre", () => {
    expect(estadoDelEnlace({ trashed_at: null })).toBe("ok");
  });
});

describe("DrivePage con un enlace", () => {
  it("revisa la carpeta del enlace antes de mostrar «vacía»", () => {
    expect(fuente).toContain("useCarpetaDelEnlace(carpeta)");
    expect(fuente).toContain('"drive.enlace.sinAcceso"');
    expect(fuente).toContain('"drive.enlace.papelera"');
  });
  it("sin «?vista=» la sección sale de la raíz de la carpeta, no queda en Mi unidad", () => {
    expect(fuente).toMatch(/vistaDelEnlace\s*\?\?\s*\(carpeta && raizDeLaRuta \? vistaDeLaRaiz/);
  });
});
