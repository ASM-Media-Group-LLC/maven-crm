import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// GUARDA del tablero «¿Las llamadas mejoran?» (Alvaro, 18/11/2026): solo el
// dueño, día por día y persona por persona, peor primero; un fallo se dice como
// fallo (con Reintentar), nunca como «todo bien» ni «nadie en llamada».

type Resp = { data: unknown; error: { message: string } | null };
let porDia: Resp = { data: [], error: null };
let porPersona: Resp = { data: [], error: null };
const rpc = vi.fn(async (nombre: string) => (nombre === "llamadas_calidad_por_dia" ? porDia : porPersona));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (n: string) => rpc(n) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import { TableroCalidadLlamadas } from "@/components/hr/TableroCalidadLlamadas";
import { type DiaDeCalidad, normalizarDia, normalizarPersona, ordenarPeorPrimero, tendencia } from "@/hooks/useCalidadLlamadas";

const dia = (d: string, extra: Partial<DiaDeCalidad> = {}): DiaDeCalidad => ({
  dia: d, minutos: 600, personas: 10, cortes: 5, horas_llamada: 10, minutos_con_audio: 0,
  pct_con_problema: 10, pct_mala_conexion: 3, cortes_por_100h: 50, pct_congelado: 12, pct_cam_limitada: 20,
  pct_audio_malo: null, rtt_mediana_ms: 110, ...extra,
});

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe("la lógica", () => {
  it("normaliza los numeric que PostgREST manda como texto y respeta el null", () => {
    const d = normalizarDia({ dia: "2026-11-18", minutos: "120", pct_mala_conexion: "5.9", pct_audio_malo: null, rtt_mediana_ms: 114 });
    expect(d.minutos).toBe(120);
    expect(d.pct_mala_conexion).toBe(5.9);
    expect(d.pct_audio_malo).toBeNull();
    const p = normalizarPersona({ user_id: "u", causa_audio: "inventada", pct_con_problema: "40" });
    expect(p.causa_audio).toBeNull();
    expect(p.pct_con_problema).toBe(40);
  });

  it("peor primero: más % con problema, después más cortes por 100 h", () => {
    const base = normalizarPersona({ user_id: "x" });
    const orden = ordenarPeorPrimero([
      { ...base, nombre: "Bien", pct_con_problema: 2, cortes_por_100h: 90 },
      { ...base, nombre: "Mal", pct_con_problema: 30, cortes_por_100h: 0 },
      { ...base, nombre: "Medio", pct_con_problema: 2, cortes_por_100h: 200 },
    ]);
    expect(orden.map((p) => p.nombre)).toEqual(["Mal", "Medio", "Bien"]);
  });

  it("tendencia: el último día con llamadas contra la semana anterior; menos es mejor", () => {
    const dias = [dia("2026-11-15"), dia("2026-11-16"), dia("2026-11-17"), dia("2026-11-18", { pct_congelado: 6 }), dia("2026-11-19", { minutos: 0, pct_congelado: null })];
    expect(tendencia(dias, "pct_congelado")).toEqual({ hoy: 6, antes: 12, cambio: "mejor" });
    expect(tendencia(dias, "cortes_por_100h").cambio).toBe("igual");
    expect(tendencia([...dias.slice(0, 3), dia("2026-11-18", { pct_mala_conexion: 9 })], "pct_mala_conexion").cambio).toBe("peor");
    // El audio sin medir no inventa un «0 %».
    expect(tendencia(dias, "pct_audio_malo")).toEqual({ hoy: null, antes: null, cambio: null });
  });
});

describe("la pantalla", () => {
  beforeEach(() => { rpc.mockClear(); porDia = { data: [], error: null }; porPersona = { data: [], error: null }; });

  it("con datos: los cuadritos, la gráfica y la persona peor primero con la causa del audio", async () => {
    porDia = { data: [dia("2026-11-17"), dia("2026-11-18", { pct_con_problema: 4 })], error: null };
    porPersona = { data: [
      { user_id: "b", nombre: "Beto", minutos: 30, pct_con_problema: 1 },
      { user_id: "a", nombre: "Ana", minutos: 60, pct_con_problema: 35, pct_audio_malo: 20, causa_audio: "mic_mudo" },
    ], error: null };
    render(<TableroCalidadLlamadas />, { wrapper: envolver });
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    const nombres = screen.getAllByText(/^(Ana|Beto)$/).map((e) => e.textContent);
    expect(nombres).toEqual(["Ana", "Beto"]);
    expect(screen.getByText("hr.calidad.audio.mic_mudo")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getByText(/hr\.calidad\.cambio\.mejor/)).toBeInTheDocument();
    // 7 días pide la otra ventana.
    fireEvent.click(screen.getByText("hr.calidad.semana"));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
  });

  it("si falla, lo dice y ofrece reintentar (nunca «todo bien»)", async () => {
    porDia = { data: null, error: { message: "llamadas_calidad_por_dia: solo el dueño ve el tablero de llamadas" } };
    porPersona = { data: null, error: { message: "boom" } };
    render(<TableroCalidadLlamadas />, { wrapper: envolver });
    expect(await screen.findByText("hr.calidad.falloDias", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("hr.calidad.falloPersonas", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText("hr.calidad.vacio")).toBeNull();
    const pedidas = () => rpc.mock.calls.filter(([n]) => n === "llamadas_calidad_por_dia").length;
    const antes = pedidas();
    fireEvent.click(screen.getAllByText("hr.llamadas.reintentar")[0]);
    await waitFor(() => expect(pedidas()).toBeGreaterThan(antes));
  });

  it("null sin error también es un fallo, no «nadie en llamada»", async () => {
    porDia = { data: [dia("2026-11-18")], error: null };
    porPersona = { data: null, error: null };
    render(<TableroCalidadLlamadas />, { wrapper: envolver });
    expect(await screen.findByText("hr.calidad.falloPersonas", undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("la puerta y el SQL", () => {
  const fuentes = import.meta.glob(["/frontend/src/pages/hr/HRMonitorIA.tsx", "/supabase/migrations/20261119010000_calidad_de_llamadas.sql"], {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;
  const pagina = fuentes["/frontend/src/pages/hr/HRMonitorIA.tsx"];
  const sql = fuentes["/supabase/migrations/20261119010000_calidad_de_llamadas.sql"];

  it("el tablero solo se dibuja para el dueño, en la pestaña Llamadas", () => {
    expect(pagina).toContain("useEsDueno()");
    expect(pagina).toContain("{esDueno === true && <TableroCalidadLlamadas />}");
  });

  it("las dos funciones revisan que sea el dueño y lanzan error (42501) si no", () => {
    expect(sql.match(/if not coalesce\(public\.ve_tablero_llamadas\(\), false\) then\s+raise exception/g)?.length).toBe(2);
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain("public.es_dueno((select auth.uid()))");
    expect(sql).toContain("p.nivel = 'dueno'");
  });

  it("el vigía avisa por la misma regla que los cortes, sin canal nuevo, y el cron va protegido", () => {
    expect(sql).toContain("from public.destinatarios_de_aviso(r.user_id) d");
    expect(sql).toContain("insert into public.notifications");
    expect(sql).toContain("continue when public.es_admin_o_dueno(r.user_id)");
    expect(sql).toContain("interval '2 hours'");
    expect(sql).toMatch(/extname = 'pg_cron'/);
    expect(sql).toContain("revoke all on function public.vigilar_audio_de_llamada() from public, anon, authenticated");
  });
});
