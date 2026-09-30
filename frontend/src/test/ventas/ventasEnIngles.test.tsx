// Dashboard Ventas, Oportunidades y las pestañas de reclutamiento y gasto del
// Panel de control en INGLÉS: nada visible en español.
//
// Las tarjetas de Ventas reciben todo por props: se montan tal cual. Oportunidades
// y las dos pestañas del Panel leen de Supabase: se reemplaza solo el cliente.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { configure, render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { PeriodComparisonResult, CreatorComparison } from "@/pages/sales-overview/usePeriodComparison";
import { enEspanol, prepararJsdom } from "./visibles";

// Pantallas enteras con diálogos: con la suite corriendo en paralelo (o la
// máquina cargada) el segundo de findBy y los 5 s por test no alcanzan y el
// test falla sin que haya nada roto. Mismo arreglo que admin/adminEnIngles.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

// ── Supabase: cada tabla devuelve lo suyo ────────────────────────────────
const OPORTUNIDADES = [
  { id: "o1", creator_handle: "@karen.katc", product: "agency", stage: "negotiating", assigned_to: "u1", last_touch_at: "2026-09-01T12:00:00Z",
    next_followup_at: "2020-01-01T12:00:00Z", notes: "Wants a call", lost_reason: null, source: "bot", created_at: "2026-09-01T12:00:00Z", monthly_value_usd: 24000 },
  { id: "o2", creator_handle: "@ana", product: "other", stage: "lost", assigned_to: null, last_touch_at: "2026-09-01T12:00:00Z",
    next_followup_at: null, notes: null, lost_reason: "No OF", source: "manual", created_at: "2026-09-01T12:00:00Z", monthly_value_usd: null },
];
const CONFIRMADAS = [
  { id: "cc1", instagram_handle: null, monthly_monetization: 24000, estimated_monetization: null, assigned_to: "u1", confirmed_date: "2026-09-02" },
];
const PERFILES = [{ id: "u1", full_name: "Laura Gomez" }];
let oportunidades: unknown[] = OPORTUNIDADES;

function cadena(data: unknown) {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => void) => ok({ data, error: null, count: 0 });
      return () => p;
    },
    apply: () => p,
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => cadena(
      tabla === "monetization_opportunities" ? oportunidades
      : tabla === "closer_creators" ? CONFIRMADAS
      : tabla === "profiles" ? PERFILES
      : tabla === "api_provider_caps" ? [{ provider: "anthropic", cost_usd_cap_monthly: 10, amber_pct: 50, red_pct: 90 }]
      : [],
    ),
    rpc: (fn: string) => cadena(fn === "api_usage_summary"
      ? { totals: [{ provider: "anthropic", calls: 1200, cost_usd: 9.5 }], daily: [], recent: [
        { provider: "anthropic", occurred_at: "2026-09-20T15:00:00Z", cost_usd: 0.01, operation: "agent", model: "haiku" }] }
      : null),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/hooks/useChattersRecruitment", () => ({
  useChattersRecruitment: () => ({ data: { total: 10, claimed: 8, ended: 6, evaluated: 5, apto: 3, noApto: 2 }, isLoading: false }),
  useChattersRecruitmentDetails: () => ({ data: [], isLoading: false }),
}));

import SalesKPICards from "@/pages/sales-overview/SalesKPICards";
import SalesOperationalCards from "@/pages/sales-overview/SalesOperationalCards";
import CardDetailModal from "@/pages/sales-overview/CardDetailModal";
import CohortRetentionTab from "@/pages/sales-performance/CohortRetentionTab";
import LtvTab from "@/pages/sales-performance/LtvTab";
import OpportunitiesPage from "@/pages/opportunities/OpportunitiesPage";
import ChattersRecruitmentTab from "@/pages/panel-de-control/ChattersRecruitmentTab";
import ControlGastoTab from "@/pages/panel-de-control/ControlGastoTab";

