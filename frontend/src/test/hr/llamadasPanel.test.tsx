import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARDA de Argos › Llamadas (Alvaro, 13/11/2026): a quién se le corta la
// llamada hoy y por qué. Los que más cortes tienen arriba, lo grave aparte, la
// velocidad MEDIDA (no la estimación de WebRTC, que va rotulada como estimación
// o no va), si la cancelación de ruido le corre, y un fallo se dice como fallo
// —nunca como «nadie tuvo cortes»—.

let respuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const rpc = vi.fn(async () => respuesta);
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import { LlamadasPanel } from "@/components/hr/LlamadasPanel";
import {
  type FilaLlamadas, cortesPorHora, estimacionConSentido, horasAVer, normalizarFila, ordenarLlamadas, tonoNC, tonoSubida,
} from "@/hooks/useLlamadasHoy";

const horas = (pares: Record<number, number>) => Array.from({ length: 24 }, (_, h) => pares[h] ?? 0);
const fila = (nombre: string, extra: Partial<FilaLlamadas> = {}): FilaLlamadas => ({
  user_id: `u-${nombre}`, nombre, equipo: "Chatters", cortes: 1, graves: 0, ultimo_corte: "2026-11-13T15:00:00Z",
  horas: horas({ 10: 1 }), causa: "sin_causa_clara", causa_texto: "sin causa clara todavía", causa_estimada: "sin_causa_clara",
  consejo: null, subida_estimada_kbps: null, rtt_ms: null, perdida_pct: null, nav: "Chrome 157 · Windows", nucleos: 8,
  prueba_subida_mbps: null, prueba_bajada_mbps: null, prueba_ms: null, prueba_subida_tope: false, prueba_at: null,
  nc: "activa", nc_at: null, ...extra,
});

const envolver = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </MemoryRouter>
);

