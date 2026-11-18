import { afterEach, describe, expect, it, vi } from "vitest";
import { claveDeRecuadro, mismoContenido, participantesEstables } from "@/lib/participantesEstables";
import { medirTrabas } from "@/lib/saludDeLlamada";

// 17/11/2026: Cowork y el Supervisor Hub se trababan. Lo medido: el motor de
// React era lo que más tiempo ocupaba cada minuto. Dos causas: la lista de
// participantes se rearmaba con objetos nuevos cada 3 s y con cada evento, y el
// hub redibujaba la página entera cada segundo para mover los segunderos.
const hook = Object.values(import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const hub = Object.values(import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

const p = (sid: string, extra: Record<string, unknown> = {}) => ({ sid, name: sid, isSpeaking: false, isMuted: false, reactions: [] as string[], ...extra });

describe("la lista de participantes no se rearma si nada cambió", () => {
  it("todo igual → la MISMA lista (React no redibuja)", () => {
    const antes = [p("a"), p("b")];
    const nuevos = [p("a"), p("b")];
    expect(participantesEstables(antes, nuevos, claveDeRecuadro)).toBe(antes);
  });
  it("cambia uno → lista nueva, pero el que no cambió conserva su objeto", () => {
    const antes = [p("a"), p("b")];
    const salida = participantesEstables(antes, [p("a"), p("b", { isSpeaking: true })], claveDeRecuadro);
    expect(salida).not.toBe(antes);
    expect(salida[0]).toBe(antes[0]);
    expect(salida[1]).not.toBe(antes[1]);
    expect(salida[1].isSpeaking).toBe(true);
  });
  it("entra o sale alguien, o cambia el orden → lista nueva", () => {
    const antes = [p("a"), p("b")];
    expect(participantesEstables(antes, [p("a")], claveDeRecuadro)).not.toBe(antes);
    expect(participantesEstables(antes, [p("b"), p("a")], claveDeRecuadro)).not.toBe(antes);
  });
  it("las reacciones se comparan por contenido", () => {
    expect(mismoContenido(p("a", { reactions: ["👍"] }), p("a", { reactions: ["👍"] }))).toBe(true);
    expect(mismoContenido(p("a", { reactions: ["👍"] }), p("a", { reactions: ["👍", "🎉"] }))).toBe(false);
  });
  it("la pantalla y la persona de alguien son recuadros distintos", () => {
    expect(claveDeRecuadro({ sid: "a" })).not.toBe(claveDeRecuadro({ sid: "a", esTileDePantalla: true }));
  });
  it("la llamada usa la lista estable", () => {
    expect(hook).toContain("setParticipants((antes) => participantesEstables<LKParticipant>(antes, result, claveDeRecuadro));");
  });
});

describe("el Supervisor Hub no se redibuja entero cada segundo", () => {
  it("la página se refresca cada 5 s (30 s oculta) y los segunderos son componentes propios", () => {
    expect(hub).toContain('const ms = document.visibilityState === "visible" ? 5000 : 30_000;');
    expect(hub).not.toMatch(/formatoReloj\(Math\.max\(0, Math\.floor\(\(now -/);
    expect(hub).toContain("<RelojDePersona reloj={p.reloj} />");
    expect(hub).toContain("<Cronometro desde={Date.parse(meet.started_at)} />");
  });
});

describe("el reloj compartido de un segundo", () => {
  afterEach(() => { vi.useRealTimers(); vi.resetModules(); });
  it("un solo intervalo para todos y se apaga cuando nadie mira", async () => {
    vi.useFakeTimers();
    const espia = vi.spyOn(globalThis, "setInterval");
    const m = await import("@/lib/ahoraCompartido");
    const { renderHook } = await import("@testing-library/react");
    const uno = renderHook(() => m.useAhoraCadaSegundo());
    const dos = renderHook(() => m.useAhoraCadaSegundo());
    expect(m.oyentesDelReloj()).toBe(2);
    expect(espia.mock.calls.filter(([, ms]) => ms === 1000).length).toBe(1);
    uno.unmount();
    dos.unmount();
    expect(m.oyentesDelReloj()).toBe(0);
  });
});

describe("la medición dice DÓNDE se traba", () => {
  it("guarda el script más largo de cada culpable con archivo y posición", () => {
    let alObservar: ((l: { getEntries: () => unknown[] }) => void) | null = null;
    class ObservadorFalso {
      static supportedEntryTypes = ["long-animation-frame"];
      constructor(cb: (l: { getEntries: () => unknown[] }) => void) { alObservar = cb; }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("PerformanceObserver", ObservadorFalso);
    const m = medirTrabas();
    alObservar!({ getEntries: () => [{ duration: 900, scripts: [
      { duration: 700, sourceURL: "https://app.maven-ai.me/assets/index-Ab12Cd34.js", sourceFunctionName: "y", sourceCharPosition: 123456 },
      { duration: 100, sourceURL: "https://app.maven-ai.me/assets/index-Ab12Cd34.js", sourceFunctionName: "y", sourceCharPosition: 999 },
    ] }] });
    const [t] = m.leer();
    expect(t).toEqual({ quien: "index.js:y", ms: 800, max: 700, donde: "index-Ab12Cd34.js@123456" });
    vi.unstubAllGlobals();
  });
});
