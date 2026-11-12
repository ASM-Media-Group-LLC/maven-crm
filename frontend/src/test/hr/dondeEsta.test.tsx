import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARDA de «Equipo hoy» (antes «Dónde está cada uno»; Alvaro, 10/11 y 11/11/2026:
// «necesito saber dónde está el empleado en todo momento», «me pierdo»). La lógica
// de cada fila (orden, app de la pantalla, color) sigue igual; el tablero ahora va
// por departamento y dice quién va mal y por qué. Un fallo se dice como fallo (no
// como «todos bien»).

let respuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const vacio = { data: [], error: null };
const cadena = () => {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "is", "in", "eq", "order", "limit", "gte", "lt"]) c[k] = () => c;
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve(vacio).then(ok);
  return c;
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string) => (f === "donde_esta_cada_uno" ? respuesta : vacio)),
    from: vi.fn(() => cadena()),
  },
}));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import { EquipoHoyPanel } from "@/components/argos/EquipoHoy";
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

  it("los colores siguen agrupando igual", () => {
    expect(tonoDe("fuera_de_cowork")).toBe("rojo");
    expect(tonoDe("sin_pantalla")).toBe("naranja");
    // Otra llamada de Maven no es «fuera de Cowork» (Alvaro, 11/11).
    expect(tonoDe("en_llamada")).toBe("neutro");
  });
});

describe("Equipo hoy", () => {
  it("cada departamento dice quién va mal y por qué (no solo un número)", async () => {
    respuesta = { error: null, data: [
      fila("Ana", "activo", { pantalla_at: new Date().toISOString(), pantalla_que: "Infloww · Respondiendo fans" }),
      fila("Karem", "fuera_de_cowork", { fuera_hoy_veces: 2, fuera_hoy_min: 14 }),
      fila("Luis", "fuera_de_turno", { en_turno: false }),
    ] };
    render(<EquipoHoyPanel />, { wrapper: envolver });
    expect(await screen.findByText("Chatters")).toBeInTheDocument();
    // La línea del departamento nombra a quien va mal con su porqué.
    expect(screen.getByText(/Karem \(argos\.motivo\.fueraCowork/)).toBeInTheDocument();
    expect(screen.getByText("argos.equipo.regla")).toBeInTheDocument();
  });

  it("⚠️ si no carga lo DICE y ofrece reintentar", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    render(<EquipoHoyPanel />, { wrapper: envolver });
    const alerta = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alerta).toHaveTextContent("argos.equipo.fallo");
    expect(screen.queryByText("argos.equipo.nadieEnTurno")).not.toBeInTheDocument();
  });
});
