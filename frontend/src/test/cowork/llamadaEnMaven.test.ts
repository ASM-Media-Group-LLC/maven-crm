import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  latirEnLlamada, salirDeLlamada, estaEnLlamadaDeMaven,
  LATIDO_LLAMADA_MS, VIGENCIA_LLAMADA_MS,
} from "@/lib/llamadaEnMaven";

// EL BUG (Grace, 01/09/2026): la llamada de Cowork sobrevive a navegar — a
// propósito — y su supervisor de encuadre le reclamaba "enciende la cámara" a
// alguien que estaba EN una videollamada de Maven, en otra pestaña. Estar en
// una llamada de la empresa es trabajo, no una ausencia.
//
// La marca vive en localStorage porque las llamadas abren en OTRA pestaña: el
// estado de React (y el module-level de la pausa) no cruza pestañas.

describe("estar en una llamada de Maven silencia al supervisor de Cowork", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sin latido, no hay llamada", () => {
    expect(estaEnLlamadaDeMaven()).toBe(false);
  });

  it("con latido fresco, hay llamada", () => {
    latirEnLlamada();
    expect(estaEnLlamadaDeMaven()).toBe(true);
  });

  it("al salir de la llamada la marca se borra al instante", () => {
    latirEnLlamada();
    salirDeLlamada();
    expect(estaEnLlamadaDeMaven()).toBe(false);
  });

  it("el latido CADUCA solo: un cierre sucio de la pestaña no deja mudo al supervisor", () => {
    // La pestaña de la llamada puede morir sin desmontar nada (crash, kill).
    // Sin caducidad, ese último latido silenciaría los avisos para siempre.
    const t0 = 1_000_000;
    latirEnLlamada(t0);
    expect(estaEnLlamadaDeMaven(t0 + VIGENCIA_LLAMADA_MS - 1)).toBe(true);
    expect(estaEnLlamadaDeMaven(t0 + VIGENCIA_LLAMADA_MS)).toBe(false);
  });

  it("la vigencia tolera un tic perdido del latido (pestaña de fondo estrangulada)", () => {
    // El navegador ralentiza los timers de una pestaña de fondo; si la vigencia
    // fuera igual al intervalo, cada tic tarde reactivaría el reclamo a mitad
    // de la reunión.
    expect(VIGENCIA_LLAMADA_MS).toBeGreaterThan(LATIDO_LLAMADA_MS * 2);
  });

  it("una marca corrupta no cuenta como llamada", () => {
    localStorage.setItem("mvn_en_llamada_maven", "garbage");
    expect(estaEnLlamadaDeMaven()).toBe(false);
  });

  it("no explota sin localStorage (modo privado)", () => {
    // Se mockea la INSTANCIA: en el jsdom de este proyecto los métodos de
    // localStorage no pasan por Storage.prototype.
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => latirEnLlamada()).not.toThrow();
    expect(estaEnLlamadaDeMaven()).toBe(false);
    expect(() => salirDeLlamada()).not.toThrow();
  });
});
