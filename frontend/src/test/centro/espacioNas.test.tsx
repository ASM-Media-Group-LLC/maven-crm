import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { cuantoFalta, partesDeLoUsado, pctUsado, tamanoNas, tonoDelNas } from "@/lib/espacioNas";

// GUARD del medidor del NAS (Alvaro, 10/11/2026): "¿cuánto tengo, cuánto me
// falta para que se llene y qué es lo que ocupa?". Los números los da la RPC
// nas_espacio_resumen; acá se prueba que se lean bien y que un fallo se diga
// como fallo (no como "no hay datos").

describe("los números del medidor", () => {
  it("el porcentaje y el color siguen las marcas del aviso (80 %) y el urgente (90 %)", () => {
    expect(Math.round(pctUsado({ usado: 34.06e12, total: 48e12 }))).toBe(71);
    expect(tonoDelNas(71)).toBe("ok");
    expect(tonoDelNas(80)).toBe("atento");
    expect(tonoDelNas(92)).toBe("urgente");
  });

  it("los tamaños se leen en TB/GB con el separador del idioma", () => {
    expect(tamanoNas(34.06e12, "es")).toBe("34,1 TB");
    expect(tamanoNas(34.06e12, "en")).toBe("34.1 TB");
    expect(tamanoNas(59.9e9, "es")).toBe("59,9 GB");
  });

  it("cuánto falta se dice en la unidad que se entiende de un vistazo", () => {
    expect(cuantoFalta(192.7)).toEqual({ n: 3.7, unidad: "anios" });
    expect(cuantoFalta(30)).toEqual({ n: 7, unidad: "meses" });
    expect(cuantoFalta(4.2)).toEqual({ n: 4, unidad: "semanas" });
    expect(cuantoFalta(null)).toBeNull(); // no crece
    expect(cuantoFalta(-3)).toBeNull();
  });

  it("qué ocupa más: cada unidad como parte de lo usado", () => {
    const p = partesDeLoUsado({ usado: 10e12, que_ocupa: [{ unidad: "KASH", bytes: 6e12, archivos: 5 }, { unidad: null, bytes: 1e12, archivos: 2 }] });
    expect(p.map((x) => Math.round(x.pct))).toEqual([60, 10]);
  });
});

// ── El bloque ────────────────────────────────────────────────────────────────

let respuesta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async () => respuesta) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useEsDueno", () => ({ useEsDueno: () => ({ esDueno: true }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  }),
}));

import EspacioNasBloque from "@/components/centro/EspacioNasBloque";

const envolver = ({ children }: { children: ReactNode }) => (
  // El bloque lleva «Ver detalle» (un Link): necesita el enrutador.
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </MemoryRouter>
);

describe("el bloque del Centro", () => {
  beforeEach(() => { respuesta = { data: null, error: null }; });

  it("⚠️ si la lectura falla lo DICE y ofrece reintentar (un fallo no es vacío)", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    render(<EspacioNasBloque />, { wrapper: envolver });
    // El bloque reintenta UNA vez (conexión floja) antes de dar el fallo.
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("dashboard.centro.nas.fallo");
    expect(screen.getByRole("button", { name: /dashboard.centro.nas.reintentar/ })).toBeInTheDocument();
  });

  it("con datos muestra lo usado, cuánto falta y qué ocupa más", async () => {
    respuesta = {
      error: null,
      data: {
        medido_at: new Date().toISOString(), total: 48e12, libre: 13.94e12, usado: 34.06e12, util_restante: 11.54e12,
        discos: [{ total: 24e12, libre: 6.71e12 }, { total: 24e12, libre: 7.23e12 }],
        ritmo_semana: 141e9, ritmo_fuente: "anual", semanas_para_llenarse: 82.1, fecha_llena: "2028-06-07",
        que_ocupa: [{ unidad: "KASH-CONTENT-VPS", bytes: 6.63e12, archivos: 127955 }, { unidad: null, bytes: 1.44e12, archivos: 80924 }],
        alertas: [],
      },
    };
    render(<EspacioNasBloque />, { wrapper: envolver });
    expect(await screen.findByText("34,1 TB")).toBeInTheDocument();
    expect(screen.getByText("71 %")).toBeInTheDocument();
    expect(screen.getByText(/dashboard.centro.nas.falta.meses/)).toHaveTextContent("19"); // 82 semanas al ritmo del último año
    expect(screen.getByText("KASH-CONTENT-VPS")).toBeInTheDocument();
    expect(screen.getByText("dashboard.centro.nas.miUnidad")).toBeInTheDocument();
    // En el Centro, el bloque lleva a la página completa.
    expect(screen.getByRole("link", { name: /dashboard.centro.nas.verDetalle/ })).toHaveAttribute("href", "/oficina/espacio-nas");
  });
});
