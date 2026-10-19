import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hablar } from "@/lib/voz";

// EL BUG (19/10/2026): el motor de voz de Chromium ACEPTA la frase pero nunca la
// reproduce —queda speaking=true sin emitir eventos— y no se recupera ni
// recargando la página; hay que cerrar el navegador entero. La serialización de
// colaDeVoz quitó las ráfagas, pero quedaban dos disparadores que esta guarda
// vigila:
//   1. cancel() sobre un motor INACTIVO (lo que hacía la cola entre frase y
//      frase, un cancel ocioso por aviso). Ahora solo se corta si speaking/pending.
//   2. Chrome pausa la síntesis en pestañas de segundo plano —y el tablero del
//      supervisor vive en segundo plano—. Ahora se hace resume() ANTES de cada
//      speak() (no-op si el motor está sano) y late mientras la frase suena.

type Utt = {
  text: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

let ultima: Utt | undefined;

function montarMotor(estado: { speaking?: boolean; pending?: boolean } = {}) {
  const synth = {
    speaking: !!estado.speaking,
    pending: !!estado.pending,
    cancel: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    speak: vi.fn(),
    getVoices: () => [] as unknown[],
  };
  class Utterance {
    text: string;
    lang = "";
    rate = 1;
    volume = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(t: string) { this.text = t; ultima = this as unknown as Utt; }
  }
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance as unknown);
  return synth;
}

/** Orden en que se invocaron resume y speak, para probar que resume va primero. */
function ordenDe(synth: { resume: { mock: { invocationCallOrder: number[] } }; speak: { mock: { invocationCallOrder: number[] } } }) {
  return { resume: synth.resume.mock.invocationCallOrder[0], speak: synth.speak.mock.invocationCallOrder[0] };
}

beforeEach(() => { ultima = undefined; vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("voz: destrabar el motor de Chromium", () => {
  it("hace resume() ANTES de speak() (destraba un motor pausado en segundo plano)", () => {
    const synth = montarMotor();
    const ok = hablar("hola");
    expect(ok).toBe(true);
    expect(synth.resume).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const { resume, speak } = ordenDe(synth);
    expect(resume).toBeLessThan(speak);
  });

  it("NO corta (cancel) si el motor está inactivo — el cancel ocioso es lo que lo trababa", () => {
    const synth = montarMotor({ speaking: false, pending: false });
    hablar("hola");
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  it("SÍ corta si ya venía hablando (dos frases encimadas no se entienden)", () => {
    const synth = montarMotor({ speaking: true });
    hablar("hola");
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("el latido de resume() late mientras habla y se apaga al terminar (no deja timers colgados)", () => {
    const synth = montarMotor({ speaking: true });
    hablar("hola");
    ultima?.onstart?.();
    const antes = synth.resume.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(synth.resume.mock.calls.length).toBeGreaterThan(antes); // pulsó mientras hablaba

    ultima?.onend?.();                                              // la frase terminó
    const alTerminar = synth.resume.mock.calls.length;
    vi.advanceTimersByTime(20000);
    expect(synth.resume.mock.calls.length).toBe(alTerminar);       // ya no pulsa
  });

  it("devuelve false sin motor de síntesis (y no revienta)", () => {
    vi.stubGlobal("speechSynthesis", undefined);
    expect(hablar("hola")).toBe(false);
  });
});
