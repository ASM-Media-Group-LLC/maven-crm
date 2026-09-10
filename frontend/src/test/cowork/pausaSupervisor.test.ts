import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  fijarPausaSupervisor, leerPausaSupervisor, suscribirPausaSupervisor,
  etiquetaDePausaSupervisor, fraseDeSupervisoresEnPausa, esEstadoSupervisor,
} from "@/lib/pausaSupervisor";
import { separarPresencias } from "@/hooks/useCoworkMediaPresence";

beforeEach(() => fijarPausaSupervisor(null));

describe("la pausa del supervisor — el store", () => {
  it("arranca disponible y avisa al cambiar", () => {
    expect(leerPausaSupervisor()).toBeNull();
    const visto: unknown[] = [];
    const baja = suscribirPausaSupervisor((e) => visto.push(e));
    fijarPausaSupervisor("lunch");
    fijarPausaSupervisor("lunch");   // repetir no avisa dos veces
    fijarPausaSupervisor(null);
    baja();
    fijarPausaSupervisor("break");
    expect(visto).toEqual(["lunch", null]);
    expect(leerPausaSupervisor()).toBe("break");
  });
  it("un oyente roto no frena a los demás", () => {
    const ok = vi.fn();
    const b1 = suscribirPausaSupervisor(() => { throw new Error("x"); });
    const b2 = suscribirPausaSupervisor(ok);
    fijarPausaSupervisor("ausente");
    expect(ok).toHaveBeenCalledWith("ausente");
    b1(); b2();
  });
});

describe("lo que ve el chatter", () => {
  it("nombra a cada supervisor en pausa con su estado, sin contador", () => {
    expect(fraseDeSupervisoresEnPausa([
      { nombre: "Álvaro", estado: "break" },
      { nombre: "Yoselin", estado: null },
      { nombre: "Daniel", estado: "lunch" },
    ])).toBe("Álvaro está en break · Daniel está almorzando");
  });
  it("sin nadie en pausa no hay banner", () => {
    expect(fraseDeSupervisoresEnPausa([{ nombre: "Álvaro", estado: null }, { nombre: "X", estado: undefined }])).toBeNull();
  });
  it("etiquetas y validación", () => {
    expect(etiquetaDePausaSupervisor("ausente")).toBe("Ausente");
    expect(etiquetaDePausaSupervisor(null)).toBeNull();
    expect(esEstadoSupervisor("break")).toBe(true);
    expect(esEstadoSupervisor("siesta")).toBe(false);
  });
});

describe("separarPresencias — el supervisor NO entra a la lista de gente", () => {
  it("su payload se lee aparte y no dispara alertas de cámara/pantalla", () => {
    // Si el supervisor entrara a `mediaStates` con la cámara en false, el
    // tablero le pondría a él mismo la alerta de "sin pantalla".
    const r = separarPresencias([{ esSupervisor: true, supervisorEstado: "break" }]);
    expect(r.gente).toEqual([]);
    expect(r.supervisor).toBe("break");
  });
  it("una persona común no trae disponibilidad", () => {
    const presencias: Array<{ esSupervisor?: boolean; supervisorEstado?: unknown; camOn?: boolean }> = [{ camOn: true }];
    const r = separarPresencias(presencias);
    expect(r.gente).toHaveLength(1);
    expect(r.supervisor).toBeUndefined();
  });
  it("disponible es null, y un estado inventado también cae a null", () => {
    expect(separarPresencias([{ esSupervisor: true, supervisorEstado: null }]).supervisor).toBeNull();
    expect(separarPresencias([{ esSupervisor: true, supervisorEstado: "siesta" }]).supervisor).toBeNull();
  });
  it("con varias conexiones del supervisor manda la última", () => {
    expect(separarPresencias([
      { esSupervisor: true, supervisorEstado: "break" },
      { esSupervisor: true, supervisorEstado: "lunch" },
    ]).supervisor).toBe("lunch");
  });
});
