// LeadGen en INGLÉS: con la app en EN no queda nada visible en español, en
// ninguna pestaña ni en los modales del módulo.
//
// Se monta la pantalla real (LeadGenContent y la Base de Datos) con el
// LanguageProvider de verdad; lo que se reemplaza es solo lo que trae datos
// (hooks de useLeadGen, Supabase, permisos) y los componentes que NO son de
// pages/leadgen/ (components/leadgen/*, la pestaña de cuentas IG de Panel de
// Control): esos tienen su propia migración y no deben tapar ni ensuciar esta.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esEspanol } from "../i18n/detectarEspanol";

// ── Datos ────────────────────────────────────────────────────────────────
const hoy = new Date();
const haceUnRato = new Date(hoy.getTime() - 20 * 60 * 1000).toISOString();
const esteMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 12).toISOString();

const PERFILES = [
  { id: "u1", full_name: "Laura Gomez" },
  { id: "u2", full_name: "Pedro Ruiz" },
  { id: "u3", full_name: null },
];

const base = {
  platform: "instagram", status: "no_response", notes: null, updated_at: haceUnRato,
  phone_raw: null, phone_e164: null, created_creator_id: null, ticket_number: null,
  state: null, city: null, company: "KASH Agency", onlyfans_url: null, entry_date: haceUnRato.slice(0, 10),
};
const LEADS = [
  { ...base, id: "lead-0000001", lg_user_id: "u1", model_handle: "sofia.model", quality: "A+", source_link: "https://instagram.com/sofia.model",
    created_at: haceUnRato, country_code: "CO", phone_raw: "3001234567", phone_e164: "+573001234567", notes: "Replied fast", record_type: "nuevo" },
  { ...base, id: "lead-0000002", lg_user_id: "u2", model_handle: "maria.fit", quality: "B", source_link: null,
    created_at: esteMes, country_code: "MX", onlyfans_url: "maria", record_type: "reactivado", ticket_number: "LG-22" },
  // Sin agente conocido → la tabla ofrece "vincular agente".
  { ...base, id: "lead-0000003", lg_user_id: "ghost", model_handle: "nadie", quality: "C", source_link: null,
    created_at: esteMes, country_code: null, company: null, record_type: "nuevo" },
];
const QA = [
  { id: "qa1", entry_id: "lead-0000001", supervisor_id: "u2", score: "A", rating: "bien", comment: "Great profile", created_at: haceUnRato },
];
const AGENT_STATS = {
  u1: { total: 12, byQuality: { "a+": 3, a: 4, "b+": 2, b: 2, c: 1 }, firstLead: esteMes, phones: 1, nuevos: 10, recuperacion: 2 },
  u2: { total: 7, byQuality: { "a+": 0, a: 2, "b+": 1, b: 3, c: 1 }, firstLead: esteMes, phones: 4, nuevos: 5, recuperacion: 2 },
};
const PHONES_DAILY = [
  { date: "2026-09-01", count: 2, label: "01/09" },
  { date: "2026-09-02", count: 1, label: "02/09" },
];

// ── Mocks ────────────────────────────────────────────────────────────────
let alcance: "self" | "subordinates" | "all" = "all";
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ dataScope: () => alcance, isLoading: false }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, isSupervisor: true }) }));
vi.mock("@/hooks/useScouterLeads", () => ({
  useScouterCompanies: () => ({ data: [{ id: "c1", name: "KASH Agency" }] }),
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/pages/leadgen/useLeadGen", () => {
  // Adentro de la fábrica: vi.mock se iza arriba de todo el archivo.
  const mutacion = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
  useLeadGenByDateRange: () => ({ data: { data: LEADS, total: LEADS.length }, isLoading: false }),
  useLeadGenEntries: () => ({ data: { data: LEADS, total: LEADS.length }, isLoading: false }),
  useLeadGenProfiles: () => ({ data: PERFILES }),
  useLeadGenLLGs: () => ({ data: PERFILES, isLoading: false }),
  useLeadGenAgentStats: () => ({ data: AGENT_STATS }),
  useLeadGenSummaryStats: () => ({ data: { total: 19, qa: 1, byQuality: { "a+": 3, a: 6, "b+": 3, b: 5, c: 2 } } }),
  useLeadGenPhonesDaily: () => ({ data: PHONES_DAILY, isLoading: false }),
  useLeadGenQA: () => ({ data: QA }),
  useLeadGenAgentLeads: (agentId: string | null) => ({ data: agentId ? LEADS : [], isLoading: false }),
  useUpdateLeadQuality: mutacion,
  useUpdateLeadField: mutacion,
  useCreateQAReview: mutacion,
  useUpdateLeadCategoria: mutacion,
  };
});

