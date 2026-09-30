// Dashboard Ventas (/dashboard2) en INGLÉS: nada visible en español en ninguna
// pestaña (Resumen, Métricas, 80/20, Red Flags, Proyección y cada sub-pestaña de
// "Más análisis"), ni en la ficha de la creadora ni en la lista de los KPI.
//
// Se monta la pantalla REAL con el LanguageProvider de verdad; solo se reemplazan
// los hooks que leen la base. Los componentes hijos que son de OTRO módulo
// (las tarjetas de /sales-overview, VentasTops, las pestañas de cohortes y LTV) se
// cambian por un stub vacío: este test mira el texto de Dashboard2, no el de
// ellos (tienen su propio dueño en la ola 3). Lo mismo con las píldoras de rango
// (lib/range-presets, de otro PR).
//
// Además de `esEspanol`, cada texto se compara contra el lado `es` del
// diccionario: así se ve un t() que alguien devolvió a texto a mano aunque la
// frase no tenga acento ni una palabra de la lista del detector ("Ballenas").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, configure } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Pantallas enteras: con toda la suite corriendo en paralelo, los 5 s por test
// (y el segundo de findBy/waitFor) a veces no alcanzan sin que haya nada roto.
// «Más análisis» recorre seis sub-pestañas de un tablero enorme: con la máquina
// cargada, 30 s no alcanzaban (28/09) y con carga 50 tampoco 90 s (30/09).
// Un cuelgue de verdad falla igual.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 180_000 });

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const HOY = new Date().toISOString().slice(0, 10);

// Una creadora que crece, una que cae fuerte y una que dejó de vender: así se
// dibujan las tres familias de alertas y las de oportunidades.
const fila = (over: Record<string, unknown>) => ({
  group_key: "g", creator_id: "c", blu_creator_name: null, artistic_name: "Creator",
  total: 0, subs: 0, new_sub: 0, recurring_sub: 0, tips: 0, messages: 0,
  max_active_fans: 0, new_fans: 0, days_with_data: 10, last_date: HOY, af_sum: 0, af_days: 0,
  ...over,
});
const ACTUAL = [
  fila({ group_key: "c1", creator_id: "c1", artistic_name: "Alpha Star", total: 12000, subs: 3000, new_sub: 1000, recurring_sub: 2000, tips: 4000, messages: 5000, max_active_fans: 400, new_fans: 20, af_sum: 4000, af_days: 10 }),
  fila({ group_key: "c2", creator_id: "c2", artistic_name: "Beta Moon", total: 900, subs: 100, new_sub: 50, recurring_sub: 50, tips: 700, messages: 100, max_active_fans: 60, new_fans: -3, af_sum: 600, af_days: 10 }),
  fila({ group_key: "c3", creator_id: "c3", artistic_name: "Gamma Ray", total: 0, subs: 0, max_active_fans: 0, af_sum: 0, af_days: 0 }),
  fila({ group_key: "c4", creator_id: "c4", artistic_name: "Delta Sun", total: 2500, subs: 500, new_sub: 200, recurring_sub: 300, tips: 1500, messages: 500, max_active_fans: 30, new_fans: 5, af_sum: 300, af_days: 10 }),
];
const ANTERIOR = [
  fila({ group_key: "c1", creator_id: "c1", artistic_name: "Alpha Star", total: 8000 }),
  fila({ group_key: "c2", creator_id: "c2", artistic_name: "Beta Moon", total: 3000 }),
  fila({ group_key: "c3", creator_id: "c3", artistic_name: "Gamma Ray", total: 1500 }),
  fila({ group_key: "c4", creator_id: "c4", artistic_name: "Delta Sun", total: 2000 }),
];

const consulta = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });

