import { afterEach, describe, expect, it, vi } from "vitest";

// 17/11/2026: el detector del fondo baja ~9,4 MB la primera vez y el tope para
// ponerlo era de 6 s: en la app de computador (caché nueva) el desenfoque fallaba
// siempre. Mientras no está bajado, el tope es largo; después, el de siempre.
const hook = Object.values(import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const lobby = Object.values(import.meta.glob("../../pages/messenger/videocall/PreJoinLobby.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("el fondo la primera vez", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it("sin bajar, el tope para poner el fondo es largo; ya bajado, vuelve al de siempre", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const m = await import("@/lib/fondoFino/procesador");
    expect(m.fondoPrecalentado()).toBe(false);
    expect(m.topeParaPonerFondo(6000)).toBe(m.TOPE_PRIMERA_CARGA_MS);
    expect(await m.precalentarFondo()).toBe(true);
    expect(m.fondoPrecalentado()).toBe(true);
    expect(m.topeParaPonerFondo(6000)).toBe(6000);
  });

  it("si la bajada falla no queda «listo» y se puede reintentar", async () => {
    const fetchMal = vi.fn(async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) }));
    vi.stubGlobal("fetch", fetchMal);
    const m = await import("@/lib/fondoFino/procesador");
    expect(await m.precalentarFondo()).toBe(false);
    expect(m.fondoPrecalentado()).toBe(false);
    await m.precalentarFondo();
    expect(fetchMal.mock.calls.length).toBeGreaterThan(3);
  });

  it("la llamada usa el tope de la primera vez; la sala de espera no lo alarga pero deja bajando el detector", () => {
    expect(hook).toContain("topeParaPonerFondo(BACKGROUND_ATTACH_TIMEOUT_MS)");
    expect(lobby).toContain("void precalentarFondo();");
    expect(lobby).toContain("PREJOIN_BG_ATTACH_TIMEOUT_MS, \"prejoin-bg-attach\"");
  });
});