// Supabase: cualquier cadena de la query builder termina en { data, error }.
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
    from: (tabla: string) => cadena(tabla === "leadgen_qa" ? QA : []),
    rpc: () => cadena(null),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    storage: { from: () => cadena(null) },
  },
}));
vi.mock("@/lib/lead-validation", () => ({
  checkLeadAvailability: async () => ({ kind: "new" }),
  checkDuplicateOnlyFans: async () => ({ existsInLeads: false, existsInContacts: false }),
  checkCreatorExists: async () => ({ exists: false }),
  checkExistingContact: async () => ({ exists: false }),
}));
vi.mock("@/lib/avatarFetch", () => ({ enqueueAvatarFetch: async () => {} }));

// Fuera de pages/leadgen/: se dibuja lo que LeadGen les PASA (label y
// description del uploader sí son de acá), no su texto propio.
vi.mock("@/components/leadgen/EvidenceUploader", () => ({
  default: ({ label, description }: { label: string; description: string }) => (
    <div><span>{label}</span><p>{description}</p></div>
  ),
}));
vi.mock("@/components/leadgen/EvidenceViewer", () => ({ default: () => null }));
vi.mock("@/components/leadgen/LeadAutocomplete", () => ({
  LeadAutocomplete: ({ value, onTypedChange }: { value: string; onTypedChange: (v: string) => void }) => (
    <input value={value} onChange={(e) => onTypedChange(e.target.value)} />
  ),
}));
vi.mock("@/pages/panel-de-control/SpammerAccountsTab", () => ({ default: () => null }));
// El selector de fechas es de components/ui/ (su chip "Activo" es de otra
// migración); se dibuja el placeholder que le pasa LeadGen.
vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ placeholder }: { placeholder?: string }) => <button type="button">{placeholder}</button>,
}));

import LeadGenContent from "@/pages/leadgen/LeadGenContent";
import LeadGenBaseDatosContent from "@/pages/leadgen/LeadGenBaseDatosContent";
import DeleteLeadDialog from "@/pages/leadgen/DeleteLeadDialog";
import AssignCalidadModal from "@/pages/leadgen/AssignCalidadModal";
import LeadGenEstadosCard from "@/pages/leadgen/LeadGenEstadosCard";
import type { LeadGenEntry } from "@/pages/leadgen/useLeadGen";

