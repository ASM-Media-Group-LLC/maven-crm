// Finanzas en INGLÉS: con la app en EN no queda nada visible en español en las
// pantallas del módulo (dashboard, collections, facturación, nómina, horas y
// variables, reportes, configuración, control financiero, comisiones, templates y
// las dos altas de invoice y nota de pago), ni en sus pestañas, diálogos y popups.
//
// Se montan las pantallas reales con el LanguageProvider de verdad; lo único que
// se reemplaza es Supabase, con datos que pasan por todos los estados guardados
// (borrador, enviada vencida, pagada, reversada…) para que se dibujen sus etiquetas.
//
// ⚠️ La factura A4 y la nota de pago A4 NO se traducen: son el documento que recibe
// la creadora (y lo que se exporta a PDF). Están marcadas con `data-documento` y el
// recorrido las saltea; un test aparte confirma que siguen en español.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";
import translations from "@/lib/i18n";

// Cada test recorre una pantalla entera con sus pestañas y diálogos: con la suite
// completa corriendo en paralelo (y la máquina cargada), ni los 5 s por defecto ni
// 30 s alcanzan. Un fallo de verdad es una aserción, no el reloj.
vi.setConfig({ testTimeout: 180_000 });

// Los gráficos (recharts) y el visor A4 miden su contenedor con ResizeObserver, que
// jsdom no trae.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ── Datos ────────────────────────────────────────────────────────────────
const ahora = new Date();
const esteMes = new Date(ahora.getFullYear(), ahora.getMonth(), 2, 12).toISOString();
const mesPasado = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 10, 12).toISOString();
const ym = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;

