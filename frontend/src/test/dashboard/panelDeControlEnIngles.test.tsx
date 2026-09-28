// Panel de control en INGLÉS: los KPIs, el embudo, el popup de detalle de una
// métrica (agrupado por categoría, con el balde "Sin categoría") y la ficha de
// un lead no tienen nada visible en español.
//
// Se monta la pantalla REAL con el LanguageProvider de verdad; solo se
// reemplazan los hooks que leen la base. Las pestañas que son de OTRO dueño
// (cuentas del spammer, control de gasto, reclutamiento de chatters, bot de
// WhatsApp) y el popup del mejor cerrador del mes se cambian por un stub: este
// test mira el texto de PanelDeControl. Lo mismo con las píldoras de rango
// (lib/range-presets, de otro PR).
//
// Lo que NO se traduce también se prueba: el balde "Sin categoría" es la llave
// con la que se piden las filas a la base, y el submódulo del permiso sigue
// siendo "Bot WhatsApp".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Pantallas enteras: con toda la suite corriendo en paralelo, los 5 s por test
// (y el segundo de findBy/waitFor) a veces no alcanzan sin que haya nada roto.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const estado = vi.hoisted(() => ({
  categoriasPedidas: [] as Array<string | null>,
  permisos: [] as string[],
}));

const KPIS = {
  contacted: 120, scouterContacts: 30, scouterGenerated: 40, totalGenerated: 160, llgWithPhone: 20,
  scouterWithPhone: 5, numbersObtained: 25, closerCalls: 10, closes: 4, onHold: 3, rejections: 3,
  enteredCrm: 2, crmAltas: 3, crmBajas: 1, totalLeads: 150, leadsNuevas: 100, leadsExistentes: 50,
};

vi.mock("@/hooks/useOperationsDashboard", async (original) => {
  const real = await original<typeof import("@/hooks/useOperationsDashboard")>();
  return {
    ...real,
    useOperationsDashboard: () => ({ data: KPIS, isLoading: false }),
    useBestCloser: () => ({ data: { name: "Carl Closer", closes: 4, avgScore: 88 }, isLoading: false }),
    useMetricDetails: () => ({
      data: {
        rows: [
          { id: "r1", primary: "model.one", secondary: "Carl Closer", badge: "cerro", category: "A", date: "2026-09-20" },
          { id: "r2", primary: "model.two", badge: "cerro", leadSource: "leadgen" },
        ],
        totalCount: 40,
      },
      isLoading: false,
    }),
    useMetricCategoryBreakdown: () => ({ data: [{ category: "A", count: 3 }, { category: "Sin categoría", count: 2 }], isLoading: false }),
    useMetricCategoryRows: (_m: unknown, _r: unknown, cat: string | null, enabled: boolean) => {
      if (enabled) estado.categoriasPedidas.push(cat);
      return { data: [{ id: `x-${cat}`, primary: cat === "A" ? "lead.alpha" : "lead.none", leadSource: "leadgen" }], isLoading: false };
    },
    useLeadDetail: (_s: unknown, id: string | null) => ({
      data: id
        ? { id, name: "Lead Name", model_handle: "model.two", phone: "+1 555 0100", country: "Colombia", followers: 1200, verified: true, notes: "Warm lead" }
        : null,
      isLoading: false,
    }),
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canAccess: (_m: string, sub?: string) => {
      if (sub) estado.permisos.push(sub);
      return true;
    },
  }),
}));
vi.mock("@/pages/panel-de-control/SpammerAccountsTab", () => ({ default: () => null }));
vi.mock("@/pages/panel-de-control/ControlGastoTab", () => ({ default: () => null }));
vi.mock("@/pages/panel-de-control/ChattersRecruitmentTab", () => ({ default: () => null }));
vi.mock("@/pages/panel-de-control/WhatsappAgentTab", () => ({ default: () => null }));
vi.mock("@/components/dashboard/BestCloserMonthlyDialog", () => ({ default: () => null }));
vi.mock("@/lib/range-presets", async (original) => {
  const real = await original<typeof import("@/lib/range-presets")>();
  return { ...real, PRESET_CONFIG: real.PRESET_CONFIG.map((p) => ({ ...p, label: `preset-${p.key}` })) };
});

import PanelDeControl from "@/pages/PanelDeControl";

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
const SOLO_ESPANOL = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((p) => p.es !== p.en && /[a-zA-Z]{2}/.test(p.es))
    .map((p) => p.es),
);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || SOLO_ESPANOL.has(t));

function montar(url = "/panel-de-control") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LanguageProvider>
          <PanelDeControl />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Panel de control en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    estado.categoriasPedidas.length = 0;
    estado.permisos.length = 0;
  });

  it("los KPIs, el embudo y las pestañas no tienen nada en español", async () => {
    montar();
    await screen.findByText("Total leads generated");
    expect(screen.getByText("Funnel flow")).toBeTruthy();
    expect(screen.getByText("Best closer")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Model recruiting" })).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    // El submódulo del permiso sigue siendo la llave de role_permissions.
    expect(estado.permisos).toContain("Bot WhatsApp");
  });

  it("el detalle de una métrica agrupada por categoría, con el balde sin categoría", async () => {
    montar("/panel-de-control?metric=totalLeads");
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("No category")).toBeTruthy();
    expect(within(dialogo).getByText("Expand")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    // Al expandir, las filas se piden con la LLAVE de la base, no con lo que se ve.
    fireEvent.click(within(dialogo).getByText("No category"));
    await waitFor(() => expect(estado.categoriasPedidas).toContain("Sin categoría"));
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el detalle sin categorías (filas mezcladas) y la ficha de un lead, también", async () => {
    montar("/panel-de-control?metric=closes");
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getAllByText("Closed").length).toBeGreaterThan(0);
    expect(within(dialogo).getAllByText(/Showing the 2 most recent of/).length).toBe(2);
    expect(enEspanol(dialogo)).toEqual([]);
    // La fila sin categoría cae en su balde, que arranca plegado.
    fireEvent.click(within(dialogo).getByText("No category"));
    fireEvent.click(await within(dialogo).findByText("model.two"));
    await screen.findAllByText("Lead Name");
    const dialogos = screen.getAllByRole("dialog");
    const ficha = dialogos[dialogos.length - 1];
    expect(within(ficha).getByText("Contact")).toBeTruthy();
    expect(within(ficha).getByText("Yes")).toBeTruthy();
    expect(enEspanol(ficha)).toEqual([]);
  });

  it("en español sigue diciendo lo de siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Total leads generados");
    expect(screen.getByText("Flujo del funnel")).toBeTruthy();
  });
});
