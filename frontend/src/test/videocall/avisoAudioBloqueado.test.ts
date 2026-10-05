import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MARCA_AUDIO, dejarDeEsperarGesto, estaEsperandoGesto, reanudarAudioConGesto,
  reintentarAudioPorGesto, suscribirEsperaDeGesto,
} from "@/lib/audioDeLaLlamada";

// El navegador bloquea el audio hasta un gesto del usuario (autoplay). Hasta el
// 05/10/2026 eso solo dejaba un console.warn: la persona no oía a nadie y la
// pantalla no decía nada. Ahora la espera se puede OBSERVAR, para dibujar un
// aviso con botón, y el botón reanuda sin depender de que su clic burbujee.

// jsdom no implementa `play()` (y no devuelve promesa): se simula con una
// bandera `pausado` que la prueba controla.
function audioFalso(): { el: HTMLAudioElement; desbloquear: () => void } {
  const el = document.createElement("audio");
  el.setAttribute(MARCA_AUDIO, "true");
  let pausado = true;
  Object.defineProperty(el, "paused", { get: () => pausado, configurable: true });
  Object.defineProperty(el, "play", {
    configurable: true,
    value: vi.fn(() => (pausado ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve())),
  });
  document.body.appendChild(el);
  return { el, desbloquear: () => { pausado = false; } };
}

describe("aviso de audio bloqueado", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    dejarDeEsperarGesto();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("avisa cuando empieza la espera y cuando el gesto la termina", () => {
    const { desbloquear } = audioFalso();
    const vistos: boolean[] = [];
    const baja = suscribirEsperaDeGesto((e) => vistos.push(e));
    expect(vistos).toEqual([false]);          // al suscribirse dice el estado actual

    reanudarAudioConGesto("prueba");
    expect(estaEsperandoGesto()).toBe(true);
    expect(vistos).toEqual([false, true]);
    expect(warn).toHaveBeenCalled();

    // Un clic con el audio todavía trabado NO termina la espera.
    document.dispatchEvent(new Event("click"));
    expect(estaEsperandoGesto()).toBe(true);

    // El navegador ya deja sonar: el siguiente gesto la termina y avisa.
    desbloquear();
    document.dispatchEvent(new Event("click"));
    expect(estaEsperandoGesto()).toBe(false);
    expect(vistos).toEqual([false, true, false]);
    baja();
  });

  it("el botón reanuda directo, sin esperar a que el clic burbujee", () => {
    const { desbloquear } = audioFalso();
    const vistos: boolean[] = [];
    suscribirEsperaDeGesto((e) => vistos.push(e));
    reanudarAudioConGesto("prueba");
    expect(vistos[vistos.length - 1]).toBe(true);

    desbloquear();
    reintentarAudioPorGesto();
    expect(estaEsperandoGesto()).toBe(false);
    expect(vistos[vistos.length - 1]).toBe(false);
  });

  it("sin audios pausados no hay espera ni aviso", () => {
    const vistos: boolean[] = [];
    suscribirEsperaDeGesto((e) => vistos.push(e));
    reanudarAudioConGesto("nada que reanudar");
    expect(estaEsperandoGesto()).toBe(false);
    expect(vistos).toEqual([false]);
  });

  it("darse de baja deja de avisar", () => {
    const { desbloquear } = audioFalso();
    const vistos: boolean[] = [];
    const baja = suscribirEsperaDeGesto((e) => vistos.push(e));
    baja();
    reanudarAudioConGesto("prueba");
    desbloquear();
    reintentarAudioPorGesto();
    expect(vistos).toEqual([false]);
  });
});