const CREADORAS = [
  { id: "c1", name: "Luna Star", artistic_name: "Luna", phone: "+1 555", creator_business: [{ billing_address: "Main St 1" }] },
  { id: "c2", name: "Mia Rose", artistic_name: null, phone: null, creator_business: [] },
];
const EMPLEADOS = [
  { id: "e1", first_name: "Laura", last_name: "Gomez", full_name: "Laura Gomez", status: "activo", department_id: "d1", base_salary: 1200, position: "Chatter", departments: { id: "d1", name: "Ops" }, employee_code: "E1" },
  { id: "e2", first_name: "Pedro", last_name: "Ruiz", full_name: "Pedro Ruiz", status: "activo", department_id: null, base_salary: 900, position: null, departments: null, employee_code: "E2" },
];
const factura = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, invoice_number: `INV-${id}`, status, amount: 1000, fee_amount: 50, net_amount: 950, agency_amount: 900,
  blue_amount: 100, paypal_amount: 0, created_at: esteMes, payment_method: "PayPal", due_date: "2026-01-10",
  recipient_name: null, creator_id: "c1", creators: CREADORAS[0], invoice_templates: null, reversal_reason: null,
  period_start: "2026-01-01", period_end: "2026-01-15", notes: null, evidence_url: "https://files.test/e.png", ...extra,
});
const FACTURAS = [
  factura("1", "borrador"),
  factura("2", "enviada"), // vence en el pasado → se dibuja como vencida
  factura("3", "pagada", { created_at: mesPasado }),
  factura("4", "pagada"),
  factura("5", "reversada", { reversal_reason: "Duplicate" }),
  factura("6", "parcial", { creator_id: null, creators: null, amount: 0 }),
  factura("7", "cancelada", { payment_method: "quincenal" }),
];
const comision = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, status, commission_type: "laboral", estimated_amount: 300, final_amount: 320, base_amount: 1500, percentage: 20,
  area: "chatters", cost_center: "OPS", created_at: esteMes, employee_name: "Laura Gomez", employee_id: "e1",
  employees: { first_name: "Laura", last_name: "Gomez", employee_code: "E1" }, creators: { name: "Luna Star", artistic_name: "Luna" },
  creator_id: "c1", period: "01/09/26 - 15/09/26", period_start: "2026-09-01", period_end: "2026-09-15", period_name: null,
  calculation_method: "fixed_percentage", calculation_config: { percentage: 20, blue_package: true, blue_amount: 50 },
  notes: "Note", payment_method: "PayPal", payment_date: "2026-09-20", ...extra,
});
const COMISIONES = [
  comision("k1", "proyectado"),
  comision("k2", "confirmado", { commission_type: "comercial", area: null }),
  comision("k3", "pagado"),
  comision("k4", "pendiente"),
  comision("k5", "en_proceso", { estimated_amount: 60000 }),
];
const periodo = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, period_name: `${ym} ${id}`, status, gross_total: 5000, net_total: 4200, cost_center: null, created_at: esteMes,
  total_employees: 2, start_date: "2026-09-01", end_date: "2026-09-30", notes: null, ...extra,
});
const PERIODOS = [
  periodo("A", "borrador"),
  periodo("B", "calculado", { cost_center: "OPS" }),
  periodo("C", "cerrado"),
  periodo("D", "pagado", { notes: "Paid out" }),
];
const DETALLES = [
  { id: "p1", employee_id: "e1", payroll_period_id: "A", overtime_hours: 6, overtime_amount: 120, hour_bank_hours: 4, hour_bank_amount: 60, net_total: 1300, created_at: esteMes, employees: { first_name: "Laura", last_name: "Gomez", employee_code: "E1" }, payroll_periods: { period_name: `${ym} A`, status: "borrador" } },
  { id: "p2", employee_id: "e2", payroll_period_id: "B", overtime_hours: 2, overtime_amount: 40, hour_bank_hours: 0, hour_bank_amount: 0, net_total: 950, created_at: esteMes, employees: null, payroll_periods: null },
  { id: "p3", employee_id: "e2", payroll_period_id: "B", overtime_hours: 0, overtime_amount: 30, hour_bank_hours: 0, hour_bank_amount: 10, net_total: 0, created_at: esteMes, employees: { first_name: "Pedro", last_name: "Ruiz", employee_code: "E2" }, payroll_periods: { period_name: `${ym} B`, status: "calculado" } },
];
const CONFIG = [
  { config_key: "payroll_params", config_value: { deductions: { health_pct: 4, pension_pct: 4, tax_pct: 2 }, overtime_multipliers: { daytime: 1.25, nighttime: 1.75, holiday: 2 }, hour_bank: { validity_months: 6, hour_value: 15 } } },
  { config_key: "payment_methods", config_value: { methods: [{ name: "PayPal", commission_pct: 5, active: true }, { name: "Wire", commission_pct: 0, active: false }] } },
  { config_key: "cost_centers", config_value: { centers: [{ name: "Ops", code: "OPS", monthly_budget: 5000 }, { name: "Tech", code: "TEC", monthly_budget: 0 }] } },
  { config_key: "commission_defaults", config_value: { creator_pct: 50, partner_pct: 20, exceptions: [{ creator_id: "c1", creator_name: "Luna", pct: 40 }] } },
  { config_key: "quickbooks_templates", config_value: { mappings: [{ category: "Fees", type: "ingreso", code: "4000", account_name: "Income" }] } },
];
const TABLAS: Record<string, Record<string, unknown>[]> = {
  invoices: FACTURAS,
  commissions: COMISIONES,
  payroll_periods: PERIODOS,
  payroll_details: DETALLES,
  employees: EMPLEADOS,
  employee_deductions: [
    // deduction_type como lo guarda el alta de RRHH (HRDeductionNew): en español.
    { id: "d1", employee_id: "e1", amount: 80, reason: "Loan", month_year: ym, deduction_type: "adelanto", status: "applied", created_at: esteMes, employees: { first_name: "Laura", last_name: "Gomez" } },
    { id: "d2", employee_id: "e2", amount: 20, reason: null, month_year: ym, deduction_type: "infraccion", status: "pending", created_at: esteMes, employees: { first_name: "Pedro", last_name: "Ruiz" } },
  ],
  creators: CREADORAS,
  v_creators: CREADORAS,
  creator_payments: [
    { id: "n1", creator_id: "c1", amount: 500, payment_type: "Adelanto", payment_method: "Transferencia", status: "pending", due_date: "2026-10-01", created_at: esteMes, notes: null },
    { id: "n2", creator_id: "c2", amount: 250, payment_type: "Ajuste", payment_method: "Otro", status: "cancelled", due_date: null, created_at: esteMes, notes: "Fix" },
  ],
  financial_config: CONFIG,
  financial_reports: [
    { id: "r1", report_type: "comisiones", format: "excel", area: "chatters", period_from: "2026-09-01", period_to: "2026-09-30", created_at: esteMes },
    { id: "r2", report_type: "consolidado", format: "csv", area: null, period_from: null, period_to: null, created_at: esteMes },
  ],
  invoice_templates: [
    { id: "t1", name: "KASH AGENCY - Invoice", type: "invoice", company_name: "KASH AGENCY", company_address: "333 SE 2nd Ave", company_zip: "33131", company_email: "billing@kash.test", logo_url: null, created_by: "u1", created_at: esteMes },
    { id: "t2", name: "Template - Nota de pago", type: "nota_pago", company_name: null, company_address: null, company_zip: null, company_email: null, logo_url: null, created_by: null, created_at: esteMes },
  ],
  profiles: [{ id: "u1", full_name: "Admin User" }],
  creator_business: [{ creator_id: "c1", agency_percentage: 20, blue_package: true, li_payment_amount: 50, commission_type: "fixed", commission_tiers: null, payment_method: "PayPal" }],
};

