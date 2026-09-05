// El freno que hace que un aviso suene UNA vez con varias pestañas abiertas.
//
// Estos tests existen sobre todo por los de FALLA: la regla del archivo es que
// ante cualquier duda tiene que sonar. Un aviso mudo no se nota hasta que
// importa, y con la voz de los avisos de Cowork ya dejamos al equipo en
// silencio dos veces sin enterarnos. Si alguien "optimiza" esto y convierte un
// error de localStorage en un `return false`, acá se ve.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sonarUnaVezEntrePestanas } from "@/lib/sonarUnaVezEntrePestanas";

/** ¿Sonó? Devuelve true/false igual que la versión vieja, para que los casos se
 *  lean igual. En jsdom no hay Web Locks, así que cae por la rama sin candado y
 *  la llamada es SÍNCRONA. La exclusión real entre pestañas no se puede probar
 *  acá — se verificó en vivo con dos pestañas de verdad. */
function sono(clave: string, ventanaMs: number): boolean {
  let s = false;
  sonarUnaVezEntrePestanas(clave, ventanaMs, () => { s = true; });
  return s;
}

describe("sonarUnaVezEntrePestanas", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("en jsdom no hay Web Locks: se usa la rama de respaldo", () => {
    expect(typeof (navigator as { locks?: unknown }).locks).toBe("undefined");
  });

  it("la primera pestaña suena", () => {
    expect(sono("mensaje", 1500)).toBe(true);
  });

  it("las demás pestañas se callan dentro de la ventana", () => {
    expect(sono("mensaje", 1500)).toBe(true);
    // Otra pestaña, mismo instante: comparten localStorage.
    expect(sono("mensaje", 1500)).toBe(false);
    expect(sono("mensaje", 1500)).toBe(false);
  });

  it("pasada la ventana vuelve a sonar", () => {
    expect(sono("mensaje", 1500)).toBe(true);
    vi.advanceTimersByTime(1501);
    expect(sono("mensaje", 1500)).toBe(true);
  });

  it("cada familia de aviso lleva su propia ventana", () => {
    expect(sono("mensaje", 1500)).toBe(true);
    // Un pedido de Cowork no puede quedar mudo porque llegó un mensaje.
    expect(sono("cowork-pedido", 1500)).toBe(true);
  });

  // ── Los que de verdad importan: nunca hacia el silencio ──────────────────

  // ⚠️ El espía va sobre `window.localStorage`, NO sobre `Storage.prototype`:
  // en jsdom el prototipo no intercepta y estos dos tests pasarían sin probar
  // nada (comprobado: el valor se escribía igual).
  it("si localStorage.getItem revienta, suena", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage bloqueado");
    });
    expect(sono("mensaje", 1500)).toBe(true);
  });

  it("si localStorage.setItem revienta (cuota llena), suena", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("cuota");
    });
    expect(sono("mensaje", 1500)).toBe(true);
    // Y sigue sonando: no se queda callado porque no pudo anotar.
    expect(sono("mensaje", 1500)).toBe(true);
  });

  it("un valor basura guardado no silencia", () => {
    localStorage.setItem("maven:ding:mensaje", "no-soy-un-numero");
    expect(sono("mensaje", 1500)).toBe(true);
  });

  it("un reloj que saltó hacia atrás no deja mudo hasta alcanzar el futuro", () => {
    // Escenario real: portátil que despierta, o cambio de hora del sistema.
    localStorage.setItem("maven:ding:mensaje", String(Date.now() + 60 * 60 * 1000));
    expect(sono("mensaje", 1500)).toBe(true);
    // Y queda saneado para la próxima.
    expect(sono("mensaje", 1500)).toBe(false);
  });
});