describe("la lógica", () => {
  it("más cortes arriba; a igual cantidad, más graves; después el más reciente", () => {
    const orden = ordenarLlamadas([
      fila("Ana", { cortes: 2, graves: 0 }),
      fila("Beto", { cortes: 8, graves: 1 }),
      fila("Caro", { cortes: 2, graves: 1 }),
      fila("Dani", { cortes: 2, graves: 1, ultimo_corte: "2026-11-13T20:00:00Z" }),
    ]);
    expect(orden.map((f) => f.nombre)).toEqual(["Beto", "Dani", "Caro", "Ana"]);
  });

  it("la tirita suma los cortes de todo el equipo por hora", () => {
    const total = cortesPorHora([fila("A", { horas: horas({ 9: 2, 14: 1 }) }), fila("B", { horas: horas({ 9: 1 }) })]);
    expect(total[9]).toBe(3);
    expect(total[14]).toBe(1);
    expect(total.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("la tirita va de la jornada (o el primer corte) a la hora actual, sin madrugadas vacías", () => {
    expect(horasAVer(horas({ 9: 1 }), 15)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(horasAVer(horas({ 5: 1 }), 8)).toEqual([5, 6, 7, 8]);
  });

  it("⚠️ la estimación absurda de WebRTC (1.000.000 kbps) no se muestra", () => {
    expect(estimacionConSentido(1_000_000)).toBeNull();
    expect(estimacionConSentido(1132)).toBe(1132);
    expect(estimacionConSentido(null)).toBeNull();
  });

  it("subida medida floja por debajo de 1,5 Mbps; cancelación de ruido mal si no está activa", () => {
    expect(tonoSubida(1.2)).toBe("flojo");
    expect(tonoSubida(1.5)).toBe("bien");
    expect(tonoSubida(null)).toBe("sin_dato");
    expect(tonoNC("activa")).toBe("bien");
    expect(tonoNC("fallo")).toBe("flojo");
    expect(tonoNC(null)).toBe("sin_dato");
  });

  it("los numeric que llegan como texto quedan como número", () => {
    const f = normalizarFila({ user_id: "x", cortes: "3", graves: "1", perdida_pct: "0.5", prueba_subida_mbps: "1.25", horas: [0, "2"] });
    expect(f.cortes).toBe(3);
    expect(f.perdida_pct).toBe(0.5);
    expect(f.prueba_subida_mbps).toBe(1.25);
    expect(f.horas).toHaveLength(24);
    expect(f.horas[1]).toBe(2);
  });
});

describe("el panel", () => {
  it("pide argos_llamadas_hoy y muestra primero a quien más se le corta, con su internet medido", async () => {
    respuesta = { error: null, data: [
      fila("Ana", { cortes: 2 }),
      fila("Karem", {
        cortes: 8, graves: 1, causa: "internet_subida", prueba_subida_mbps: 0.9, prueba_bajada_mbps: 22.4, prueba_ms: 80,
        prueba_at: "2026-11-13T15:30:00Z", subida_estimada_kbps: 1_000_000, rtt_ms: 115, perdida_pct: 0.1, nc: "fallo",
      }),
    ] };
    render(<LlamadasPanel />, { wrapper: envolver });
    const lista = await screen.findByRole("list", { name: "hr.llamadas.titulo" });
    const filas = within(lista).getAllByRole("listitem");
    expect(rpc).toHaveBeenCalledWith("argos_llamadas_hoy");
    expect(filas[0]).toHaveTextContent("Karem");
    expect(within(filas[0]).getByText("hr.llamadas.causa.internet_subida")).toBeInTheDocument();
    expect(within(filas[0]).getByText("hr.llamadas.consejo.internet_subida")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/hr\.llamadas\.subida .*"n":"0\.9"/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/hr\.llamadas\.bajada .*"n":"22"/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/hr\.llamadas\.rtt .*115/)).toBeInTheDocument();
    expect(within(filas[0]).getByText(/hr\.llamadas\.perdida .*0\.1/)).toBeInTheDocument();
    expect(within(filas[0]).getByText("Chrome 157 · Windows")).toBeInTheDocument();
    expect(within(filas[0]).getByText("hr.llamadas.nc.fallo")).toBeInTheDocument();
    // La estimación de 1.000.000 kbps NO aparece como si fuera su internet.
    expect(within(filas[0]).queryByText(/hr\.llamadas\.estimada/)).toBeNull();
    expect(within(filas[0]).getByRole("link")).toHaveAttribute("href", "/hr/expediente/u-Karem");
    // Sin prueba de velocidad todavía: lo dice, no inventa un número.
    expect(within(filas[1]).getByText("hr.llamadas.sinPrueba")).toBeInTheDocument();
    // Los tiles del día: 10 cortes, 1 grave, 2 personas, 1 sin cancelación de ruido.
    expect(screen.getByText("hr.llamadas.tile.cortes").previousSibling).toHaveTextContent("10");
    expect(screen.getByText("hr.llamadas.tile.graves").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("hr.llamadas.tile.sinNc").previousSibling).toHaveTextContent("1");
  });

  it("la estimación con sentido va rotulada como estimación, no como velocidad", async () => {
    respuesta = { error: null, data: [fila("Lina", { subida_estimada_kbps: 1132 })] };
    render(<LlamadasPanel />, { wrapper: envolver });
    expect(await screen.findByText(/hr\.llamadas\.estimada .*1132/)).toBeInTheDocument();
  });

  it("si hoy nadie tuvo cortes, lo dice", async () => {
    respuesta = { error: null, data: [] };
    render(<LlamadasPanel />, { wrapper: envolver });
    expect(await screen.findByText("hr.llamadas.vacio")).toBeInTheDocument();
  });

  it("⚠️ si no carga (o no hay permiso) lo DICE y ofrece reintentar — nunca «nadie tuvo cortes»", async () => {
    respuesta = { data: null, error: { message: "argos_llamadas_hoy: sin permiso" } };
    render(<LlamadasPanel />, { wrapper: envolver });
    const alerta = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alerta).toHaveTextContent("hr.llamadas.fallo");
    expect(within(alerta).getByRole("button", { name: /hr\.llamadas\.reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText("hr.llamadas.vacio")).toBeNull();
  });

  it("⚠️ una respuesta null sin error también es fallo, no lista vacía", async () => {
    respuesta = { data: null, error: null };
    render(<LlamadasPanel />, { wrapper: envolver });
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("hr.llamadas.fallo");
  });
});

describe("la pestaña en Argos", () => {
  const fuentes = import.meta.glob(["/frontend/src/pages/hr/HRMonitorIA.tsx", "/supabase/migrations/20261114020000_argos_llamadas_hoy.sql"], {
    query: "?raw", import: "default", eager: true,
  }) as Record<string, string>;
  const pagina = fuentes["/frontend/src/pages/hr/HRMonitorIA.tsx"];
  const sql = fuentes["/supabase/migrations/20261114020000_argos_llamadas_hoy.sql"];

  it("existe la pestaña «llamadas» (?t=llamadas) y dibuja el panel", () => {
    expect(pagina).toContain('"llamadas"');
    expect(pagina).toContain('t("hr.monia.tab.llamadas")');
    expect(pagina).toMatch(/tab === "llamadas" && \(/);
    expect(pagina).toContain("<LlamadasPanel />");
  });

  it("la función usa las mismas reglas que el resto de Argos y no escribe nada", () => {
    expect(sql).toContain("public.ve_argos()");
    expect(sql).toContain("public.argos_vigilables()");
    expect(sql).toContain("(select auth.uid())");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/errcode = '42501'/);
    const sinComentarios = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
    expect(sinComentarios).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from)\b/i);
    expect(sinComentarios).toMatch(/grant execute on function public\.argos_llamadas_hoy\(\) to authenticated/);
  });
});
