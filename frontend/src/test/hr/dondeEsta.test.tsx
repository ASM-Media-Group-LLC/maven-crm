import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARDA de «Dónde está cada uno» (Alvaro, 10/11/2026: «necesito saber dónde
// está el empleado en todo momento»). Lo urgente va arriba (fuera de Cowork en
// su turno, no ha entrado), cada fila dice qué tenía en pantalla y cuántas veces
// se salió hoy, y un fallo se dice como fallo (no como «todos bien»).

let respuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => respuesta) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import { DondeEstaPanel, pasaFiltro } from "@/components/hr/DondeEstaPanel";
import { type FilaDondeEsta, ordenarFilas, separarPantalla, tonoDe } from "@/hooks/useDondeEsta";

const fila = (nombre: string, estado: string, extra: Partial<FilaDondeEsta> = {}): FilaDondeEsta => ({
  user_id: `u-${nombre}`, nombre, puesto: "Chatter", equipo: "Chatters", entrada: "08:00:00", salida: "16:00:00", en_turno: true,
  estado, estado_desde: new Date(Date.now() - 12 * 60_000).toISOString(), ultimo_latido: null,
  pantalla_at: null, pantalla_que: null, pantalla_fuera_de_lugar: null, captura_at: null,
  fuera_hoy_veces: 0, fuera_hoy_min: 0, exento: false, ...extra,
});

const envolver = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </MemoryRouter>
);

describe("la lógica", () => {
  it("lo urgente arriba: fuera de Cowork, no ha entrado, sin pantalla… y fuera de turno al final", () => {
    const orden = ordenarFilas([fila("Ana", "activo"), fila("Beto", "fuera_de_turno"), fila("Caro", "sin_pantalla"), fila("Dani", "fuera_de_cowork"), fila("Eva", "no_ha_entrado")]);
    expect(orden.map((f) => f.nombre)).toEqual(["Dani", "Eva", "Caro", "Ana", "Beto"]);
  });

  it("la app y lo que hace salen del veredicto de la IA", () => {
    expect(separarPantalla("Infloww · Redactando un mensaje masivo")).toEqual({ app: "Infloww", que: "Redactando un mensaje masivo" });
    expect(separarPantalla("Uso del chat interno de Maven")).toEqual({ app: null, que: "Uso del chat interno de Maven" });
    expect(separarPantalla(null)).toEqual({ app: null, que: null });
  });

  it("los filtros agrupan por color", () => {
    expect(tonoDe("fuera_de_cowork")).toBe("rojo");
    expect(tonoDe("sin_pantalla")).toBe("naranja");
    expect(pasaFiltro({ estado: "pausa" }, "enCowork")).toBe(true);
    expect(pasaFiltro({ estado: "fuera_de_turno" }, "gris")).toBe(true);
    expect(pasaFiltro({ estado: "activo" }, "rojo")).toBe(false);
  });
});

describe("el tablero", () => {
  it("muestra primero a quien se salió, con cuántas veces hoy, y qué tenía en pantalla", async () => {
    respuesta = { error: null, data: [
      fila("Ana", "activo", { pantalla_at: new Date().toISOString(), pantalla_que: "Infloww · Respondiendo fans" }),
      fila("Karem", "fuera_de_cowork", { fuera_hoy_veces: 2, fuera_hoy_min: 14 }),
    ] };
    render(<DondeEstaPanel />, { wrapper: envolver });
    const filas = await screen.findAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Karem");
    expect(within(filas[0]).getByText("hr.donde.estado.fueraDeCowork")).toBeInTheDocument();
    expect(within(filas[0]).getByText(/hr.donde.fueraHoy.*"n":2.*"m":14/)).toBeInTheDocument();
    expect(within(filas[1]).getByText("Infloww")).toBeInTheDocument();
    expect(within(filas[0]).getByRole("link")).toHaveAttribute("href", "/hr/expediente/u-Karem");
  });

  it("⚠️ si no carga lo DICE y ofrece reintentar", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    render(<DondeEstaPanel />, { wrapper: envolver });
    const alerta = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alerta).toHaveTextContent("hr.donde.fallo");
    expect(screen.queryByText("hr.donde.vacio")).not.toBeInTheDocument();
  });
});
