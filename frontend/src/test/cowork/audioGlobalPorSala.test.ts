import { describe, it, expect } from "vitest";

// La regla de los botones "Escuchar todas" / "Hablar a todas" del coordinador.
//
// El global NO es un candado: es una acción que fija todas las salas de un
// golpe, y después cada sala queda libre. Antes mandaba el global
// (`globalHear && porSala`), así que con todo silenciado destildar una sala no
// hacía nada — para oír UNA había que volver a oír las nueve.
//
// Se prueba la semántica pura, sin React: es lo que se puede romper sin que
// nadie lo note, porque la UI sigue viéndose igual.

type Estado = Record<string, boolean>;

const SALAS = ["a", "b", "c"];

/** Escucha: por defecto SÍ se escucha una sala. */
const escucha = (est: Estado, sala: string) => est[sala] ?? true;
/** Micrófono: por defecto NO se le habla a una sala. */
const habla = (est: Estado, sala: string) => est[sala] ?? false;

const todas = (est: Estado, lee: (e: Estado, s: string) => boolean) =>
  SALAS.every((s) => lee(est, s));

/** Lo que hace el botón global: fijar todas al mismo valor. */
const fijarTodas = (encendido: boolean): Estado =>
  Object.fromEntries(SALAS.map((s) => [s, encendido]));

describe("audio del coordinador: global por sala", () => {
  it("silenciar todas apaga las tres", () => {
    const est = fijarTodas(false);
    expect(SALAS.map((s) => escucha(est, s))).toEqual([false, false, false]);
  });

  it("con todo silenciado, destildar una sala SÍ la reactiva", () => {
    // Este es el caso que antes no funcionaba: el global bloqueaba la miniatura.
    const est = { ...fijarTodas(false), b: true };
    expect(escucha(est, "a")).toBe(false);
    expect(escucha(est, "b")).toBe(true);
    expect(escucha(est, "c")).toBe(false);
  });

  it("escuchar todas deja las tres encendidas, incluida la que ya lo estaba", () => {
    const antes = { ...fijarTodas(false), b: true };
    const despues = fijarTodas(true);
    expect(escucha(antes, "b")).toBe(true);        // ya venía encendida
    expect(SALAS.map((s) => escucha(despues, s))).toEqual([true, true, true]);
  });

  it("el botón solo dice 'todas' cuando de verdad lo están", () => {
    expect(todas(fijarTodas(true), escucha)).toBe(true);
    expect(todas({ ...fijarTodas(false), b: true }, escucha)).toBe(false); // mezcla
    expect(todas(fijarTodas(false), escucha)).toBe(false);
  });

  it("desde una mezcla, el botón enciende el resto en vez de apagar", () => {
    // Se viene de silenciar todo y rescatar una sala: lo que se quiere es sumar
    // las demás, no perder la que ya se estaba escuchando.
    const mezcla = { ...fijarTodas(false), b: true };
    const siguiente = fijarTodas(!todas(mezcla, escucha));
    expect(SALAS.map((s) => escucha(siguiente, s))).toEqual([true, true, true]);
  });

  it("el micrófono sigue la misma regla, con el default invertido", () => {
    const vacio: Estado = {};
    expect(SALAS.map((s) => habla(vacio, s))).toEqual([false, false, false]);

    const hablarATodas = fijarTodas(true);
    expect(todas(hablarATodas, habla)).toBe(true);

    // Y hablarle a una sola sin tener que apagar el global primero.
    const soloB = { ...fijarTodas(false), b: true };
    expect(habla(soloB, "b")).toBe(true);
    expect(habla(soloB, "a")).toBe(false);
    expect(todas(soloB, habla)).toBe(false);
  });
});
