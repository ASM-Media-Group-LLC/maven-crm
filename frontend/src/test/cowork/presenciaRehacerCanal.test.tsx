import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// EL BUG (07/09/2026): el tablero del supervisor recibía la presencia de todos
// por el socket y no mostraba a nadie. El cliente de Realtime borra canales
// POR NOMBRE y solo tras el acuse del `leave`, y `channel()` devuelve el canal
// existente si el nombre coincide. Cerrar y abrir seguidos, sin esperar, hacía
// que el "nuevo" fuera el viejo saliendo, y que el acuse lo sacara del ruteo.
// Este cliente falso imita exactamente esas dos reglas.

type CanalFalso = {
  topic: string; state: string; oyentes: Record<string, Array<() => void>>; presencias: Record<string, unknown[]>;
  on: (tipo: string, f: { event: string }, cb: () => void) => CanalFalso;
  subscribe: (cb?: (estado: string) => void) => CanalFalso;
  track: () => Promise<string>;
  presenceState: () => Record<string, unknown[]>;
};

const canales: CanalFalso[] = [];
let ACUSE_MS = 50;

function nuevoCanal(topic: string): CanalFalso {
  const c: CanalFalso = {
    topic, state: "closed", oyentes: {}, presencias: {},
    on(_t, f, cb) { (c.oyentes[f.event] ??= []).push(cb); return c; },
    subscribe(cb) { c.state = "joining"; setTimeout(() => { if (c.state === "joining") { c.state = "joined"; cb?.("SUBSCRIBED"); } }, 5); return c; },
    track: vi.fn(async () => "ok"),
    presenceState: () => c.presencias,
  };
  return c;
}

const supabaseFalso = {
  channel(topic: string) {
    const existente = canales.find((c) => c.topic === topic);   // dedupe por nombre, como realtime-js
    if (existente) return existente;
    const c = nuevoCanal(topic); canales.push(c); return c;
  },
  removeChannel(c: CanalFalso) {
    c.state = "leaving";
    return new Promise<string>((resolve) => setTimeout(() => {
      // _remove por TOPIC, tras el acuse: se lleva a cualquiera con ese nombre.
      for (let i = canales.length - 1; i >= 0; i--) if (canales[i].topic === c.topic) canales.splice(i, 1);
      c.state = "closed";
      resolve("ok");
    }, ACUSE_MS));
  },
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseFalso }));

const { useCoworkMediaPresence, salirDePresencia } = await import("@/hooks/useCoworkMediaPresence");

/** Simula que el servidor manda la presencia de OTRA persona a un canal. */
function llegaPresencia(c: CanalFalso, uid: string, estado: Record<string, unknown>) {
  c.presencias[uid] = [{ user_id: uid, ...estado }];
  (c.oyentes["sync"] ?? []).forEach((cb) => cb());
}

beforeEach(() => { vi.useFakeTimers(); salirDePresencia(); canales.length = 0; ACUSE_MS = 50; });
afterEach(() => { vi.useRealTimers(); });

describe("rehacer el canal de presencia sin matar al nuevo", () => {
  it("cuando el canal se cae, el vigilante lo rehace y el NUEVO sí recibe presencia", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "supervisor"));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const viejo = canales[0];
    expect(viejo.state).toBe("joined");

    // Se cae (como con un corte por límite de presencia).
    viejo.state = "errored";
    // Tic del vigilante (4 s) + acuse del leave (50 ms) + join del nuevo (5 ms).
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000 + 200); });

    expect(canales).toHaveLength(1);
    const nuevo = canales[0];
    expect(nuevo).not.toBe(viejo);          // ANTES: channel() devolvía el viejo saliendo
    expect(nuevo.state).toBe("joined");

    await act(async () => { llegaPresencia(nuevo, "chatter-1", { camOn: true, screenShareOn: true, relojEstado: "activo", relojSegundosHoy: 90, relojEn: 1 }); });
    expect(result.current.mediaStates["chatter-1"]).toMatchObject({ camOn: true, relojEstado: "activo" });
  });

  it("cambiar de sesión espera a que el canal viejo termine de salir antes de abrir el nuevo", async () => {
    const { result, rerender } = renderHook(({ sid }: { sid: string }) => useCoworkMediaPresence(sid, "supervisor"), { initialProps: { sid: "s1" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(canales.map((c) => c.topic)).toEqual(["cowork-media-s1"]);

    rerender({ sid: "s2" });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(canales.map((c) => c.topic)).toEqual(["cowork-media-s2"]);
    expect(canales[0].state).toBe("joined");

    await act(async () => { llegaPresencia(canales[0], "chatter-2", { camOn: false, screenShareOn: false }); });
    expect(Object.keys(result.current.mediaStates)).toEqual(["chatter-2"]);
  });

  it("el participante que publica reaparece solo en el canal nuevo, sin que nadie toque nada", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "chatter", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    act(() => result.current.trackMediaState({ micOn: true, camOn: true, screenShareOn: true }));
    const viejo = canales[0];
    expect(viejo.track).toHaveBeenCalledTimes(1);

    viejo.state = "errored";
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000 + 200); });
    const nuevo = canales[0];
    expect(nuevo).not.toBe(viejo);
    expect(nuevo.track).toHaveBeenCalled();      // el SUBSCRIBED del nuevo reanunció lo último
    expect((nuevo.track as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ camOn: true, screenShareOn: true });
  });
});