// Supabase: cada cadena de la query builder termina en { data, error }. `.eq()`
// filtra de verdad (financial_config se pide por config_key); el resto no importa.
function consulta(tabla: string) {
  let filas = [...(TABLAS[tabla] ?? [])];
  let uno = false;
  const q: Record<string, unknown> = {};
  const encadenar = () => q;
  for (const m of ["select", "order", "limit", "in", "ilike", "gte", "lte", "neq", "insert", "update", "delete", "range"]) q[m] = encadenar;
  q.eq = (col: string, val: unknown) => {
    filas = filas.filter((f) => !(col in f) || f[col] === val);
    return q;
  };
  q.maybeSingle = () => { uno = true; return q; };
  q.single = q.maybeSingle;
  q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve({ data: uno ? (filas[0] ?? null) : filas, error: null }).then(ok, ko);
  return q;
}
vi.mock("@/integrations/supabase/client", () => {
  const canal = { on: () => canal, subscribe: () => canal };
  return {
    supabase: {
      from: (tabla: string) => consulta(tabla),
      channel: () => canal,
      removeChannel: () => {},
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    },
  };
});

import FinanzasDashboard from "@/pages/finanzas/FinanzasDashboard";
import CollectionsPage from "@/pages/finanzas/collections/CollectionsPage";
import FacturacionPage from "@/pages/finanzas/facturacion/FacturacionPage";
import NominaPage from "@/pages/finanzas/nomina/NominaPage";
import HorasVariablesPage from "@/pages/finanzas/horas-variables/HorasVariablesPage";
import HorasPage from "@/pages/finanzas/horas/HorasPage";
import ReportesPage from "@/pages/finanzas/reportes/ReportesPage";
import ConfiguracionPage from "@/pages/finanzas/configuracion/ConfiguracionPage";
import ControlFinancieroPage from "@/pages/finanzas/control/ControlFinancieroPage";
import ComisionesPage from "@/pages/finanzas/comisiones/ComisionesPage";
import TemplatesPage from "@/pages/finanzas/facturacion/TemplatesPage";
import NuevoInvoicePage from "@/pages/finanzas/facturacion/NuevoInvoicePage";
import NuevaNotaPagoPage from "@/pages/finanzas/facturacion/NuevaNotaPagoPage";
import { useFondosPropios } from "@/hooks/useFondosPropios";

