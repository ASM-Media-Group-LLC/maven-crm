import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// LA CAÍDA DE LA SALA, VISTA POR LA PRESENCIA (29/09/2026).
//
// (1) La conexión tiene que VIAJAR: el tablero decide "sin conexión" con ella,
//     y llega fresca aunque la página de Cowork esté desmontada (la llamada
//     sigue en la ventanita). El reloj, en cambio, se quedaba congelado.
// (2) Al volver de la caída, "sin compartir pantalla" cuenta de nuevo. Si no,
//     apenas reconectaba el tablero decía "lleva 7 minutos sin compartir
//     pantalla" contando la caída, y afirmaba avisos que nunca le llegaron.

type Payload = Record<string, unknown>;
const enviados: Payload[] = [];

function canalFalso() {
  const c = {
    state: "closed", oyentes: {} as Record<string, Array<() => void>>,
    on(_t: string, f: { event: string }, cb: () => void) { (c.oyentes[f.event] ??= []).push(cb); return c; },
    subscribe(cb?: (e: string) => void) { c.state = "joining"; setTimeout(() => { c.state = "joined"; cb?.("SUBSCRIBED"); }, 5); return c; },
    track: vi.fn(async (p: Payload) => { enviados.push(p); return "ok"; }),
    presenceState: () => ({}),
  };
  return c;
}
let canal = canalFalso();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: () => canal, removeChannel: async () => "ok" },
}));

const { useCoworkMediaPresence, salirDePresencia } = await import("@/hooks/useCoworkMediaPresence");

const base = { micOn: true, camOn: true, screenShareOn: true };

beforeEach(() => { vi.useFakeTimers(); salirDePresencia(); canal = canalFalso(); enviados.length = 0; });
afterEach(() => { vi.useRealTimers(); });

async function publicar(track: (s: never) => void, estado: Payload, avanzar = 2_100) {
  await act(async () => { track(estado as never); await vi.advanceTimersByTimeAsync(avanzar); });
}

describe("la presencia durante una caída de la sala", () => {
  it("⚠️ la conexión viaja en la presencia (el tablero decide con ella)", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "yo", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await publicar(result.current.trackMediaState, { ...base, conexionSala: "desconectada" });
    expect(enviados[enviados.length - 1]).toMatchObject({ conexionSala: "desconectada" });
    await publicar(result.current.trackMediaState, { ...base, conexionSala: "conectada" });
    expect(enviados[enviados.length - 1]).toMatchObject({ conexionSala: "conectada" });
  });

  it("⚠️ al volver de la caída, 'sin compartir pantalla' cuenta desde que volvió", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "yo", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    // Se cae la sala: la pantalla deja de compartirse.
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "desconectada" });
    const desdeLaCaida = enviados[enviados.length - 1].screenShareSince as number;
    // Siete minutos de caída.
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "desconectada" }, 7 * 60_000);
    expect(enviados[enviados.length - 1].screenShareSince).toBe(desdeLaCaida);
    // Vuelve la sala, todavía sin pantalla (queda el botón).
    const alVolver = Date.now();
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" });
    const despues = enviados[enviados.length - 1].screenShareSince as number;
    expect(despues).toBeGreaterThanOrEqual(alVolver);
    expect(despues - desdeLaCaida).toBeGreaterThanOrEqual(7 * 60_000);
  });

  it("⚠️ si ya no compartía desde ANTES de la caída, el contador sigue", async () => {
    // Si no, cada caída corta la volvía invisible para el supervisor.
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "yo", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" });
    const desdeAntes = enviados[enviados.length - 1].screenShareSince as number;
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" }, 20 * 60_000);
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "desconectada" }, 30_000);
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" });
    expect(enviados[enviados.length - 1].screenShareSince).toBe(desdeAntes);
  });

  it("sin caída de por medio, el sello se arrastra como siempre", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "yo", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" });
    const primero = enviados[enviados.length - 1].screenShareSince;
    await publicar(result.current.trackMediaState, { ...base, screenShareOn: false, conexionSala: "conectada" }, 60_000);
    expect(enviados[enviados.length - 1].screenShareSince).toBe(primero);
  });
});
