// El tablero del manager en INGLÉS: KPIs, "por qué esa nota", las barras de
// notas, sus creadoras con Promolog y el detalle de ingresos por modelo.
//
// Se monta la pantalla real; lo que se reemplaza es lo que trae datos y el
// selector del título (SelectorDeTablero, de otra pantalla).
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import type { NotaDelBot } from "@/pages/manager/useManagerDashboard";
import { enEspanol, prepararJsdom } from "./visibles";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOY = iso(new Date());

let notas: NotaDelBot[] = [];
let creadoras: Array<{ id: string; nombre: string; profile_photo_url: string | null }> = [];
let objetivo: { metrica: string; meta_diaria: number } | null = null;
const PROMO = [
  { creator_id: "c1", name: "Sofia", instagram_handle: null, manager_name: null, target_networks: [], window_days: 7,
    covered_days: 5, coverage_pct: 70, promo_days: 4, freq_pts: 0, quality_pts: 0, consistency_pts: 0, score: 82, is_partial: true },
];
const INGRESOS = [
  { creator_id: "c1", blu_creator_name: null, artistic_name: "Sofia Model", total: 1250, subs: 400, days_with_data: 1 },
  { creator_id: "c2", blu_creator_name: null, artistic_name: null, total: 300, subs: 100, days_with_data: 3 },
];

vi.mock("@/pages/manager/useManagerDashboard", () => ({
  useMisNotasDelBot: () => ({ notas, cargando: false }),
  useMiObjetivo: () => objetivo,
  useMisCreadoras: () => ({ creadoras, cargando: false }),
}));
vi.mock("@/pages/promolog/usePromoPeriodScores", () => ({ usePromoScoresRango: () => ({ data: PROMO, isLoading: false }) }));
vi.mock("@/pages/sales-performance/useDashboard2Summary", () => ({ useDashboard2Summary: () => ({ data: INGRESOS, isLoading: false }) }));
vi.mock("@/hooks/useMisHoras", async () => {
  const real = await vi.importActual<typeof import("@/hooks/useMisHoras")>("@/hooks/useMisHoras");
  return { ...real, useMisHoras: () => ({ dias: [{ date: HOY, horas: 6.5, actividad: 48 }], cargando: false }) };
});
vi.mock("@/hooks/useMiTiempoCowork", async () => {
  const real = await vi.importActual<typeof import("@/hooks/useMiTiempoCowork")>("@/hooks/useMiTiempoCowork");
  return { ...real, useMiTiempoCowork: () => ({ dias: [], cargando: false }) };
});
vi.mock("@/pages/dashboard/SelectorDeTablero", () => ({ default: () => null }));
vi.mock("@/components/dashboard/DashboardContent", () => ({ default: () => null }));

import ManagerDashboard from "@/pages/manager/ManagerDashboard";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>
          <ManagerDashboard forzado />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(prepararJsdom);

describe("Tablero del manager en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    notas = [{ fecha: HOY, nota: 7.4, componentes: { objetivo: "promo", franjas: 0, franjas_max: 3, hub_h: 6.5, hub_act: 48, promos_roster: 2 } }];
    creadoras = [
      { id: "c1", nombre: "Sofia Model", profile_photo_url: null },
      { id: "c2", nombre: "Ana Star", profile_photo_url: null },
    ];
    objetivo = { metrica: "promo", meta_diaria: 4 };
  });

  it("con nota, creadoras y ingresos: nada en español", async () => {
    montar();
    expect(await screen.findByText("Your score (bot)")).toBeTruthy();
    expect(screen.getByText(/2 active creators/)).toBeTruthy();
    expect(screen.getByText(/your goal: getting your roster to promote/)).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByText("Yesterday")).toBeTruthy();
    expect(screen.getByText("0 of 3")).toBeTruthy();
    expect(screen.getByText("No reports in the time slots: that's up to 1.5 points of your score.")).toBeTruthy();
    expect(screen.getByText("4 of 5 days read with a promo · partial coverage")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("el detalle de ingresos por modelo", async () => {
    montar();
    fireEvent.click(await screen.findByText("see what each one brought in"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Revenue by model")).toBeTruthy();
    expect(within(dialogo).getByText("$400 in subscriptions · 1 day with data")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("sin notas, sin creadoras y con un objetivo que no está en el catálogo", async () => {
    notas = [];
    creadoras = [];
    objetivo = { metrica: "otra_cosa", meta_diaria: 1 };
    montar();
    expect(await screen.findByText("no score in the range")).toBeTruthy();
    expect(screen.getByText("You don't have any creators assigned.")).toBeTruthy();
    expect(screen.getByText(/your goal: otra_cosa/)).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});
