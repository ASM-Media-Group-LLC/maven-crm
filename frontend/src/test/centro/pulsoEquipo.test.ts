import { describe, it, expect } from "vitest";
import { construirPulso, puedeVerPulso, nivelesVisibles, esProblema } from "@/lib/pulsoEquipo";
import type { EstadoVivo } from "@/hooks/useRondinVivo";

// GUARD del pulso del equipo (Alvaro, 05/11). La nota viva, quién la baja y las
// cajas por equipo salen de esta función pura; de ella dependen decisiones de
// vigilancia, así que tiene que ser exacta. Jerarquía: cada rango ve de su nivel
// para abajo (estrictamente). El pulso solo lo ven supervisor+.

const persona = (userId: string, equipo: string, nombre = userId) =>
  ({ userId, nombre, avatarUrl: null, avatarSeed: null, equipo });
const estado = (e: EstadoVivo, desde: string | null = null) => ({ estado: e, desde });

describe("jerarquía de visibilidad", () => {
  it("cada rango ve a TODOS los de nivel inferior (no a sus pares)", () => {
    expect(nivelesVisibles("dueno").sort()).toEqual(["admin", "agente", "manager", "supervisor"]);
    expect(nivelesVisibles("admin").sort()).toEqual(["agente", "manager", "supervisor"]);
    expect(nivelesVisibles("manager").sort()).toEqual(["agente", "supervisor"]);
    expect(nivelesVisibles("supervisor")).toEqual(["agente"]);
    expect(nivelesVisibles("agente")).toEqual([]);
  });

  it("el pulso lo ven supervisor para arriba; el agente no", () => {
    expect(puedeVerPulso("dueno")).toBe(true);
    expect(puedeVerPulso("admin")).toBe(true);
    expect(puedeVerPulso("manager")).toBe(true);
    expect(puedeVerPulso("supervisor")).toBe(true);
    expect(puedeVerPulso("agente")).toBe(false);
    expect(puedeVerPulso(null)).toBe(false);
  });
});

describe("estados que son 'cometiendo error ahora'", () => {
  it("celular/distraído/no_mira/cámara apagada/se fue son problema; trabajar/pausa no", () => {
    for (const e of ["celular", "distraido", "no_mira", "camara_apagada", "se_fue"] as EstadoVivo[]) {
      expect(esProblema(e)).toBe(true);
    }
    for (const e of ["trabajando", "presente", "pausa", "ausente"] as EstadoVivo[]) {
      expect(esProblema(e)).toBe(false);
    }
  });
});

describe("construirPulso: nota viva + quién la baja + cajas", () => {
  const roster = [
    persona("a", "Chatters"), persona("b", "Chatters"), persona("c", "Chatters"),
    persona("d", "PR"), persona("e", "PR"),
  ];

  const TODOS = new Set(["a", "b", "c", "d", "e"]);

  it("la nota viva promedia SOLO a los conectados (el offline no cuenta)", () => {
    const estados = new Map([
      ["a", estado("trabajando")], // 100
      ["b", estado("trabajando")], // 100
      ["d", estado("pausa")],      // 55
      ["e", estado("celular")],    // 15
    ]);
    // c está offline (no está en el set online) → no cuenta.
    const p = construirPulso(roster, estados, new Set(["a", "b", "d", "e"]));
    // conectados: a,b,d,e → (100+100+55+15)/4 = 67.5 → 68
    expect(p.conectados).toBe(4);
    expect(p.notaViva).toBe(68);
    expect(p.total).toBe(5);
    expect(p.trabajando).toBe(2);
  });

  it("online sin dato de Argos = presente (conectado), no offline", () => {
    // Nadie tiene estado de rondín, pero 3 están online.
    const p = construirPulso(roster, new Map(), new Set(["a", "b", "c"]));
    expect(p.conectados).toBe(3);
    expect(p.notaViva).toBe(70); // presente = 70
    expect(p.cajas.reduce((n, c) => n + c.conProblema, 0)).toBe(0);
  });

  it("quién la baja = solo los que están en problema, de peor a menos mal", () => {
    const estados = new Map([
      ["a", estado("trabajando")],
      ["b", estado("se_fue")],   // 15
      ["c", estado("no_mira")],  // 30
      ["d", estado("celular")],  // 15
    ]);
    const p = construirPulso(roster, estados, TODOS);
    expect(p.conProblema).toBe(3);
    // los de 15 (se_fue, celular) antes que el de 30 (no_mira)
    expect(p.quienLaBaja.map((x) => x.userId).slice(0, 2).sort()).toEqual(["b", "d"]);
    expect(p.quienLaBaja[2].userId).toBe("c");
  });

  it("agrupa por equipo y las cajas con problema van primero", () => {
    const estados = new Map([
      ["a", estado("trabajando")], ["b", estado("trabajando")], ["c", estado("trabajando")],
      ["d", estado("trabajando")], ["e", estado("celular")], // PR tiene un problema
    ]);
    const p = construirPulso(roster, estados, TODOS);
    expect(p.cajas).toHaveLength(2);
    // PR (con problema) va primero aunque Chatters tenga mejor nota
    expect(p.cajas[0].equipo).toBe("PR");
    expect(p.cajas[0].conProblema).toBe(1);
    const chatters = p.cajas.find((c) => c.equipo === "Chatters")!;
    expect(chatters.conectados).toBe(3);
    expect(chatters.nota).toBe(100);
  });

  it("si nadie está conectado, la nota viva es null (no 0)", () => {
    const p = construirPulso(roster, new Map(), new Set());
    expect(p.notaViva).toBeNull();
    expect(p.conectados).toBe(0);
    expect(p.cajas).toHaveLength(2); // las cajas igual existen, en gris
  });
});
