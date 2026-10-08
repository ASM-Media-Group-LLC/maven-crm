// ¿La hora del computador está bien? Ver lib/relojDelEquipo.ts y
// components/AvisoRelojDesfasado.tsx (07/10/2026: un reloj atrasado 2 h y
// media dejó a una persona sin Maven toda la mañana).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { desfaseDesdeRespuesta, duracionLegible, medirDesfase, relojMal, UMBRAL_MS } from "@/lib/relojDelEquipo";
import { LanguageProvider } from "@/hooks/useLanguage";

let usuario: { id: string } | null = { id: "u1" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: usuario }) }));

import AvisoRelojDesfasado, { debeMostrarAvisoReloj, sistemaDelEquipo } from "@/components/AvisoRelojDesfasado";

const HORA = 2.5 * 3600_000;
const AHORA = Date.parse("2026-10-07T15:00:00Z");

describe("la medición", () => {
  it("positivo = el equipo va atrasado; negativo = adelantado", () => {
    // El servidor dice 15:00; el equipo, 12:30 (2 h y media atrás).
    const atrasado = desfaseDesdeRespuesta(new Date(AHORA).toUTCString(), AHORA - HORA, AHORA - HORA);
    expect(Math.round((atrasado ?? 0) / 60_000)).toBe(150);
    const adelantado = desfaseDesdeRespuesta(new Date(AHORA).toUTCString(), AHORA + 10 * 60_000, AHORA + 10 * 60_000);
    expect(Math.round((adelantado ?? 0) / 60_000)).toBe(-10);
  });

  it("toma el medio del viaje y el medio segundo que el header corta", () => {
    const d = desfaseDesdeRespuesta(new Date(AHORA).toUTCString(), AHORA - 1000, AHORA + 1000);
    expect(d).toBe(500);
  });

  it("sin header o con uno raro: no se sabe", () => {
    expect(desfaseDesdeRespuesta(null, AHORA, AHORA)).toBeNull();
    expect(desfaseDesdeRespuesta("ayer", AHORA, AHORA)).toBeNull();
  });

  it("le pregunta la hora a NUESTRO servidor (Supabase no deja leer su Date)", async () => {
    const f = vi.fn(async () => new Response(null, { headers: { date: new Date(Date.now() + HORA).toUTCString() } }));
    const d = await medirDesfase(f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/", { method: "HEAD", cache: "no-store" });
    expect(Math.round((d ?? 0) / 60_000)).toBe(150);
  });

  it("sin red o con una respuesta de más de 10 s, no se mide", async () => {
    expect(await medirDesfase((async () => { throw new Error("sin red"); }) as unknown as typeof fetch)).toBeNull();
    const ahora = vi.spyOn(Date, "now");
    ahora.mockReturnValueOnce(AHORA).mockReturnValueOnce(AHORA + 11_000);
    const lento = async () => new Response(null, { headers: { date: new Date(AHORA).toUTCString() } });
    expect(await medirDesfase(lento as unknown as typeof fetch)).toBeNull();
    ahora.mockRestore();
  });

  it("desde 5 minutos, para un lado o para el otro", () => {
    expect(relojMal(null)).toBe(false);
    expect(relojMal(UMBRAL_MS - 1)).toBe(false);
    expect(relojMal(UMBRAL_MS)).toBe(true);
    expect(relojMal(-UMBRAL_MS - 1)).toBe(true);
  });

  it("se dice en horas y minutos", () => {
    expect(duracionLegible(HORA)).toBe("2 h 30 min");
    expect(duracionLegible(-45 * 60_000)).toBe("45 min");
    expect(duracionLegible(3 * 3600_000)).toBe("3 h");
  });
});

describe("cuándo se muestra", () => {
  it("con el reloj mal; al cerrarlo se calla una hora", () => {
    expect(debeMostrarAvisoReloj(HORA, null, AHORA)).toBe(true);
    expect(debeMostrarAvisoReloj(60_000, null, AHORA)).toBe(false);
    expect(debeMostrarAvisoReloj(null, null, AHORA)).toBe(false);
    expect(debeMostrarAvisoReloj(HORA, AHORA - 30 * 60_000, AHORA)).toBe(false);
    expect(debeMostrarAvisoReloj(HORA, AHORA - 61 * 60_000, AHORA)).toBe(true);
  });

  it("dónde se corrige, según el equipo", () => {
    expect(sistemaDelEquipo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0")).toBe("windows");
    expect(sistemaDelEquipo("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")).toBe("mac");
    expect(sistemaDelEquipo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("otro");
    expect(sistemaDelEquipo("Mozilla/5.0 (Linux; Android 10; K)")).toBe("otro");
  });
});

describe("el aviso", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    usuario = { id: "u1" };
  });

  function montar(desfase: number) {
    let actual = desfase;
    const f = vi.fn(async () => new Response(null, { headers: { date: new Date(Date.now() + actual).toUTCString() } }));
    vi.stubGlobal("fetch", f);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = render(<LanguageProvider><AvisoRelojDesfasado /></LanguageProvider>);
    return { ...r, f, corregir: () => { actual = 0; } };
  }

  it("con el reloj atrasado 2 h y media, avisa con la cantidad y cómo corregirlo", async () => {
    montar(HORA);
    await act(async () => { vi.advanceTimersByTime(3_100); });
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/2 h 30 min atrasada/);
  });

  it("con el reloj bien, nada", async () => {
    const { f } = montar(30_000);
    await act(async () => { vi.advanceTimersByTime(3_100); });
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sin sesión ni siquiera mide", async () => {
    usuario = null;
    const { f } = montar(HORA);
    await act(async () => { vi.advanceTimersByTime(3_100); });
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("«Ya la corregí» vuelve a medir y, si quedó bien, el aviso se va", async () => {
    const { corregir } = montar(HORA);
    await act(async () => { vi.advanceTimersByTime(3_100); });
    await screen.findByRole("alert");
    corregir();
    fireEvent.click(screen.getByRole("button", { name: /Ya la corregí|I fixed it/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("cerrarlo lo esconde", async () => {
    montar(-HORA);
    await act(async () => { vi.advanceTimersByTime(3_100); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/adelantada|ahead/);
    fireEvent.click(screen.getByRole("button", { name: /Cerrar aviso|Close notice/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
