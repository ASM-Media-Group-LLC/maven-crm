import { describe, it, expect } from "vitest";
import { personasEnSala, relojDeRespaldo, latidoFresco, LATIDO_FRESCO_MS } from "@/lib/coworkOcupacion";

const T = new Date("2026-09-10T17:51:20Z").getTime();

describe("personasEnSala — la tarjeta muestra a quien ESTÁ", () => {
  it("con la verdad de LiveKit, solo los asignados que están conectados", () => {
    // Julián tenía asignación activa desde hacía 12 horas sin estar: LiveKit no
    // lo veía, así que la tarjeta no debe listarlo.
    expect(personasEnSala(["gian", "julian"], ["gian"])).toEqual(["gian"]);
  });
  it("sin verdad de LiveKit (monitor apagado o sin conectar), los asignados", () => {
    expect(personasEnSala(["gian", "julian"], null)).toEqual(["gian", "julian"]);
    expect(personasEnSala(["gian", "julian"], undefined)).toEqual(["gian", "julian"]);
  });
  it("con la sala vacía según LiveKit, nadie", () => {
    expect(personasEnSala(["julian"], [])).toEqual([]);
  });
  it("un conectado que no está asignado no se inventa en la tarjeta", () => {
    expect(personasEnSala(["gian"], ["gian", "monitor-de-otro"])).toEqual(["gian"]);
  });
});

describe("relojDeRespaldo — el contador cuando la presencia no llega", () => {
  it("arma el mismo reloj que viaja por presencia, desde el latido", () => {
    const r = relojDeRespaldo({ seg_activo_hoy: 17073, ultimo_estado: "activo", ultimo_latido: "2026-09-10T17:51:11Z" }, T);
    expect(r).toEqual({ estado: "activo", segundosHoy: 17073, en: new Date("2026-09-10T17:51:11Z").getTime() });
  });
  it("respeta el estado detenido", () => {
    const r = relojDeRespaldo({ seg_activo_hoy: 15369, ultimo_estado: "pausa", ultimo_latido: "2026-09-10T17:51:09Z" }, T);
    expect(r?.estado).toBe("pausa");
  });
  it("con el latido viejo NO hay reloj: no está, no se le inventa un contador", () => {
    const viejo = new Date(T - LATIDO_FRESCO_MS - 1000).toISOString();
    expect(relojDeRespaldo({ seg_activo_hoy: 100, ultimo_estado: "activo", ultimo_latido: viejo }, T)).toBeNull();
  });
  it("sin latido, o con un estado raro, tampoco", () => {
    expect(relojDeRespaldo(undefined, T)).toBeNull();
    expect(relojDeRespaldo({ seg_activo_hoy: 1, ultimo_estado: null, ultimo_latido: "2026-09-10T17:51:11Z" }, T)).toBeNull();
    expect(relojDeRespaldo({ seg_activo_hoy: 1, ultimo_estado: "loquesea", ultimo_latido: "2026-09-10T17:51:11Z" }, T)).toBeNull();
  });
});

describe("latidoFresco — el punto verde cuando la presencia no llega", () => {
  it("verde con latido reciente, gris con latido viejo o sin latido", () => {
    expect(latidoFresco({ seg_activo_hoy: 0, ultimo_estado: "activo", ultimo_latido: "2026-09-10T17:51:00Z" }, T)).toBe(true);
    expect(latidoFresco({ seg_activo_hoy: 0, ultimo_estado: "activo", ultimo_latido: "2026-09-10T05:30:44Z" }, T)).toBe(false);
    expect(latidoFresco(undefined, T)).toBe(false);
  });
});
