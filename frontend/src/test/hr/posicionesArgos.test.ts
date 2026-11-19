import { describe, expect, it } from "vitest";
import { aplicarPosiciones, mapaDePosiciones } from "@/lib/posicionesArgos";

// JORNADA POR POSICIÓN (Alvaro, 19/11/2026): una caja por posición; quien es
// Admin + otra posición va a la de trabajo; los no obligados a cámara/pantalla
// y los solo-Admin salen en gris sin nota; el dueño y los deshabilitados no salen.

const POS = [
  { id: "d", nombre: "Dueño", orden: 0, activa: true },
  { id: "a", nombre: "Admin", orden: 1, activa: true },
  { id: "h", nombre: "HHRR", orden: 2, activa: true },
  { id: "c", nombre: "Closer", orden: 3, activa: true },
  { id: "ch", nombre: "Chatter", orden: 6, activa: true },
  { id: "x", nombre: "Vieja", orden: 20, activa: false },
];

describe("mapaDePosiciones", () => {
  const mapa = mapaDePosiciones(POS, [
    { user_id: "grace", posicion_id: "a" }, { user_id: "grace", posicion_id: "h" },
    { user_id: "jack", posicion_id: "a" }, { user_id: "jack", posicion_id: "c" },
    { user_id: "soloAdmin", posicion_id: "a" },
    { user_id: "pachas", posicion_id: "c" },
    { user_id: "chat", posicion_id: "ch" },
    { user_id: "yo", posicion_id: "d" },
    { user_id: "lore", posicion_id: "ch" },
    { user_id: "vieja", posicion_id: "x" },
  ], [
    { user_id: "grace", sin_camara: true, deshabilitada: false },
    { user_id: "jack", sin_camara: true, deshabilitada: false },
    { user_id: "pachas", sin_camara: true, deshabilitada: false },
    { user_id: "lore", sin_camara: false, deshabilitada: true },
  ]);

  it("quien es Admin y algo más va a la caja de su trabajo", () => {
    expect(mapa.get("grace")?.posicion).toBe("HHRR");
    expect(mapa.get("jack")?.posicion).toBe("Closer");
  });
  it("los no obligados a cámara/pantalla y los solo-Admin salen sin nota", () => {
    expect(mapa.get("grace")?.sinNota).toBe(true);
    expect(mapa.get("pachas")?.sinNota).toBe(true);
    expect(mapa.get("soloAdmin")).toMatchObject({ posicion: "Admin", sinNota: true });
    expect(mapa.get("chat")?.sinNota).toBe(false);
  });
  it("el dueño y los deshabilitados no salen; las posiciones apagadas no cuentan", () => {
    expect(mapa.get("yo")?.oculta).toBe(true);
    expect(mapa.get("lore")?.oculta).toBe(true);
    expect(mapa.has("vieja")).toBe(false);
  });

  it("aplicarPosiciones cambia la caja, saca a los ocultos y respeta a quien no tiene posición", () => {
    const gente: Array<{ userId: string; equipo: string; sinNota?: boolean }> = [
      { userId: "chat", equipo: "Chatters" },
      { userId: "yo", equipo: "Admin" },
      { userId: "nuevo", equipo: "Otros" },
      { userId: "grace", equipo: "RRHH" },
    ];
    const r = aplicarPosiciones(gente, mapa, "Sin posición");
    expect(r.map((p) => `${p.userId}:${p.equipo}:${p.sinNota ? "gris" : "nota"}`)).toEqual([
      "chat:Chatter:nota", "nuevo:Sin posición:nota", "grace:HHRR:gris",
    ]);
  });
  it("sin mapa (no es el dueño) todo queda igual", () => {
    const gente = [{ userId: "chat", equipo: "Chatters" }];
    expect(aplicarPosiciones(gente, null, "Sin posición")).toBe(gente);
  });
});
