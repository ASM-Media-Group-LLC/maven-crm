import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARD del área del NAS (Alvaro, 10/11/2026): en el Centro el NAS va CERRADO
// (una línea con «Entrar al NAS»); adentro, el explorador por carpetas con su
// peso, por tipo de archivo, los más pesados y la ficha (con el aviso de que no
// hay copia de seguridad). Un fallo siempre se dice como fallo.

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

import { EspacioNasLineaVista } from "@/components/centro/EspacioNasLinea";
import { ExploradorNasVista } from "@/components/nas/ExploradorNas";
import { MasPesadosNasVista, PorTipoNasVista } from "@/components/nas/QueHayNas";
import { FichaNasVista } from "@/components/nas/FichaNas";
import type { EstadoDe } from "@/components/nas/comun";
import type { ExplorarNas, FichaNas, MasPesadosNas, PorTipoNas, ResumenNas } from "@/lib/espacioNas";

const listo = <T,>(data: T): EstadoDe<T> => ({ data, isLoading: false, isError: false, refetch: () => undefined });
const fallo = <T,>(): EstadoDe<T> => ({ data: undefined, isLoading: false, isError: true, refetch: () => undefined });
const enRouter = (n: ReactNode) => render(<MemoryRouter>{n}</MemoryRouter>);

const RESUMEN = { total: 48e12, libre: 13.94e12, usado: 34.06e12 } as ResumenNas;

describe("la línea del Centro (cerrada)", () => {
  it("muestra lo justo y el botón para entrar al área del NAS", () => {
    enRouter(<EspacioNasLineaVista resumen={RESUMEN} cargando={false} fallo={false} onReintentar={() => {}} />);
    expect(screen.getByText(/dashboard.centro.nas.linea/)).toHaveTextContent("34,1 TB");
    expect(screen.getByRole("link", { name: /dashboard.centro.nas.entrar/ })).toHaveAttribute("href", "/oficina/espacio-nas");
  });

  it("⚠️ si la lectura falla lo dice (y deja reintentar), pero el botón de entrar sigue", () => {
    const reintentar = vi.fn();
    enRouter(<EspacioNasLineaVista resumen={undefined} cargando={false} fallo onReintentar={reintentar} />);
    fireEvent.click(screen.getByRole("button", { name: /dashboard.centro.nas.fallo/ }));
    expect(reintentar).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /dashboard.centro.nas.entrar/ })).toBeInTheDocument();
  });
});

const NIVEL: ExplorarNas = {
  carpeta: { id: "u1", nombre: "Unidades de Google (archivo)" },
  ruta: [{ id: "u1", nombre: "Unidades de Google (archivo)" }],
  hijos: [
    { id: "c1", nombre: "Contenido Shootings", bytes: 5.79e12, archivos: 21826, carpetas: 500, ultimo: null },
    { id: "c2", nombre: "KASH", bytes: 2.68e12, archivos: 143954, carpetas: 900, ultimo: null },
  ],
  sueltos: [{ id: "a1", nombre: "c6602.mp4", size: 47.8e9, mime: "video/mp4", creado: "2024-01-01" }],
  sueltos_total: { bytes: 47.8e9, archivos: 1 },
  total: { bytes: 8.52e12, archivos: 165781 },
};

describe("el explorador", () => {
  it("muestra la ruta, las carpetas con su peso y lleva adentro al tocar una", () => {
    const abrir = vi.fn();
    enRouter(<ExploradorNasVista q={listo(NIVEL)} onAbrir={abrir} />);
    expect(screen.getByText("Contenido Shootings")).toBeInTheDocument();
    expect(screen.getByText(/5,8 TB · 68 %/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("KASH"));
    expect(abrir).toHaveBeenCalledWith("c2");
    fireEvent.click(screen.getByRole("button", { name: /dashboard.centro.nas.explorador.raiz/ }));
    expect(abrir).toHaveBeenCalledWith(null);
    expect(screen.getByText("c6602.mp4")).toBeInTheDocument();
  });

  it("⚠️ si falla lo dice con Reintentar", () => {
    enRouter(<ExploradorNasVista q={fallo<ExplorarNas>()} onAbrir={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("dashboard.centro.nas.fallo");
  });
});

describe("qué hay y la ficha", () => {
  it("por tipo: el video arriba con su porcentaje", () => {
    const d: PorTipoNas = { tipos: [
      { tipo: "video", bytes: 28.68e12, archivos: 159981, extensiones: [{ ext: "mp4", bytes: 19.49e12, archivos: 101111 }] },
      { tipo: "foto", bytes: 3.58e12, archivos: 719464, extensiones: [] },
    ] };
    enRouter(<PorTipoNasVista q={listo(d)} />);
    expect(screen.getByText(/28,7 TB · 89 %/)).toBeInTheDocument();
    expect(screen.getByText(/\.mp4 19,5 TB/)).toBeInTheDocument();
  });

  it("los más pesados llevan a su carpeta en el Drive", () => {
    const d: MasPesadosNas = { archivos: [{ id: "x", nombre: "C0999.MP4", size: 72.08e9, carpeta_id: "k1", carpeta: "ALEJANDRA", unidad: "Contenido Shootings", dueno: null, creado: "2023-08-27T00:13:32Z", tipo: "video" }] };
    enRouter(<MasPesadosNasVista q={listo(d)} />);
    expect(screen.getByText("72,1 GB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Contenido Shootings › ALEJANDRA" })).toHaveAttribute("href", "/oficina/drive?carpeta=k1");
  });

  it("⚠️ la ficha avisa SIEMPRE que no hay copia de seguridad", () => {
    const f: FichaNas = { archivos: 942381, carpetas: 42637, unidades: 68, personas: 15, links_modelos: 33, desde: "2010-01-17T15:00:12Z",
      nas: { caido: false, desde: null, actualizado: "2026-11-10T18:42:00Z" } };
    enRouter(<FichaNasVista q={listo(f)} resumen={undefined} />);
    expect(screen.getByText("dashboard.centro.nas.ficha.respaldoTitulo")).toBeInTheDocument();
    expect(screen.getByText("942.381")).toBeInTheDocument();
    expect(screen.getByText(/dashboard.centro.nas.ficha.arriba/)).toBeInTheDocument();
  });
});
