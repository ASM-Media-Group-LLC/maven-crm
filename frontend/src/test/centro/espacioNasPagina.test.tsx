import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { mesCorto, nombreConPadre, puntosDeHistoria } from "@/lib/espacioNas";

// GUARD de la página completa del NAS (Alvaro, 10/11/2026): cómo se fue llenando,
// qué entró esta semana, qué ocupa cada modelo y qué se puede liberar. Cada
// sección carga sola: si una falla lo dice (con Reintentar) sin tumbar las demás.

describe("la lógica de la página", () => {
  it("los meses del eje se leen cortos", () => {
    expect(mesCorto("2025-01", "es")).toBe("ene 25");
    expect(mesCorto("2026-11", "en")).toBe("Nov 26");
  });

  it("la gráfica va en TB acumulados", () => {
    const p = puntosDeHistoria({ meses: [{ mes: "2026-10", bytes: 277e9, total: 33.13e12 }] }, "es");
    expect(p[0].tb).toBeCloseTo(33.13);
    expect(p[0].entro).toBeCloseTo(0.277);
  });

  it("una carpeta genérica lleva la de arriba para saber de quién es", () => {
    expect(nombreConPadre("SCRIPT", "YOISNIA")).toBe("YOISNIA › SCRIPT");
    expect(nombreConPadre("MORAMAY", "CONTENIDO MASSIVE")).toBe("MORAMAY");
    expect(nombreConPadre("BELIAL", null)).toBe("BELIAL");
  });
});

// La gráfica (recharts) mide su caja con ResizeObserver, que jsdom no trae.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useEsDueno", () => ({ useEsDueno: () => ({ esDueno: true }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

import { EspacioNasPaginaVista, type EstadoDe } from "@/pages/oficina/EspacioNasPage";
import type { EntroSemana, HistoriaNas, PorModelo, QueLiberar } from "@/lib/espacioNas";

const listo = <T,>(data: T): EstadoDe<T> => ({ data, isLoading: false, isError: false, refetch: () => undefined });
const fallo = <T,>(): EstadoDe<T> => ({ data: undefined, isLoading: false, isError: true, refetch: () => undefined });

const HISTORIA: HistoriaNas = { meses: [{ mes: "2026-10", bytes: 277e9, total: 33.13e12 }], muestras: [] };
const SEMANA: EntroSemana = {
  total: { bytes: 20e9, archivos: 1433 },
  por_dia: [{ dia: "2026-11-05", bytes: 10e9, archivos: 251 }],
  por_modelo: [{ nombre: "SCRIPT", padre: "YOISNIA", carpeta_id: "c1", bytes: 3.1e9, archivos: 124, pidio: "Maria Villegas" }],
  por_persona: [{ nombre: null, bytes: 1e9, archivos: 3 }],
};
const MODELOS: PorModelo = { usado: 33.17e12, cuantas: 168, atribuido: 5.81e12, modelos: [{ nombre: "MartinaSmith", bytes: 678e9, archivos: 5377, carpetas: 8 }] };
const LIBERAR: QueLiberar = {
  copias: { bytes: 6.8e12, grupos: 73727, copias_de_mas: 89658 },
  papelera: { bytes: 12.2e9, archivos: 213 },
  top: [{ nombre: "c6602.mp4", size: 47.8e9, copias: 2, recupera: 47.8e9, unidades: ["Contenido Shootings"] }],
};

const dibujar = (o: Partial<Parameters<typeof EspacioNasPaginaVista>[0]>) => render(
  <MemoryRouter>
    <EspacioNasPaginaVista resumen={null}
      historia={o.historia ?? listo(HISTORIA)} entro={o.entro ?? listo(SEMANA)}
      modelos={o.modelos ?? listo(MODELOS)} liberar={o.liberar ?? listo(LIBERAR)} />
  </MemoryRouter>,
);

describe("la página", () => {
  it("con datos: las copias, la papelera, la modelo y quién pidió lo del link", () => {
    dibujar({});
    // «Liberar»: el total recuperable (copias + papelera) y cada tarjeta.
    expect(screen.getAllByText("6,8 TB").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("12,2 GB")).toBeInTheDocument();
    expect(screen.getByText("MartinaSmith")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YOISNIA › SCRIPT" })).toHaveAttribute("href", "/oficina/drive?carpeta=c1");
    expect(screen.getByText(/dashboard.centro.nas.pagina.pidio/)).toHaveTextContent("Maria Villegas");
    expect(screen.getByText("dashboard.centro.nas.pagina.sinDueno")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("⚠️ si UNA sección falla, solo esa lo dice (con Reintentar) y las demás se ven", () => {
    dibujar({ liberar: fallo<QueLiberar>() });
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /dashboard.centro.nas.reintentar/ })).toBeInTheDocument();
    expect(screen.getByText("MartinaSmith")).toBeInTheDocument();
  });
});
