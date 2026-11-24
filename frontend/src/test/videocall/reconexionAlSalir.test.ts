// Una caída no debe dejar salas ni reintentos vivos al salir o cambiar de llamada.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("livekit-client", async (original) => ({
  ...await original<typeof import("livekit-client")>(),
  Room: vi.fn(),
}));
vi.mock("@/lib/noise-suppression-processor", () => ({
  NoiseSuppresionTrackProcessor: vi.fn(), supportsNoiseSuppression: () => false,
  loadNCPreference: () => false, saveNCPreference: vi.fn(),
}));
vi.mock("@/lib/fondoFino/procesador", () => ({
  ProcesadorDeFondo: vi.fn(), soportaProcesadorDeFondo: () => false,
  precalentarFondo: async () => false, fondoPrecalentado: () => false,
  topeParaPonerFondo: (ms: number) => ms,
}));
vi.mock("@/lib/equipoDormido", () => ({
  faseSegunSueno: (fase: string) => fase,
  vigiaDelSueno: () => ({ durmioHacePoco: () => null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: async () => ({ error: null }) })),
    functions: { invoke: vi.fn() },
    auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } } }) },
  },
  SUPABASE_URL: "https://test.invalid", SUPABASE_PUBLISHABLE_KEY: "test-public",
}));

import { ConnectionState, DisconnectReason, Room, RoomEvent } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import { olvidarLlamadasActivas } from "@/lib/llamadaActiva";

