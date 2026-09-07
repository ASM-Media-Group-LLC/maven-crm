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