/** Todo el texto visible y los atributos que se leen en pantalla. Se saltea lo que
 *  es código y el documento A4 (idioma fijo, ver arriba). */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, [data-documento]")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    if (el.closest("[data-documento]")) continue;
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
// El detector no conoce todas las palabras ("Vencida", "Pagada", "Cobros" no tienen
// tilde ni están en su lista). Por eso también se marca todo texto que sea
// EXACTAMENTE el español de una clave del diccionario que en inglés se escribe
// distinto: es el síntoma de un t() que se perdió (igual que en adminEnIngles).
const ESPANOL_DEL_DICCIONARIO = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((par) => par.es !== par.en)
    .map((par) => par.es.trim()),
);
// Y los valores que se GUARDAN en español (estados, tipos, métodos de cobro): si se
// imprimen crudos en inglés ("Type: laboral", "borrador · No CC") no tienen tilde ni
// son el español exacto de una clave (van en minúscula), así que tampoco se ven. Se
// buscan como palabra suelta.
const GUARDADOS_EN_ESPANOL = new Set([
  "borrador", "enviada", "pagada", "parcial", "vencida", "reversada", "cancelada",
  "proyectado", "confirmado", "pagado", "pendiente", "en_proceso", "calculado", "cerrado",
  "laboral", "comercial", "quincenal", "mensual", "cobro", "adelanto", "infraccion",
]);
const traeUnGuardado = (t: string) => t.split(/[\s·:,()/]+/).some((w) => GUARDADOS_EN_ESPANOL.has(w));
const esTextoEspanol = (t: string) => esEspanol(t) || ESPANOL_DEL_DICCIONARIO.has(t) || traeUnGuardado(t);
const enEspanol = () => textosVisibles(document.body).filter(esTextoEspanol);

function montar(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <TooltipProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const boton = (nombre: string | RegExp) => screen.getByRole("button", { name: nombre });
const pestana = (nombre: string) => fireEvent.click(boton(nombre));

/** Abre un diálogo con `abrir`, revisa que no tenga español y lo cierra. */
async function revisarDialogo(abrir: () => void, rol: "dialog" | "alertdialog" = "dialog") {
  abrir();
  const dialogo = await screen.findByRole(rol);
  expect(textosVisibles(dialogo).filter(esTextoEspanol), dialogo.textContent ?? "").toEqual([]);
  fireEvent.keyDown(dialogo, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole(rol)).toBeNull());
  return dialogo;
}

/** Cada StatChip clickeable abre su popup de detalle: todos en inglés. */
async function revisarPopups(etiquetas: string[]) {
  for (const etiqueta of etiquetas) {
    const chip = screen.getAllByText(etiqueta).map((el) => el.closest("button")).find(Boolean)!;
    await revisarDialogo(() => fireEvent.click(chip));
  }
}