const TOKEN = { token: "test", url: "wss://test.invalid" };
const OPCIONES = { initialMicOn: false, initialCamOn: false };
function pendiente<T>() {
  let resolver!: (valor: T) => void;
  let rechazar!: (error: Error) => void;
  const promesa = new Promise<T>((ok, mal) => { resolver = ok; rechazar = mal; });
  return { promesa, resolver, rechazar };
}
function salaFalsa(nombre = "dm_prueba") {
  type Oyente = (...args: unknown[]) => void;
  const oyentes = new Map<string, Set<Oyente>>();
  const sala = {
    name: nombre, state: ConnectionState.Connected,
    connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    on(evento: string, fn: Oyente) {
      if (!oyentes.has(evento)) oyentes.set(evento, new Set());
      oyentes.get(evento)!.add(fn);
      return sala;
    },
    off(evento: string, fn: Oyente) { oyentes.get(evento)?.delete(fn); return sala; },
    once(evento: string, fn: Oyente) {
      const una: Oyente = (...args) => { sala.off(evento, una); fn(...args); };
      return sala.on(evento, una);
    },
    emitir(evento: string, ...args: unknown[]) { for (const fn of [...oyentes.get(evento) ?? []]) fn(...args); },
    localParticipant: {
      identity: "persona-test", name: "Prueba", sid: "local", isSpeaking: false,
      isMicrophoneEnabled: false, isCameraEnabled: false,
      audioTrackPublications: new Map(), videoTrackPublications: new Map(), trackPublications: new Map(),
      connectionQuality: "excellent", permissions: { canPublish: true, canSubscribe: true }, metadata: "{}",
      getTrackPublication: vi.fn(), setMicrophoneEnabled: vi.fn(async () => {}),
      setCameraEnabled: vi.fn(async () => {}), publishData: vi.fn(),
    },
    remoteParticipants: new Map(), startAudio: vi.fn(async () => {}), canPlaybackAudio: true,
  };
  return sala;
}
const colarSala = (sala: ReturnType<typeof salaFalsa>) => {
  vi.mocked(Room).mockImplementationOnce(function () { return sala as unknown as Room; });
};
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(Room).mockReset().mockImplementation(function () { return salaFalsa() as unknown as Room; });
  olvidarLlamadasActivas();
  localStorage.clear(); sessionStorage.clear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("recuperación de llamadas sin conexiones huérfanas", () => {
  it("un token tardío no abre una sala después de desmontar la llamada", async () => {
    const token = pendiente<typeof TOKEN>();
    const proveedor = vi.fn(() => token.promesa);
    const { result, unmount } = renderHook(() => useLiveKit());
    let entrando!: Promise<void>;
    act(() => { entrando = result.current.connect("dm_prueba", "Prueba", false, { ...OPCIONES, tokenProvider: proveedor }); });
    unmount();
    await act(async () => { token.resolver(TOKEN); await entrando; });
    expect(Room).not.toHaveBeenCalled();
  });

  it("salir durante una caída cancela el temporizador y la espera de internet", async () => {
    const sala = salaFalsa(); colarSala(sala);
    const proveedor = vi.fn(async () => TOKEN);
    const { result, unmount } = renderHook(() => useLiveKit());
    await act(async () => { await result.current.connect(sala.name, "Prueba", false, { ...OPCIONES, tokenProvider: proveedor }); });
    act(() => { sala.emitir(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE); });
    unmount();
    act(() => { window.dispatchEvent(new Event("online")); });
    await avanzar(10_000);
    expect(proveedor).toHaveBeenCalledTimes(1);
    expect(Room).toHaveBeenCalledTimes(1);
  });

  it.each(["sin internet", "reconectando", "salir"])("la prueba de velocidad se cancela al %s", async (cambio) => {
    const sala = salaFalsa("cowork_abcd1234_1"); colarSala(sala);
    const abortar = vi.fn<() => void>();
    const fetchFn = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (String(url).includes("bytes=0")) return new Response(null, { status: 204 });
      return new Promise<Response>((_, rechazar) => {
        init!.signal!.addEventListener("abort", () => {
          abortar();
          rechazar(new DOMException("Cancelada", "AbortError"));
        }, { once: true });
      });
    });
    const { result, unmount } = renderHook(() => useLiveKit());
    await act(async () => { await result.current.connect(sala.name, "Prueba", false, { ...OPCIONES, tokenProvider: async () => TOKEN }); });
    await avanzar(15_000);
    expect(fetchFn).toHaveBeenCalledTimes(3); // calentamiento, ping y bajada en curso
    act(() => {
      if (cambio === "sin internet") window.dispatchEvent(new Event("offline"));
      else if (cambio === "reconectando") sala.emitir(RoomEvent.ConnectionStateChanged, ConnectionState.Reconnecting);
      else unmount();
    });
    await avanzar(0);
    expect(abortar).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(3); // no empieza a subir 1 MB después de cancelar
  });

  it("los eventos tardíos de una sala anterior no cambian la llamada actual", async () => {
    const vieja = salaFalsa(); const nueva = salaFalsa("dm_nueva"); colarSala(vieja); colarSala(nueva);
    const { result } = renderHook(() => useLiveKit());
    const opciones = { ...OPCIONES, tokenProvider: async () => TOKEN };
    await act(async () => { await result.current.connect(vieja.name, "Prueba", false, opciones); });
    await act(async () => { await result.current.connect(nueva.name, "Prueba", false, opciones); });
    act(() => { vieja.emitir(RoomEvent.Reconnecting); });
    expect(result.current.isReconnecting).toBe(false);
    act(() => { nueva.emitir(RoomEvent.Reconnecting); vieja.emitir(RoomEvent.Reconnected); });
    expect(result.current.isReconnecting).toBe(true);
  });

  it("una caída repetida conserva un solo reintento, sin acelerar el contador", async () => {
    const primera = salaFalsa(); const segunda = salaFalsa(); colarSala(primera); colarSala(segunda);
    const proveedor = vi.fn(async () => TOKEN);
    const { result } = renderHook(() => useLiveKit());
    await act(async () => { await result.current.connect(primera.name, "Prueba", false, { ...OPCIONES, tokenProvider: proveedor }); });
    act(() => {
      primera.emitir(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
      primera.emitir(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE);
    });
    await avanzar(2000);
    expect(proveedor).toHaveBeenCalledTimes(2);
    await avanzar(10_000);
    expect(proveedor).toHaveBeenCalledTimes(2);
    expect(segunda.connect).toHaveBeenCalledTimes(1);
  });

  it("un fallo tardío de una reentrada no reconecta la nueva llamada", async () => {
    const vieja = salaFalsa(); const nueva = salaFalsa("dm_nueva"); colarSala(vieja); colarSala(nueva);
    const tokenViejo = pendiente<typeof TOKEN>();
    const proveedorViejo = vi.fn().mockResolvedValueOnce(TOKEN).mockImplementationOnce(() => tokenViejo.promesa);
    const proveedorNuevo = vi.fn(async () => TOKEN);
    const { result } = renderHook(() => useLiveKit());
    await act(async () => { await result.current.connect(vieja.name, "Prueba", false, { ...OPCIONES, tokenProvider: proveedorViejo }); });
    act(() => { vieja.emitir(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE); });
    await avanzar(2000);
    act(() => { result.current.disconnect(); });
    await act(async () => { await result.current.connect(nueva.name, "Prueba", false, { ...OPCIONES, tokenProvider: proveedorNuevo }); });
    await act(async () => { tokenViejo.rechazar(new Error("red anterior caída")); });
    await avanzar(10_000);
    expect(proveedorNuevo).toHaveBeenCalledTimes(1);
    expect(result.current.getRoom()).toBe(nueva);
  });
});