let llamadasResumen = 0;
vi.mock("@/pages/sales-performance/useDashboard2Summary", () => ({
  // 1ª llamada = período elegido, 2ª = el anterior, 3ª = el mes en curso (proyección).
  useDashboard2Summary: () => {
    const n = llamadasResumen++ % 3;
    return consulta(n === 1 ? ANTERIOR : ACTUAL);
  },
}));
vi.mock("@/pages/sales-overview/useSalesTotals", () => ({ useSalesMonthlyTotals: () => consulta([]) }));
vi.mock("@/pages/sales-performance/useDashboard2Daily", () => ({
  useDashboard2Daily: () => consulta([
    { creator_id: "c1", date: HOY, total_gross: 500, artistic_name: "Alpha Star" },
    { creator_id: "c1", date: "2026-09-01", total_gross: 300, artistic_name: "Alpha Star" },
  ]),
}));
vi.mock("@/pages/sales-performance/useTopFans", () => ({
  useTopFans: () => consulta([{
    id: "f1", blu_model_id: 1, blu_name: "alpha", creator_id: "c1", artistic_name: "Alpha Star", fan_user_id: 9,
    rank: 1, fan_name: "Big Spender", fan_username: "bigspender", spent_gross: 3000, transactions: 12,
    messages_gross: 900, tips_gross: 400, is_active: true, subscribed_at: null, expires_at: HOY,
    subscription_length_days: 90, snapshot_from: "2026-09-01", snapshot_to: HOY,
  }]),
}));
vi.mock("@/pages/sales-performance/useFanRetention", () => ({
  useFanRetention: () => consulta([{
    id: "r1", blu_model_id: 1, blu_name: "alpha", creator_id: "c1", artistic_name: "Alpha Star",
    cohort_date: HOY, new_fans: 40, observed_days: 12, after_days: [100, 80, 70, 65, 60, 58, 55, 52, 50, 48, 46, 45],
  }]),
}));
vi.mock("@/pages/sales-performance/useChatters", () => ({
  useChatters: () => consulta([{
    id: "ch1", blu_employee_id: 7, name: "John Chatter", email: null, group_name: "Team A", is_chatter: true,
    total_sales: 4000, sold_messages: 10, direct_messages: 50, fans_chatted: 80, fans_spent_money: 20,
    fans_who_didnt_spend: 60, fan_conversion_rate: 25, avg_earnings_per_paying_fan: 40, unlock_rate: 10,
    avg_response_seconds: 90, scheduled_hours: 40, clocked_hours: 38, characters_sent: 1000, creators_count: 2,
    delta_total_sales: 300, snapshot_from: "2026-09-01", snapshot_to: HOY,
  }]),
}));
vi.mock("@/pages/sales-performance/usePromoDays", () => ({
  usePromoDays: () => consulta(new Map([["c1", new Set([HOY])]])),
}));
vi.mock("@/pages/sales-performance/useCohortRetention", () => ({
  useCohortRetention: () => consulta({ rows: [], maxOffset: 11 }),
}));

// Hijos de OTRO dueño (paginas-b): fuera del alcance de este test.
vi.mock("@/pages/sales-overview/SalesKPICards", () => ({ default: () => null }));
vi.mock("@/pages/sales-overview/SalesOperationalCards", () => ({ default: () => null }));
vi.mock("@/pages/sales-overview/CardDetailModal", () => ({ default: () => null }));
vi.mock("@/pages/sales-performance/VentasTops", () => ({ default: () => null }));
vi.mock("@/pages/sales-performance/CohortRetentionTab", () => ({ default: () => null }));
vi.mock("@/pages/sales-performance/LtvTab", () => ({ default: () => null }));
// Las píldoras de rango son de lib/range-presets (otro PR de la ola): se dejan
// las claves y se cambia solo el rótulo.
vi.mock("@/lib/range-presets", async (original) => {
  const real = await original<typeof import("@/lib/range-presets")>();
  return { ...real, PRESET_CONFIG: real.PRESET_CONFIG.map((p) => ({ ...p, label: `preset-${p.key}` })) };
});

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => true }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, role: "admin", isLoading: false }) }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ tier: "admin" }) }));
vi.mock("@/integrations/supabase/client", () => {
  const vacio = { select: () => Promise.resolve({ data: [], error: null }) };
  return { supabase: { from: () => vacio, storage: { from: () => ({}) } } };
});

import Dashboard2 from "@/pages/Dashboard2";

