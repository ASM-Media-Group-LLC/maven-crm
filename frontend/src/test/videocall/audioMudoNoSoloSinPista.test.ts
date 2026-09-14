// El vigilante de la red de seguridad preguntaba UNA sola cosa: "¿te arrancaron
// la pista?". Ese es el caso que MENOS dura. El que dura es el otro —el elemento
// PAUSADO con su pista puesta—, porque el mapa del sink sigue diciendo "ya está
// adjunto" y nadie vuelve a mirarlo: queda mudo el resto de la llamada.
//
// Quedan pausados por dos vías conocidas, y las dos ocurren justo al empezar a
// compartir pantalla: el `detach()` de livekit hace `pause()` sobre cada
// elemento, y mudar la llamada a la ventana flotante del sistema saca los nodos
// del documento, lo que los pausa por especificación.
import { describe, it, expect, vi } from "vitest";
import { motivoDeMudez, perdioLaPista } from "@/lib/audioDeLaLlamada";

const pista = (readyState = "live") => ({ readyState });
const con = (pistas: Array<{ readyState: string }>, paused = false) => ({
  srcObject: { getAudioTracks: () => pistas },
  paused,
});

describe("por qué un audio de llamada está mudo", () => {
  it("un elemento sonando no tiene motivo", () => {
    expect(motivoDeMudez(con([pista()]))).toBeNull();
  });

  it("PAUSADO con su pista puesta: el punto ciego que dejaba silencio permanente", () => {
    expect(motivoDeMudez(con([pista()], true))).toBe("pausado");
    // Y la pregunta vieja decía que estaba todo bien. Por eso no se curaba.
    expect(perdioLaPista(con([pista()], true))).toBe(false);
  });

  it("sin fuente y sin pistas se siguen detectando como antes", () => {
    expect(motivoDeMudez({ srcObject: null })).toBe("sin-fuente");
    expect(motivoDeMudez(con([]))).toBe("sin-pistas");
  });

  it("una pista terminada no se cura re-adjuntándola, así que se reporta aparte", () => {
    expect(motivoDeMudez(con([pista("ended")]))).toBe("pista-muerta");
  });

  it("si una de las pistas sigue viva, el elemento no está mudo", () => {
    expect(motivoDeMudez(con([pista("ended"), pista()]))).toBeNull();
  });

  it("no opina sobre lo que no puede mirar", () => {
    expect(motivoDeMudez(null)).toBeNull();
    expect(motivoDeMudez(undefined)).toBeNull();
  });
});

// Y la otra mitad del mismo agujero: mudar la llamada a la ventana flotante
// pausa sus <video>/<audio>, y el reintento se rendía en silencio a los 1,5 s.
// Sin gesto en el documento nuevo el play() se rechaza, así que la persona se
// iba a mirar lo que compartía y no volvía a oír a nadie, sin rastro en consola.
describe("mudar la llamada de ventana", () => {
  it("si tras los reintentos sigue pausado, se pide el gesto en vez de callarse", async () => {
    vi.resetModules();
    const avisos: string[] = [];
    vi.doMock("@/lib/audioDeLaLlamada", () => ({
      reanudarAudioConGesto: (motivo: string) => { avisos.push(motivo); },
    }));
    const { useReanudarMedia } = await import("@/hooks/useReanudarMedia");
    const { renderHook } = await import("@testing-library/react");

    const caja = document.createElement("div");
    const audio = document.createElement("audio");
    // jsdom no implementa play(): uno que siempre rechaza es exactamente la
    // política de autoplay del documento nuevo.
    Object.defineProperty(audio, "paused", { get: () => true });
    audio.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    caja.appendChild(audio);
    const destino = document.createElement("div");

    vi.useFakeTimers();
    renderHook(() => useReanudarMedia(caja, destino, true));
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/mud/i);
  });
});
