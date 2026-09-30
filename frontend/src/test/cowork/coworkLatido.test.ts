import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "tok" } } }) } },
}));

import { iniciarLatido, actualizarLatido, detenerLatido, latidoActivo, leerReloj, suscribirReloj, INTERVALO_LATIDO_MS, RESPIRO_CAMBIO_MS } from "@/lib/coworkLatido";

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, estado: "activo", segundosHoy: 900 }) });

function cuerpos(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  detenerLatido();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("coworkLatido", () => {
  it("late al iniciar y después cada 30 s con el estado actual", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(cuerpos()).toHaveLength(1);
    expect(cuerpos()[0]).toMatchObject({ action: "latido", sessionId: "s1", camOn: true, screenShareOn: false });
    await vi.advanceTimersByTimeAsync(INTERVALO_LATIDO_MS * 2);
    expect(cuerpos()).toHaveLength(3);
  });

  it("un cambio que mueve el reloj late enseguida (con respiro), uno que no, espera", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true, faceState: "ok" });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ faceState: "too_small" }); // mal encuadre: no mueve el reloj
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(1);
    actualizarLatido({ screenShareOn: false }); // sí lo mueve
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(2);
    expect(cuerpos()[1]).toMatchObject({ screenShareOn: false, faceState: "too_small" });
  });

  it("una ráfaga de cambios se junta en un solo latido", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ camOn: false });
    actualizarLatido({ screenShareOn: false });
    actualizarLatido({ onBreak: true });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(2);
    expect(cuerpos()[1]).toMatchObject({ camOn: false, screenShareOn: false, onBreak: true });
  });

  it("iniciar dos veces la misma sesión no duplica relojes; otra sesión reemplaza", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true });
    iniciarLatido("s1", { camOn: false, screenShareOn: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(cuerpos()).toHaveLength(1);
    expect(latidoActivo()?.estado.camOn).toBe(true);
    iniciarLatido("s2", { camOn: true, screenShareOn: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(latidoActivo()?.sessionId).toBe("s2");
  });

  it("la respuesta del servidor alimenta el reloj y avisa a quien escucha", async () => {
    const visto: unknown[] = [];
    const baja = suscribirReloj((r) => visto.push(r));
    iniciarLatido("s1", { camOn: true, screenShareOn: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(leerReloj()).toMatchObject({ estado: "activo", segundosHoy: 900 });
    expect(visto).toHaveLength(1);
    detenerLatido();
    expect(leerReloj()).toBeNull();
    expect(visto[1]).toBeNull();
    baja();
  });

  it("detener apaga todo: no late más ni con cambios", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true });
    await vi.advanceTimersByTimeAsync(0);
    detenerLatido();
    actualizarLatido({ camOn: false });
    await vi.advanceTimersByTimeAsync(INTERVALO_LATIDO_MS * 2);
    expect(cuerpos()).toHaveLength(1);
    expect(latidoActivo()).toBeNull();
  });
});

// ── LA SALA SE CAYÓ ─────────────────────────────────────────────────────────
describe("coworkLatido — caídas de la sala", () => {
  it("⚠️ perder la sala y recuperarla late enseguida, no a los 30 s", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ camOn: false, screenShareOn: false, conexionSala: "desconectada" });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(2);
    // El nombre del campo en el cuerpo es el mismo que lee la edge (latidoDeCuerpo).
    expect(cuerpos()[1]).toMatchObject({ conexionSala: "desconectada", camOn: false });
    actualizarLatido({ camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(3);
    expect(cuerpos()[2]).toMatchObject({ conexionSala: "conectada" });
  });

  it("⚠️ la conexión SOLA ya apura el latido (aunque la cámara no cambie)", async () => {
    // Quien tenía la cámara apagada y se le cae la sala: camOn no se mueve, así
    // que si la conexión no contara, el cambio esperaría 30 s.
    iniciarLatido("s1", { camOn: false, screenShareOn: false, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ conexionSala: "desconectada" });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(2);
  });

  it("'reconectando' no apura nada: la cámara sigue diciendo la verdad", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ conexionSala: "reconectando" });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10);
    expect(cuerpos()).toHaveLength(1);
  });

  it("⚠️ la pestaña que otra reemplazó deja de latir (si no, se pisan el tramo)", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0);
    actualizarLatido({ conexionSala: "reemplazada" });
    await vi.advanceTimersByTimeAsync(INTERVALO_LATIDO_MS * 3);
    expect(cuerpos()).toHaveLength(1);
    // Y vuelve a latir apenas recupera la sala ("Usar aquí").
    actualizarLatido({ conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(INTERVALO_LATIDO_MS);
    expect(cuerpos().length).toBeGreaterThanOrEqual(2);
  });

  it("⚠️ un cambio que llega con otro latido en vuelo NO se pierde", async () => {
    // Antes `enviar` lo descartaba y el cambio esperaba al próximo latido (30 s).
    let soltar: () => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => {
      soltar = () => r({ ok: true, json: async () => ({ ok: true, estado: "activo", segundosHoy: 1 }) });
    }));
    iniciarLatido("s1", { camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0); // el primero queda colgado
    actualizarLatido({ conexionSala: "desconectada", camOn: false });
    await vi.advanceTimersByTimeAsync(RESPIRO_CAMBIO_MS + 10); // llega con el primero en vuelo
    expect(cuerpos()).toHaveLength(1);
    soltar();
    await vi.advanceTimersByTimeAsync(0);
    expect(cuerpos()).toHaveLength(2);
    expect(cuerpos()[1]).toMatchObject({ conexionSala: "desconectada" });
  });

  it("la respuesta 'sin_conexion' del servidor se guarda (antes se descartaba)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, estado: "sin_conexion", segundosHoy: 50 }) });
    iniciarLatido("s1", { camOn: false, screenShareOn: false, conexionSala: "desconectada" });
    await vi.advanceTimersByTimeAsync(0);
    expect(leerReloj()?.estado).toBe("sin_conexion");
  });
});

describe("coworkLatido — cada pestaña se identifica", () => {
  it("⚠️ el latido lleva el equipo, y es el mismo en todos los latidos de la pestaña", async () => {
    iniciarLatido("s1", { camOn: true, screenShareOn: true, conexionSala: "conectada" });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(INTERVALO_LATIDO_MS);
    const [a, b] = cuerpos();
    expect(typeof a.equipo).toBe("string");
    expect((a.equipo as string).length).toBeGreaterThan(0);
    expect(b.equipo).toBe(a.equipo);
    // El nombre del campo es el que lee la edge (equipoDeCuerpo).
    const edge = await import("../../../../supabase/functions/_shared/cowork-tiempo");
    expect(edge.equipoDeCuerpo(a)).toBe(a.equipo);
  });

  it("sobrevive al F5 de la misma pestaña (sessionStorage)", async () => {
    const { equipoDeEstaPestana } = await import("@/lib/coworkLatido");
    const id = equipoDeEstaPestana();
    expect(sessionStorage.getItem("cowork-equipo")).toBe(id);
  });
});