/** Todo el texto visible y los atributos que se leen, sin lo que es código. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

// El lado español del diccionario que NO es igual en inglés ("Subs", "Total"…).
const SOLO_ESPANOL = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((p) => p.es !== p.en && /[a-zA-Z]{2}/.test(p.es))
    .map((p) => p.es),
);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || SOLO_ESPANOL.has(t));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>
          {/* En la app lo pone App.tsx para todas las pantallas. */}
          <TooltipProvider>
            <Dashboard2 />
          </TooltipProvider>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const abrirPestana = (nombre: string | RegExp) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name: nombre }), { button: 0 });

describe("Dashboard Ventas en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    llamadasResumen = 0;
  });

  it("el resumen (encabezado, KPIs, monetización, concentración) no tiene nada en español", async () => {
    montar();
    await screen.findByText("Gross revenue");
    expect(screen.getByText("Monetization breakdown")).toBeTruthy();
    expect(screen.getByText("Growth velocity")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Métricas, 80/20 (lista y gráfico), Red Flags y Proyección, tampoco", async () => {
    montar();
    await screen.findByText("Gross revenue");

    abrirPestana(/Detailed metrics/);
    await screen.findByText("Retention & fans");
    expect(enEspanol()).toEqual([]);

    abrirPestana(/80\/20 analysis/);
    await screen.findByText("Top 20% (generate 80%)");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Bottom 80% (generate 20%)" }));
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(enEspanol()).toEqual([]);

    abrirPestana(/Red Flags/);
    await screen.findByText("Inactive ($0)");
    fireEvent.click(screen.getByText("Drop > 30%"));
    expect(await screen.findByText(/Dropped \d+%/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    abrirPestana(/Month projection/);
    expect(enEspanol()).toEqual([]);

    abrirPestana(/Creator Reports/);
    await screen.findByPlaceholderText("Search creator…");
    expect(enEspanol()).toEqual([]);
  });

  it("cada sub-pestaña de «Más análisis» está en inglés", async () => {
    montar();
    await screen.findByText("Gross revenue");
    abrirPestana(/More analysis/);
    await screen.findByText(/Month over month comparison/);
    expect(enEspanol()).toEqual([]);

    // Cada sub-pestaña con algo que la identifica: que el test mire la pestaña
    // abierta y no la anterior.
    const sub: Array<[string | RegExp, RegExp]> = [
      ["Whales", /Whales — Top spenders by creator/],
      ["Retention", /Fan retention by cohort/],
      ["Chatters", /Performance by chatter/],
      ["Content ROI", /does promoting move the needle/],
      ["Ranking", /Creator ranking/],
      ["Scalability", /Scalability insight/],
      ["Channels", /Diversification insight/],
      ["Opportunities", /High growth/],
      [/Alerts \(/, /active alerts:/],
    ];
    for (const [nombre, ancla] of sub) {
      fireEvent.click(screen.getByRole("button", { name: nombre }));
      expect(await screen.findByText(ancla)).toBeTruthy();
      await waitFor(() => expect(enEspanol()).toEqual([]));
    }
  });

  it("la ficha de la creadora y la lista de un KPI, también", async () => {
    montar();
    await screen.findByText("Gross revenue");
    fireEvent.click(screen.getByText("Gross revenue"));
    const lista = await screen.findByRole("dialog");
    expect(lista.textContent).toMatch(/Revenue by creator/);
    expect(enEspanol(lista)).toEqual([]);
    fireEvent.keyDown(lista, { key: "Escape" });

    abrirPestana(/Creator Reports/);
    fireEvent.click(await screen.findByText("Alpha Star"));
    const ficha = await screen.findByRole("dialog");
    expect(ficha.textContent).toMatch(/View full profile/);
    expect(enEspanol(ficha)).toEqual([]);
  });

  it("el selector de tablero (admin) muestra los departamentos en inglés", async () => {
    montar();
    await screen.findByText("Gross revenue");
    const disparador = screen.getByRole("button", { name: /Sales dashboard/ });
    fireEvent.keyDown(disparador, { key: "Enter" });
    await screen.findByText("View another department's dashboard");
    expect(screen.getByText("Leadership · Sales")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("en español la pantalla sigue diciendo lo de siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Revenue Bruto");
    expect(screen.getByText("Distribución de la Monetización")).toBeTruthy();
  });
});