describe("Finanzas en inglés", () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem("app-language", "en");
  });

  it("Dashboard financiero: tarjetas, filtros y cada popup", async () => {
    montar(<FinanzasDashboard />);
    await screen.findByText("Revenue this month");
    await screen.findByText("Operational alerts");
    expect(screen.getByText("Headcount and staff costs")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarPopups([
      "Revenue this month", "Costs this month", "Operating margin", "Projected payroll", "Accrued commissions",
      "Pending invoices", "Overdue invoices", "Change vs previous", "Active employees", "Avg cost/emp",
      "Deductions this month", "Departments", "Operational alerts", "Payroll to close", "Commissions to approve",
      "Invoices to send", "Bank files",
    ]);
    // Los estados guardados en español se muestran traducidos en los popups.
    fireEvent.click(screen.getByText("Projected payroll").closest("button")!);
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText(/^Draft · /)).toBeTruthy();
  });

  it("Collections: tablero, tabla de cobros, alta, detalle, edición y popups", async () => {
    montar(<CollectionsPage />);
    await screen.findByText("BIWEEKLY");
    await screen.findAllByText("No charge");
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["Total", "Paid", "Pending", "Overdue", "No charge"]);
    await revisarDialogo(() => fireEvent.click(boton(/Record payment/)));
    pestana("Payments");
    await screen.findByText("Evidence");
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    fireEvent.click(boton("Grid view"));
    expect(enEspanol()).toEqual([]);
  });

  it("Facturación: cada pestaña, popups y confirmaciones", async () => {
    montar(<FacturacionPage />);
    await screen.findByText("INV-1", { exact: false });
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["Total invoices", "Pending", "Total amount", "Total fees"]);
    for (const p of ["Payment notes", "Reversals", "Commissions", "Mail", "PagoMundo file", "Invoices"]) {
      pestana(p);
      await waitFor(() => expect(enEspanol(), p).toEqual([]));
    }
    pestana("Payment notes");
    await screen.findByText("Advance");
    expect(screen.getByText("Bank transfer")).toBeTruthy();
    pestana("Invoices");
    fireEvent.click(boton("Grid view"));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]), "alertdialog");
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Reverse" })[0]));
    await revisarDialogo(() => fireEvent.click(boton(/Create invoice/)));

    // El alta de invoice: al elegir la creadora se listan sus comisiones con su tipo
    // y su estado (guardados en español: "laboral", "proyectado").
    fireEvent.click(boton(/Create invoice/));
    const alta = await screen.findByRole("dialog");
    // Un combobox no toma el nombre de su contenido: se busca por el texto del botón.
    fireEvent.click(within(alta).getByText("Select creator").closest("button")!);
    fireEvent.click(await screen.findByRole("option", { name: /Luna/ }));
    await within(alta).findAllByText(/^Labor · Projected · /);
    expect(within(alta).getByText(/^Commercial · Confirmed · /)).toBeTruthy();
    expect(within(alta).getByText(/^Labor · In process · /)).toBeTruthy();
    expect(textosVisibles(alta).filter(esTextoEspanol)).toEqual([]);
  });

  it("Facturación: el invoice que se abre es el documento y sigue en español", async () => {
    montar(<FacturacionPage />);
    await screen.findByText("INV-1", { exact: false });
    fireEvent.click(boton("Grid view"));
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    const dialogo = await screen.findByRole("dialog");
    // Lo único en español es el documento; afuera de él no hay nada.
    expect(dialogo.querySelector("[data-documento]")?.textContent).toMatch(/Documento generado por/);
    expect(enEspanol()).toEqual([]);
  });

  it("Nómina: pestañas, popups y los tres diálogos", async () => {
    montar(<NominaPage />);
    await screen.findByText(`${ym} A`);
    expect(screen.getAllByText("Calculated").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["Total periods", "Drafts", "Total gross amount", "Total net amount"]);
    for (const p of ["Pay stubs", "Mail", "Batch", "Calculation"]) {
      pestana(p);
      await waitFor(() => expect(enEspanol(), p).toEqual([]));
    }
    await revisarDialogo(() => fireEvent.click(boton(/Calculate payroll/)));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: /Create batch/ })[0]));
    await revisarDialogo(() => fireEvent.click(boton(/Close month/)), "alertdialog");
    fireEvent.click(boton("Grid view"));
    await revisarDialogo(() => fireEvent.click(screen.getByText(`${ym} A`).closest("[class*='cursor-pointer']")!));
    // Las deducciones de RRHH del periodo: el tipo guardado ("adelanto") va traducido.
    // Se vuelve a abrir porque revisarDialogo lo cierra.
    fireEvent.click(screen.getByText(`${ym} A`).closest("[class*='cursor-pointer']")!);
    const abierto = await screen.findByRole("dialog");
    expect(await within(abierto).findByText("Payroll advance")).toBeTruthy();
    expect(within(abierto).getByText("Infraction")).toBeTruthy();
    expect(textosVisibles(abierto).filter(esTextoEspanol)).toEqual([]);
  });

  it("Horas & Variables: las tres pestañas, pagar, compensar y popups", async () => {
    montar(<HorasVariablesPage />);
    await screen.findByText("Total overtime");
    await screen.findAllByText("Laura Gomez");
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["Total overtime", "Hour bank", "Total commissions", "Active employees"]);
    pestana("Hour bank");
    await screen.findAllByText("Accrued");
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(boton(/^Pay$/)));
    await revisarDialogo(() => fireEvent.click(boton(/^Compensate$/)));
    pestana("Commissions");
    await screen.findAllByText("Projected");
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(boton(/New commission/)));

    // El detalle de cada comisión (el ojo de la fila): tipo y estado traducidos.
    // Se mira ANTES de cerrar: al cerrarse, el diálogo suelta la comisión y se vacía.
    const ver = () => Array.from(document.querySelectorAll("svg.lucide-eye")).map((svg) => svg.closest("button")!);
    const esperados: [number, string, string][] = [[0, "Type: Labor", "Status: Projected"], [1, "Type: Commercial", "Status: Confirmed"]];
    for (const [fila, tipo, estado] of esperados) {
      fireEvent.click(ver()[fila]);
      const detalle = await screen.findByRole("dialog");
      expect(detalle.textContent).toContain(tipo);
      expect(detalle.textContent).toContain(estado);
      expect(textosVisibles(detalle).filter(esTextoEspanol)).toEqual([]);
      fireEvent.keyDown(detalle, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });

  it("Horas & Banco de Horas: las dos pestañas", async () => {
    montar(<HorasPage />);
    await screen.findByText("Average per employee");
    expect(enEspanol()).toEqual([]);
    pestana("Hour bank");
    await screen.findByText("Accrued hours", { selector: "span" });
    expect(enEspanol()).toEqual([]);
  });

  it("Reportes: las cinco pestañas y el alta", async () => {
    montar(<ReportesPage />);
    await screen.findByText("Commissions");
    expect(enEspanol()).toEqual([]);
    for (const p of ["Sales by creator", "By payment method", "Monthly comparisons", "General reports", "CC statement"]) {
      pestana(p);
      await waitFor(() => expect(enEspanol(), p).toEqual([]));
    }
    await revisarDialogo(() => fireEvent.click(boton(/Generate report/)));
  });

  it("Configuración financiera: las cinco secciones y los popups", async () => {
    montar(<ConfiguracionPage />);
    await screen.findByText("QB mappings");
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["QB mappings", "Payroll parameters"]);
    for (const s of ["QuickBooks templates", "Cost centers", "Commission settings"]) {
      await revisarDialogo(() => fireEvent.click(screen.getAllByText(s).map((el) => el.closest("button")).find(Boolean)!));
    }
    // "Payment methods" y "Payroll parameters" están dos veces (KPI y sección): la sección es la segunda.
    await revisarDialogo(() => fireEvent.click(screen.getAllByText("Payment methods").map((el) => el.closest("button"))[1]!));
  });

  it("Control financiero: las cinco pestañas y los popups", async () => {
    montar(<ControlFinancieroPage />);
    await screen.findByText("Total revenue");
    expect(enEspanol()).toEqual([]);
    await revisarPopups(["Total revenue", "Total expenses", "Balance", "Margin"]);
    for (const p of ["Costs by CC", "Costs by department", "Productivity by employee", "Operating margins", "Revenue vs costs"]) {
      pestana(p);
      await waitFor(() => expect(enEspanol(), p).toEqual([]));
    }
    pestana("Costs by department");
    expect(screen.getByText("No department")).toBeTruthy();
  });

  it("Comisiones: pestañas, detalle y alta", async () => {
    montar(<ComisionesPage />);
    await screen.findByText("Total records");
    expect(enEspanol()).toEqual([]);
    for (const p of ["Projection", "Batch history", "Real time"]) {
      pestana(p);
      await waitFor(() => expect(enEspanol(), p).toEqual([]));
    }
    await revisarPopups(["Total records", "Projected", "Confirmed", "Estimated amount"]);
    await revisarDialogo(() => fireEvent.click(boton(/New commission/)));
  });

  it("Templates: la lista, el alta y el borrado", async () => {
    montar(<TemplatesPage />);
    await screen.findByText("KASH AGENCY - Invoice");
    expect(screen.getAllByText("Payment note").length).toBeGreaterThan(0);
    // El nombre guardado ("Template - Nota de pago") es un dato: se muestra tal cual y
    // solo se traduce el tipo que se le agrega.
    expect(screen.getByText("Template - Nota de pago - Payment note")).toBeTruthy();
    // Esa fila es la única con español, y es el dato guardado: se descuenta solo ella.
    expect(enEspanol().filter((t) => t !== "Template - Nota de pago - Payment note")).toEqual([]);
    await revisarDialogo(() => fireEvent.click(boton(/Create template/)));
  });

  it("Nuevo invoice y nueva nota de pago: el formulario en inglés, el documento aparte", async () => {
    montar(<NuevoInvoicePage />);
    await screen.findByText("Create a new invoice for a creator");
    expect(enEspanol()).toEqual([]);
    cleanup();
    montar(<NuevaNotaPagoPage />);
    await screen.findByText("Create a new payment note for a creator");
    expect(enEspanol()).toEqual([]);
    // La vista previa ES la nota de pago: sigue en español, como el documento guardado.
    expect(document.querySelector("[data-documento]")?.textContent).toMatch(/Nota de Pago/);
  });

});

