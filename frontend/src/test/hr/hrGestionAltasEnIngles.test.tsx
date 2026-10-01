// RRHH, parte B, en INGLÉS: las altas paso por paso (incidente, evaluación,
// offboarding, onboarding, deducción, candidato), la edición de un anuncio y el
// detalle del agente de Hubstaff. Con la app en EN no queda nada visible en
// español en ningún paso.
//
// Y la otra mitad de la regla: LO QUE SE GUARDA NO SE TRADUCE. La checklist de
// onboarding/offboarding, el motivo de salida, el período de la evaluación y el
// destinatario "toda la empresa" de un anuncio se guardan en español aunque
// quien los carga tenga la app en inglés: los leen otras personas.
//
// Los Select de Radix se reemplazan por un <select> nativo (mismas opciones y
// valores): así se pueden elegir sin puntero y TODAS las opciones quedan en el
// DOM para revisarlas. El selector de fecha, por un <input>.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { createContext, useContext, type ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

// El Slider de la evaluación y el gráfico del agente miden su caja; jsdom no
// trae ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const HACE = "2026-09-01T12:00:00Z";
const TABLAS: Record<string, unknown[]> = {
  employees: [
    { id: "e1", first_name: "Laura", last_name: "Smith", department_id: "d1", departments: { name: "Operations" }, base_salary: 3000000, hire_date: "2024-01-01" },
    { id: "e2", first_name: "Mark", last_name: "Lee", department_id: null, departments: null, base_salary: 2000000, hire_date: "2025-06-01" },
  ],
  departments: [{ id: "d1", name: "Operations" }],
  employee_offboarding: [{ id: "ob1", employee_id: "zz" }],
  employee_onboarding: [{ id: "on1", employee_id: "zz" }],
  internal_announcements: [{ id: "an1" }],
  hour_bank: [{ hours: 4, movement_type: "deposit" }],
  absences: [],
  financial_config: [],
  profiles: [{ id: "u1", full_name: "Laura Smith" }],
};

// Lo que cada pantalla le manda a la base.
const escrituras: { tabla: string; filas: unknown }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const filas = () => TABLAS[tabla] ?? [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "not", "in", "gte", "lte", "order", "limit", "delete", "upsert"]) {
      q[m] = () => q;
    }
    q.insert = (datos: unknown) => { escrituras.push({ tabla, filas: datos }); return q; };
    q.update = (datos: unknown) => { escrituras.push({ tabla, filas: datos }); return q; };
    q.single = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.maybeSingle = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
      Promise.resolve({ data: filas(), error: null }).then(ok, mal);
    return q;
  };
  return {
    supabase: {
      from: consulta,
      rpc: () => Promise.resolve({ data: [], error: null }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

vi.mock("@/components/hr/EmployeeSearchCombobox", () => ({
  EmployeeSearchCombobox: ({ onChange }: { onChange: (v: string | null) => void }) => (
    <button type="button" onClick={() => onChange("e1")}>Laura Smith</button>
  ),
}));

vi.mock("@/components/ui/date-input", () => ({
  DateInput: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input data-fecha aria-label={placeholder ?? "date"} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/ui/select", () => {
  const Ctx = createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
  const Select = ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: ReactNode }) => (
    <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
  );
  const SelectTrigger = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const SelectValue = ({ placeholder }: { placeholder?: string }) => (placeholder ? <span>{placeholder}</span> : null);
  const SelectContent = ({ children }: { children?: ReactNode }) => {
    const c = useContext(Ctx);
    return (
      <select value={c.value ?? ""} onChange={(e) => c.onValueChange?.(e.target.value)}>
        <option value="" />
        {children}
      </select>
    );
  };
  const SelectItem = ({ value, children }: { value: string; children?: ReactNode }) => <option value={value}>{children}</option>;
  const Nada = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup: Nada, SelectLabel: Nada, SelectSeparator: () => null };
});

// El detalle del agente lee Hubstaff: se le dan datos armados.
let detalleAgente: Record<string, unknown> = {};
vi.mock("@/hooks/useHubstaffAgentDetail", () => ({ useHubstaffAgentDetail: () => detalleAgente }));

import HRIncidentNew from "@/pages/hr/HRIncidentNew";
import HRPerformanceNew from "@/pages/hr/HRPerformanceNew";
import HROffboardingNew from "@/pages/hr/HROffboardingNew";
import HROnboardingNew from "@/pages/hr/HROnboardingNew";
import HRDeductionNew from "@/pages/hr/HRDeductionNew";
import HRApplicantNew from "@/pages/hr/HRApplicantNew";
import AgentDetailView from "@/pages/hr/AgentDetailSheet";
import EditAnnouncementModal from "@/pages/hr/announcements/EditAnnouncementModal";
import CreateAnnouncementModal from "@/pages/hr/announcements/CreateAnnouncementModal";
import type { AnnouncementRow } from "@/pages/hr/announcements/useAnnouncementsAdmin";
import type { HubstaffAgent } from "@/hooks/useHubstaffData";
import translations from "@/lib/i18n";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, script, style")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label], [alt]"))) {
    for (const a of ["title", "placeholder", "aria-label", "alt"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
const ESPANOL_DEL_DICCIONARIO = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((par) => par.es !== par.en)
    .map((par) => par.es.trim()),
);
// Nombres propios: el banco se llama así (y es el valor que se guarda en
// employees.bank_name). Nada más se ignora.
const NOMBRES_PROPIOS = new Set(["Banco de Bogotá"]);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => !NOMBRES_PROPIOS.has(t) && (esEspanol(t) || ESPANOL_DEL_DICCIONARIO.has(t)));

function montar(pantalla: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <TooltipProvider>
          <MemoryRouter>{pantalla}</MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const selects = () => screen.getAllByRole("combobox") as HTMLSelectElement[];
const elegir = (i: number, valor: string) => fireEvent.change(selects()[i], { target: { value: valor } });
const fechas = () => Array.from(document.querySelectorAll<HTMLInputElement>("input[data-fecha]"));
const siguiente = () => fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
const sinEspanol = () => expect(enEspanol()).toEqual([]);
const ultimo = <T,>(xs: T[]): T => xs[xs.length - 1];

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  escrituras.length = 0;
});