// ── Utilidades ───────────────────────────────────────────────────────────
beforeAll(() => {
  // recharts (ResponsiveContainer) y cmdk lo piden; jsdom no lo trae.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

/** Todo el texto visible (sin lo que es código) y los atributos que se leen. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const padre = n.parentElement;
    if (padre?.closest("code, pre, script, style")) continue;
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
const enEspanol = (raiz: HTMLElement = document.body) => textosVisibles(raiz).filter((t) => esEspanol(t));

function envolver(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LanguageProvider>{ui}</LanguageProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const tab = (nombre: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${nombre}$`) }));

describe("LeadGen en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    alcance = "all";
  });

  it("el encabezado y el Dashboard no tienen nada en español", async () => {
    envolver(<LeadGenContent />);
    expect(await screen.findByText("Top LLG")).toBeTruthy();
    expect(screen.getByText("Lead management", { exact: false })).toBeTruthy();
    expect(screen.getByText("Phones collected per day")).toBeTruthy();
    expect(screen.getByText("4 phones")).toBeTruthy(); // Top 3: "{n} tel" → palabra entera
    expect(enEspanol()).toEqual([]);
  });

  it("la pestaña Leads (tabla y grilla) está en inglés", async () => {
    envolver(<LeadGenContent />);
    tab("Leads");
    expect(await screen.findByText("@sofia.model")).toBeTruthy();
    expect(screen.getByText("Reactivated")).toBeTruthy();
    expect(screen.getByText("Good")).toBeTruthy(); // QA "bien"
    expect(enEspanol()).toEqual([]);

    // La revisión QA de un lead sin revisar.
    fireEvent.click(screen.getAllByText("Review")[0]);
    expect(await screen.findByText("Rate lead")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Agentes (tabla, tarjetas y calendario), Supervisores y Rendimiento están en inglés", async () => {
    envolver(<LeadGenContent />);
    tab("Agents");
    expect(await screen.findByText("Agent performance")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    const botonDe = (clase: string) => document.querySelector(`svg.${clase}`)!.closest("button")!;
    fireEvent.click(botonDe("lucide-layout-grid"));
    expect(screen.getByText("(10 new · 2 rec.)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(botonDe("lucide-calendar"));
    expect(screen.getByText(/^MON /)).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    tab("Supervisors");
    expect(await screen.findByText("Supervisor activity")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    tab("Performance");
    expect(await screen.findByText("Performance by agent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Select agent/ }));
    fireEvent.click(await screen.findByText("Laura Gomez"));
    expect(await screen.findByText("Leads by hour of day")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("el detalle de un agente (sus tres pestañas) está en inglés", async () => {
    envolver(<LeadGenContent />);
    tab("Agents");
    fireEvent.click(await screen.findByText("Pedro Ruiz"));
    expect(await screen.findByText("Agent detail")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    tab("Performance");
    expect(await screen.findByText("Summary of the selected range")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    tab("QA / Feedback");
    expect(await screen.findByText("Leads with QA done:")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la vista del agente (sus leads y el rendimiento por hora) está en inglés", async () => {
    alcance = "self";
    envolver(<LeadGenContent />);
    expect(await screen.findByText("Your leads", { exact: false })).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    tab("Hourly performance");
    expect(await screen.findByText("Active time")).toBeTruthy();
    expect(screen.getByText("Excellent")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("los modales de alta (lead y contacto) y el de cuentas IG están en inglés, validación incluida", async () => {
    envolver(<LeadGenContent />);
    fireEvent.click(await screen.findByRole("button", { name: /Add lead/ }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("New lead")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: /Save lead/ }));
    expect(await within(dialogo).findByText("Profile URL required")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Add contact/ }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("New contact")).toBeTruthy();
    expect(within(dialogo).getByText("4 screenshots missing")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /My IG accounts/ }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/Instagram accounts you use for outreach/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("ver un lead y convertirlo a Closers está en inglés", async () => {
    envolver(<LeadGenContent />);
    tab("Leads");
    // El handle es un link (no abre el lead); la celda del agente sí.
    await screen.findByText("@maria.fit");
    fireEvent.click(screen.getByText("Pedro Ruiz"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Entry date")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);

    fireEvent.click(within(dialogo).getByRole("button", { name: /Convert to contact/ }));
    expect(await screen.findByText("Convert lead to the Closers pipeline")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la Base de Datos (leads y análisis) está en inglés", async () => {
    envolver(<LeadGenBaseDatosContent />);
    expect(await screen.findByText("CURRENT PAGE")).toBeTruthy();
    // Las dos claves alrededor del número, con sus espacios.
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "Showing: 3 of 3 leads (page 1 of 1)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Analysis/ }));
    expect(await screen.findByText("Trend, last 30 days")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("borrar un lead, asignar calidad y la tarjeta de estados están en inglés", async () => {
    const lead = LEADS[0] as unknown as LeadGenEntry;
    envolver(
      <>
        <DeleteLeadDialog open onOpenChange={() => {}} lead={lead} />
        <LeadGenEstadosCard leads={LEADS as unknown as LeadGenEntry[]} />
      </>,
    );
    expect(await screen.findByText("Delete lead")).toBeTruthy();
    expect(screen.getByText("Not interested")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("asignar calidad está en inglés", async () => {
    envolver(<AssignCalidadModal open onOpenChange={() => {}} lead={LEADS[1] as unknown as LeadGenEntry} />);
    expect(await screen.findByText("Current quality")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("LeadGen en español sigue igual", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "es");
    alcance = "all";
  });

  it("muestra el texto de siempre", async () => {
    envolver(<LeadGenContent />);
    expect(await screen.findByText("Mejor LLG")).toBeTruthy();
    expect(screen.getByText("Teléfonos obtenidos por día")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agregar Lead/ })).toBeTruthy();
    tab("Agentes");
    expect(await screen.findByText("Rendimiento de Agentes")).toBeTruthy();
    expect(screen.getByText("Recup.")).toBeTruthy();
  });
});