function montar(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        {/* Las tarjetas de KPIs usan Tooltip; en la app el proveedor lo pone Dashboard2. */}
        <TooltipProvider>{ui}</TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const creadora = (n: string, cambio: number): CreatorComparison =>
  ({ creatorKey: n, artisticName: n, currentEarnings: 1200, previousEarnings: 1000, changePercent: cambio }) as CreatorComparison;
const COMPARACION = {
  totalCurrent: 12500, totalPrevious: 10000, totalChangePercent: 25, creators: [creadora("Sofia", 20), creadora("Ana", -30)],
  activeCreators: 2, rising: [creadora("Sofia", 20)], atRisk: [creadora("Ana", -30)], falling: [creadora("Ana", -30)],
  highPotential: [], top10: [creadora("Sofia", 20)],
} as unknown as PeriodComparisonResult;

beforeAll(prepararJsdom);

describe("Dashboard Ventas en inglés", () => {
  beforeEach(() => localStorage.setItem("app-language", "en"));

  it("las tarjetas de KPIs y las operacionales", async () => {
    montar(<>
      <SalesKPICards data={COMPARACION} onCardClick={() => {}} />
      <SalesOperationalCards data={COMPARACION} onCardClick={() => {}} sparklineData={[{ value: 1 }, { value: 2 }]} />
    </>);
    expect(await screen.findByText("Total revenue")).toBeTruthy();
    expect(screen.getAllByText("+25.0% vs previous").length).toBe(2);
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.getByText("last 2 months")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("el detalle de una tarjeta, con y sin datos", async () => {
    const { unmount } = montar(<CardDetailModal open onOpenChange={() => {}} cardType="at_risk" creators={COMPARACION.creators} />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Creators at risk")).toBeTruthy();
    expect(within(dialogo).getByText("Change")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    unmount();
    montar(<CardDetailModal open onOpenChange={() => {}} cardType="desconocida" creators={[]} />);
    expect(await screen.findByText("No data for this period.")).toBeTruthy();
    expect(screen.getByText("Detail")).toBeTruthy();
  });

  it("cohortes y LTV (con datos y vacíos)", async () => {
    montar(<>
      <CohortRetentionTab rows={[{ cohort_date: "2026-09-03", cohort_size: 40, cells: [100, 96, 91] }]} maxOffset={2} loading={false} />
      <LtvTab loading={false} data={{ avgLifespanMonths: 3.2, aggArpuMonthly: 45, aggLtv: 144, totalActiveFans: 900,
        perCreator: [{ creator_id: "c1", name: "Sofia", activeFans: 900, arpuMonthly: 45, ltv: 144, gross: 40000 }] }} />
      <CohortRetentionTab rows={[]} maxOffset={0} loading={false} />
      <LtvTab loading={false} data={null} />
    </>);
    expect((await screen.findAllByText("Fan retention cohorts")).length).toBe(2);
    expect(screen.getAllByText("Sep 3").length).toBeGreaterThan(0);
    expect(screen.getByText("D2 retention")).toBeTruthy();
    expect(screen.getByText("No cohorts in the selected range.")).toBeTruthy();
    expect(screen.getByText("No revenue/fan data in the range.")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});

describe("Oportunidades en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    oportunidades = OPORTUNIDADES;
  });

  it("la lista, el resumen y las confirmadas de reclutamiento", async () => {
    montar(<OpportunitiesPage />);
    expect(await screen.findByText("Agency (OF)")).toBeTruthy();
    expect(screen.getByText("Negotiating")).toBeTruthy();
    expect(screen.getByText("(no handle)")).toBeTruthy();
    expect(screen.getAllByText("$24k/mo").length).toBeGreaterThan(0);
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("el alta y la edición", async () => {
    montar(<OpportunitiesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New opportunity/ }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Creator's @handle *")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    fireEvent.click((await screen.findByText("@karen.katc")).closest("tr")!);
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Edit opportunity")).toBeTruthy();
    expect(within(dialogo).getByText("Who's working it")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("sin oportunidades en la vista", async () => {
    oportunidades = [];
    montar(<OpportunitiesPage />);
    expect(await screen.findByText("No opportunities in this view.")).toBeTruthy();
    expect(screen.getByText("Create one with “New opportunity”.")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});

describe("Panel de control en inglés: reclutamiento y gasto", () => {
  beforeEach(() => localStorage.setItem("app-language", "en"));

  it("reclutamiento de chatters", async () => {
    montar(<ChattersRecruitmentTab range={{ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) } as never} />);
    expect(await screen.findByText("Total evaluation sessions")).toBeTruthy();
    expect(screen.getByText("8 claimed (80%)")).toBeTruthy();
    expect(screen.getByText("3 passed out of 5 evaluated")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("control de gasto", async () => {
    montar(<ControlGastoTab />);
    expect(await screen.findByText("Close to the monthly cap")).toBeTruthy();
    expect(screen.getByText("95.0% of cap")).toBeTruthy();
    expect(screen.getByText("Last 50 calls")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});