describe("RRHH › Altas en inglés, paso por paso", () => {
  it("incidente: los 4 pasos y el registro", async () => {
    montar(<HRIncidentNew />);
    expect(screen.getByText("Report incident")).toBeTruthy();
    // Las opciones de las listas guardadas, traducidas (el valor no cambia).
    expect(screen.getByRole("option", { name: "Disciplinary" })).toHaveValue("disciplinario");
    expect(screen.getByRole("option", { name: "Very serious" })).toHaveValue("muy_grave");
    sinEspanol();
    fireEvent.click(screen.getByText("Laura Smith"));
    elegir(0, "disciplinario");
    elegir(1, "grave");
    siguiente();
    expect(await screen.findByText("HR internal review")).toBeTruthy();
    sinEspanol();
    elegir(0, "high");
    elegir(1, "alto");
    siguiente();
    expect(await screen.findByText("Evidence (optional)")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Short description/), { target: { value: "Late" } });
    expect(screen.getByText("At least 5 characters")).toBeTruthy();
    sinEspanol();
    fireEvent.change(screen.getByPlaceholderText(/Short description/), { target: { value: "Late again" } });
    fireEvent.change(screen.getByPlaceholderText(/Full details/), { target: { value: "Arrived two hours late" } });
    siguiente();
    expect(await screen.findByText("Corrective action")).toBeTruthy();
    sinEspanol();
    fireEvent.change(screen.getByPlaceholderText(/Corrective measures/), { target: { value: "Warning" } });
    fireEvent.click(screen.getByRole("button", { name: "Record incident" }));
    await waitFor(() => expect(escrituras.some((e) => e.tabla === "employee_incidents")).toBe(true));
    expect(escrituras.find((e) => e.tabla === "employee_incidents")!.filas).toMatchObject({ incident_type: "disciplinario", category: "grave", severity: "high", impact: "alto" });
  });

  it("evaluación: los 4 pasos; el período se VE en inglés y se GUARDA en español", async () => {
    montar(<HRPerformanceNew />);
    expect(screen.getByText("New performance evaluation")).toBeTruthy();
    sinEspanol();
    fireEvent.click(screen.getByText("Laura Smith"));
    fireEvent.change(fechas()[0], { target: { value: "2026-01-05" } });
    fireEvent.change(fechas()[1], { target: { value: "2026-08-31" } });
    expect(screen.getByText("Jan 2026 - Aug 2026")).toBeTruthy();
    sinEspanol();
    siguiente();
    expect(await screen.findByText("Quality of work")).toBeTruthy();
    expect(screen.getAllByText("Very good")).toHaveLength(4);
    sinEspanol();
    siguiente();
    expect(await screen.findByText("Qualitative feedback")).toBeTruthy();
    sinEspanol();
    siguiente();
    expect(await screen.findByText("No goals set yet")).toBeTruthy();
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: "Create evaluation" }));
    await waitFor(() => expect(escrituras.some((e) => e.tabla === "performance_evaluations")).toBe(true));
    const guardada = escrituras.find((e) => e.tabla === "performance_evaluations")!.filas as { period: string };
    expect(guardada.period).toBe("ene 2026 - ago 2026");
  });

  it("offboarding: los 3 pasos; la checklist y el motivo se guardan en español", async () => {
    montar(<HROffboardingNew />);
    await screen.findByRole("option", { name: /Laura Smith/ });
    expect(screen.getByText("Start offboarding", { selector: "h1, h2, span, div, p" })).toBeTruthy();
    sinEspanol();
    elegir(0, "e1");
    elegir(1, "voluntary");
    fireEvent.change(fechas()[0], { target: { value: "2026-10-01" } });
    siguiente();
    expect(await screen.findByText("Reason for leaving")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Better job offer" })).toHaveValue("Mejor oferta laboral");
    elegir(0, "Mejor oferta laboral");
    expect(await screen.findByText("Financial summary")).toBeTruthy();
    expect(screen.getByText(/days \(/)).toBeTruthy();
    sinEspanol();
    siguiente();
    expect(await screen.findByText("Offboarding checklist")).toBeTruthy();
    expect(screen.getByText("Revoke corporate email")).toBeTruthy();
    expect(screen.getByText("Access")).toBeTruthy();
    sinEspanol();
    fireEvent.click(ultimo(screen.getAllByRole("button", { name: /Start offboarding/ })));
    await waitFor(() => expect(escrituras.some((e) => e.tabla === "employee_offboarding_tasks")).toBe(true));
    const tareas = escrituras.find((e) => e.tabla === "employee_offboarding_tasks")!.filas as { category: string; title: string }[];
    expect(tareas[0]).toMatchObject({ category: "Accesos", title: "Revocar correo corporativo" });
    expect(escrituras.find((e) => e.tabla === "employee_offboarding")!.filas).toMatchObject({ termination_reason: "Mejor oferta laboral" });
  });

  it("onboarding: los 3 pasos; la checklist se guarda en español", async () => {
    montar(<HROnboardingNew />);
    await screen.findAllByRole("option", { name: /Laura Smith/ });
    sinEspanol();
    elegir(0, "e1");
    siguiente();
    expect(await screen.findByText("Bank details")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Other" })).toHaveValue("Otro");
    expect(screen.getByRole("option", { name: "Checking" })).toHaveValue("corriente");
    sinEspanol();
    fireEvent.change(screen.getByPlaceholderText("E.g. 2500000"), { target: { value: "2500000" } });
    elegir(1, "Otro");
    fireEvent.change(screen.getByPlaceholderText("E.g. 1234567890"), { target: { value: "123" } });
    siguiente();
    expect(await screen.findByText("Onboarding checklist")).toBeTruthy();
    expect(screen.getByText("Signed contract")).toBeTruthy();
    expect(screen.getByText("Training")).toBeTruthy();
    sinEspanol();
    fireEvent.click(ultimo(screen.getAllByRole("button", { name: /Start onboarding/ })));
    await waitFor(() => expect(escrituras.some((e) => e.tabla === "employee_onboarding_tasks")).toBe(true));
    const tareas = escrituras.find((e) => e.tabla === "employee_onboarding_tasks")!.filas as { category: string; title: string }[];
    expect(tareas[0]).toMatchObject({ category: "Documentación", title: "Contrato firmado" });
    expect(escrituras.find((e) => e.tabla === "employees")!.filas).toMatchObject({ bank_name: "Otro" });
  });

  it("deducción y candidato", async () => {
    const { unmount } = montar(<HRDeductionNew />);
    expect(screen.getByText("Record deduction")).toBeTruthy();
    fireEvent.click(screen.getByText("Infraction"));
    expect(await screen.findByRole("option", { name: "Unexcused absence" })).toHaveValue("ausencia_injustificada");
    expect(screen.getByPlaceholderText("Details of the infraction...")).toBeTruthy();
    sinEspanol();
    unmount();

    montar(<HRApplicantNew />);
    expect(await screen.findByRole("option", { name: "Job board" })).toHaveValue("portal");
    expect(screen.getByPlaceholderText("email@example.com")).toBeTruthy();
    sinEspanol();
  });
});

describe("RRHH › Anuncios y agente en inglés", () => {
  it("el alta en inglés guarda 'toda la empresa' en español", async () => {
    montar(<CreateAnnouncementModal open onOpenChange={() => {}} />);
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByPlaceholderText("Announcement title"), { target: { value: "Welcome" } });
    siguiente();
    siguiente();
    expect(await within(d).findByText("🌐 Global — Visible to everyone")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByRole("button", { name: "Create announcement" }));
    await waitFor(() => expect(escrituras.some((e) => e.tabla === "announcement_audience")).toBe(true));
    const destinos = escrituras.find((e) => e.tabla === "announcement_audience")!.filas as { target_label: string }[];
    expect(destinos[0].target_label).toBe("Toda la empresa");
  });

  it("la edición, con destinatarios guardados en español", async () => {
    const anuncio = {
      id: "an1", title: "Office closed", message: "Closed", content_html: null, announcement_type: "holiday", priority: "low",
      is_active: false, status: "draft", visibility: "segmented", delivery_channels: ["notification"], related_module: "finance",
      recurrence_type: "weekly", recurrence_end_at: null, attachment_url: null, attachment_name: null, image_url: null,
      view_count: 0, open_count: 0, starts_at: HACE, expires_at: null, created_at: HACE, created_by: null, updated_at: HACE,
      audience: [{ id: "x1", announcement_id: "an1", target_type: "role", target_id: "agent", target_label: "Agente" }],
    } as AnnouncementRow;
    montar(<EditAnnouncementModal open onOpenChange={() => {}} announcement={anuncio} />);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Edit announcement")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    siguiente();
    expect(await within(d).findByText("Repeat until")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    siguiente();
    expect(await within(d).findByText("Agent")).toBeTruthy();
    expect(within(d).getByText("Role:")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  const AGENTE = { memberId: "m1", name: "Dana Fox", status: "en_pausa" } as unknown as HubstaffAgent;

  it("el detalle del agente con datos y sin datos", async () => {
    detalleAgente = {
      chartData: [{ label: "09:00", mouse: 50, keyboard: 40 }],
      screenshots: [{ id: "s1", url: null, timestamp: "09:10", activity: 70 }],
      timeline: [],
      kpis: { hours: "6h", productivity: "70%", mouse: "50%", keyboard: "40%" },
      isLoading: false,
      isEmpty: false,
    };
    const { unmount } = montar(<AgentDetailView agent={AGENTE} onBack={() => {}} />);
    expect(screen.getByText("Paused")).toBeTruthy();
    expect(screen.getByText("Keyboard activity")).toBeTruthy();
    expect(screen.getByText("No timeline events recorded for today.")).toBeTruthy();
    sinEspanol();
    fireEvent.click(screen.getByText("09:10"));
    expect(await screen.findByText("Screenshot at 09:10")).toBeTruthy();
    sinEspanol();
    unmount();

    detalleAgente = { ...detalleAgente, isEmpty: true };
    montar(<AgentDetailView agent={{ ...AGENTE, status: "desconectado" } as HubstaffAgent} onBack={() => {}} />);
    expect(screen.getByText("No activity data")).toBeTruthy();
    expect(screen.getByText("Offline")).toBeTruthy();
    sinEspanol();
  });
});
