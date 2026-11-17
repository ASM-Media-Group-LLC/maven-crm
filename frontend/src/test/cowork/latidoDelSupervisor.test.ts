import { describe, it, expect } from "vitest";
import { juntarMedios } from "@/lib/latidoDelSupervisor";

// Luis, 17/11/2026: en la Sala 1 con cámara y pantalla, se le cayó el Hub y
// Argos lo reportó «fuera de Cowork». El latido del supervisor cuenta el Hub Y
// la sala donde está.

const fuentes = import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const tablero = Object.values(fuentes)[0];

describe("juntarMedios", () => {
  it("con el Hub caído cuenta lo prendido en la sala", () => {
    expect(juntarMedios(null, { camOn: true, screenShareOn: true, conexionSala: "conectada" }))
      .toEqual({ camOn: true, screenShareOn: true, conexionSala: "conectada" });
  });

  it("basta con que una de las dos tenga cámara o pantalla", () => {
    const r = juntarMedios(
      { camOn: false, screenShareOn: true, conexionSala: "conectada" },
      { camOn: true, screenShareOn: false, conexionSala: "conectada" },
    );
    expect(r.camOn).toBe(true);
    expect(r.screenShareOn).toBe(true);
  });

  it("si una está conectada, está adentro aunque la otra se haya caído", () => {
    expect(juntarMedios(
      { camOn: false, screenShareOn: false, conexionSala: "desconectada" },
      { camOn: true, screenShareOn: true, conexionSala: "conectada" },
    ).conexionSala).toBe("conectada");
    expect(juntarMedios(
      { camOn: false, screenShareOn: false, conexionSala: "reemplazada" },
      { camOn: true, screenShareOn: true, conexionSala: "reconectando" },
    ).conexionSala).toBe("reconectando");
  });

  it("sin ninguna llamada no inventa nada", () => {
    expect(juntarMedios(null, null)).toEqual({ camOn: false, screenShareOn: false, conexionSala: null });
  });
});

describe("tablero del supervisor: el latido no muere con el Hub si está en una sala", () => {
  it("colgar el Hub dentro de una sala no apaga el latido", () => {
    const colgar = tablero.slice(tablero.indexOf("const colgarHub"), tablero.indexOf("const colgarHub") + 900);
    expect(colgar).toMatch(/enUnaSalaRef\.current[\s\S]*return;[\s\S]*detenerLatido\(\)/);
  });

  it("el latido arranca con el Hub O con una sala", () => {
    expect(tablero).toMatch(/hubConnected \|\| enUnaSala/);
  });

  it("la sala del supervisor también alimenta su latido", () => {
    expect(tablero).toMatch(/medioSalaRef\.current = \{ camOn: m\.camOn/);
  });
});