// ⚠️ En español la pantalla dice EXACTAMENTE lo que decía antes de traducirla. Donde
// se mostraba el valor guardado tal cual ("borrador · Sin CC", "Estado: pagado") se
// sigue viendo así, en minúscula; donde había una etiqueta ("Borrador" en los badges)
// sigue la etiqueta. Los textos de acá salen de recorrer las pantallas de main antes
// del cambio.
describe("Finanzas en español: dice lo mismo que antes, palabra por palabra", () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem("app-language", "es");
  });

  /** Abre el popup de un StatChip y devuelve el diálogo. */
  async function abrirPopup(etiqueta: string) {
    const chip = screen.getAllByText(etiqueta).map((el) => el.closest("button")).find(Boolean)!;
    fireEvent.click(chip);
    return screen.findByRole("dialog");
  }
  async function cerrar(dialogo: HTMLElement) {
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }

  it("Dashboard: los popups de nómina, comisiones y departamentos", async () => {
    montar(<FinanzasDashboard />);
    await screen.findByText("Nómina Proyectada");
    let popup = await abrirPopup("Nómina Proyectada");
    expect(within(popup).getByText("borrador · Sin CC")).toBeTruthy();
    expect(within(popup).getByText("calculado · OPS")).toBeTruthy();
    await cerrar(popup);
    popup = await abrirPopup("Comisiones Acumuladas");
    expect(within(popup).getByText("chatters · en_proceso")).toBeTruthy();
    expect(within(popup).getByText("Sin área · confirmado")).toBeTruthy();
    await cerrar(popup);
    popup = await abrirPopup("Departamentos");
    expect(within(popup).getByText("Sin departamento")).toBeTruthy();
  });

  it("Facturación: badges con etiqueta, el popup con el estado guardado y la fecha sin locale", async () => {
    montar(<FacturacionPage />);
    await screen.findByText("INV-1", { exact: false });
    expect(screen.getByText("Facturación")).toBeTruthy();
    expect(screen.getAllByText("Borrador").length).toBeGreaterThan(0);
    const popup = await abrirPopup("Total Invoices");
    // "02 Sep 2026": el mes en inglés, como siempre (el popup no pasaba locale).
    expect(within(popup).getByText(/^borrador · \d{2} [A-Z][a-z]{2} \d{4}$/)).toBeTruthy();
    expect(within(popup).getByText(/^cancelada · \d{2} [A-Z][a-z]{2} \d{4}$/)).toBeTruthy();
    await cerrar(popup);
    // El alta de invoice: "laboral · proyectado", crudo.
    fireEvent.click(screen.getByRole("button", { name: /Crear Invoice/ }));
    const alta = await screen.findByRole("dialog");
    fireEvent.click(within(alta).getByText("Seleccionar creador").closest("button")!);
    fireEvent.click(await screen.findByRole("option", { name: /Luna/ }));
    await within(alta).findAllByText(/^laboral · proyectado · /);
    expect(within(alta).getByText(/^comercial · confirmado · /)).toBeTruthy();
  });

  it("Templates: el nombre sin compañía y el cargando", async () => {
    montar(<TemplatesPage />);
    expect(screen.getByText("Cargando...")).toBeTruthy();
    expect(await screen.findByText("Template - Nota de pago - Nota de pago")).toBeTruthy();
  });

  it("Nómina: rango de fechas, badges de Batch y Recibos y el popup", async () => {
    montar(<NominaPage />);
    await screen.findByText(`${ym} A`);
    fireEvent.click(screen.getByRole("button", { name: /Calcular Nómina/ }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Rango de Fechas")).toBeTruthy();
    await cerrar(dialogo);
    fireEvent.click(screen.getAllByRole("button", { name: /Crear Batch/ })[0]);
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("borrador")).toBeTruthy();
    expect(within(dialogo).getByText("calculado")).toBeTruthy();
    await cerrar(dialogo);
    dialogo = await abrirPopup("Total Periodos");
    expect(within(dialogo).getByText("borrador · Sin CC")).toBeTruthy();
    await cerrar(dialogo);
    fireEvent.click(screen.getByRole("button", { name: "Recibos" }));
    expect(await screen.findByText("cerrado")).toBeTruthy();
    expect(screen.getByText("pagado")).toBeTruthy();
    // El detalle de un periodo: las deducciones de RRHH con su tipo guardado, crudo.
    fireEvent.click(screen.getByRole("button", { name: "Cálculo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Vista de cuadrícula" }));
    fireEvent.click(screen.getByText(`${ym} A`).closest("[class*='cursor-pointer']")!);
    dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("adelanto")).toBeTruthy();
    expect(within(dialogo).getByText("infraccion")).toBeTruthy();
  });

  it("Collections y Horas & Variables: la tabla de cobros y el detalle de la comisión", async () => {
    montar(<CollectionsPage />);
    await screen.findAllByText("Sin Cobro");
    const popup = await abrirPopup("Total");
    expect(within(popup).getByText(/^cancelada · /)).toBeTruthy();
    await cerrar(popup);
    fireEvent.click(screen.getByRole("button", { name: "Cobros" }));
    expect(await screen.findByText("cancelada")).toBeTruthy();
    expect(screen.getByText("parcial")).toBeTruthy();
    expect(screen.getAllByText("Pagada").length).toBeGreaterThan(0);

    cleanup();
    montar(<HorasVariablesPage />);
    await screen.findAllByText("Laura Gomez");
    fireEvent.click(screen.getByRole("button", { name: "Comisiones" }));
    await screen.findAllByText("Proyectado");
    fireEvent.click(document.querySelector("svg.lucide-eye")!.closest("button")!);
    const detalle = await screen.findByRole("dialog");
    expect(detalle.textContent).toContain("Tipo: laboral");
    expect(detalle.textContent).toContain("Estado: proyectado");
  });
});

describe("Fondos propios de la videollamada (useFondosPropios): el aviso sale en inglés", () => {
  it("el motivo del fallo se arma en el idioma de la interfaz", async () => {
    const { toast } = await import("sonner");
    const aviso = vi.spyOn(toast, "error").mockImplementation(() => "");
    localStorage.setItem("app-language", "en");
    let subir: ((f: File) => Promise<string | null>) | null = null;
    function Sonda() {
      subir = useFondosPropios(false).subir;
      return null;
    }
    montar(<Sonda />);
    // jsdom no tiene IndexedDB: guardar falla → el aviso tiene que salir en inglés.
    await subir!(new File(["x"], "fondo.png", { type: "image/png" }));
    expect(aviso).toHaveBeenCalled();
    const [titulo, opciones] = aviso.mock.calls[0] as [string, { description: string }];
    expect(titulo).toBe("Couldn't save the background");
    expect(esEspanol(opciones.description)).toBe(false);
    aviso.mockRestore();
  });
});
