// LeadGen en INGLÉS: con la app en EN no queda nada visible en español, en
// ninguna pestaña ni en los modales del módulo.
//
// Se monta la pantalla real (LeadGenContent y la Base de Datos) con el
// LanguageProvider de verdad; lo que se reemplaza es solo lo que trae datos
// (hooks de useLeadGen y de cuentas IG, Supabase, permisos). Los componentes
// que LeadGen dibuja desde afuera de pages/leadgen/ (components/leadgen/*, la
// pestaña de cuentas IG de Panel de Control y su alta) se montan DE VERDAD:
// con un doble, su español no se veía y el modal pasaba en verde igual.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esEspanol } from "../i18n/detectarEspanol";
import type { SpammerAccount } from "@/hooks/useSpammerAccounts";
import type { DisponibilidadLead } from "@/pages/leadgen/disponibilidadLead";

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
// Lo que devuelven los hooks: se cambia por test para ver los singulares.
let leadsVisibles = LEADS;
let statsAgentes: Record<string, (typeof AGENT_STATS)["u1"]> = AGENT_STATS;
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
  useLeadGenByDateRange: () => ({ data: { data: leadsVisibles, total: leadsVisibles.length }, isLoading: false }),
  useLeadGenEntries: () => ({ data: { data: leadsVisibles, total: leadsVisibles.length }, isLoading: false }),
  useLeadGenProfiles: () => ({ data: PERFILES }),
  useLeadGenLLGs: () => ({ data: PERFILES, isLoading: false }),
  useLeadGenAgentStats: () => ({ data: statsAgentes }),
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
// Lo que encuentra el buscador de leads del alta de contacto.
const LEAD_BUSCADO = {
  id: "lead-0000001", model_handle: "sofia.model", ticket_number: "LG-7", phone_raw: "3001234567",
  phone_e164: "+573001234567", country_code: "CO", city: "Cali", company: "KASH Agency", platform: "instagram",
  onlyfans_url: null, notes: null, lg_user_id: null,
};
// Las capturas que ya tiene un lead (las muestra EvidenceViewer en su detalle).
const EVIDENCIA = [
  { id: "ev1", file_url: "https://files.test/1.png", file_type: "image/png", uploaded_at: haceUnRato, uploaded_by: "u1" },
];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => cadena(tabla === "leadgen_qa" ? QA : tabla === "leadgen_evidence_files" ? EVIDENCIA : []),
    rpc: (fn: string) => cadena(fn === "leadgen_search_fuzzy" ? [LEAD_BUSCADO] : null),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    storage: { from: () => cadena(null) },
  },
}));
vi.mock("@/lib/lead-validation", () => ({
  checkDuplicateOnlyFans: async () => ({ existsInLeads: false, existsInContacts: false }),
  checkCreatorExists: async () => ({ exists: false }),
  checkExistingContact: async () => ({ exists: false }),
}));
vi.mock("@/lib/avatarFetch", () => ({ enqueueAvatarFetch: async () => {} }));

// ¿Se puede agregar el lead? El chequeo es de verdad salvo la consulta: el test
// elige el motivo y la frase la arma textoDisponibilidad() como en la app.
let disponibilidad: DisponibilidadLead = { kind: "new" };
vi.mock("@/pages/leadgen/disponibilidadLead", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/pages/leadgen/disponibilidadLead")>();
  return { ...real, checkLeadAvailability: async () => disponibilidad };
});

// Cuentas IG (la pestaña de Panel de Control que se ve en "Mis cuentas IG").
// El análisis es de la IA: DATO, va en inglés acá para no ensuciar el recorrido.
const ahora = new Date().toISOString();
const cuentaBase: SpammerAccount = {
  id: "", user_id: "u1", instagram_handle: "", display_name: "Main account", profile_pic_url: null,
  followers_count: 1200, bio: "Talent agency", account_niche: "business", active: true, last_synced_at: null,
  tenant_id: "t1", created_at: ahora, updated_at: ahora, following_count: 300, posts_count: 12, is_verified: true,
  is_restricted: false, manual_screenshot_path: null, manual_screenshot_paths: [], ai_score: null,
  ai_analysis: null, last_scanned_at: null, scan_status: "done", scan_error: null,
};
const CUENTAS: SpammerAccount[] = [
  { ...cuentaBase, id: "acc1", instagram_handle: "kash.talent", ai_score: 72, last_scanned_at: ahora,
    ai_analysis: { score: 72, summary: "Looks legit", would_respond: "no", why_not: "Too few posts",
      strengths: ["Clear bio"], red_flags: [{ signal: "Brand new", severity: "high" }],
      urgent_improvements: ["Post more"], recommendations: ["Add highlights"], scanned_at: ahora } },
  { ...cuentaBase, id: "acc2", instagram_handle: "kash.restricted", is_restricted: true, manual_screenshot_paths: ["p/1.png"] },
  { ...cuentaBase, id: "acc3", instagram_handle: "kash.unread", scan_status: "awaiting_screenshot" },
  { ...cuentaBase, id: "acc4", instagram_handle: "kash.failed", scan_status: "failed" },
  { ...cuentaBase, id: "acc5", instagram_handle: "kash.pending", scan_status: "pending" },
  // La misma cuenta, de otro scouter: en Panel de Control sale "2 scouters use it".
  { ...cuentaBase, id: "acc6", user_id: "u2", instagram_handle: "kash.talent" },
  // Sin dueño conocido: "No scouter assigned".
  { ...cuentaBase, id: "acc7", user_id: "", instagram_handle: "kash.orphan", ai_score: 20 },
];
let cuentas: SpammerAccount[] = CUENTAS;
vi.mock("@/hooks/useSpammerAccounts", () => {
  const mutacion = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, variables: undefined });
  return {
    useSpammerAccounts: () => ({ data: cuentas, isLoading: false }),
    useRescanSpammerAccount: mutacion,
    useUploadSpammerScreenshots: mutacion,
    useRemoveSpammerScreenshot: mutacion,
    useDeleteSpammerAccount: mutacion,
    useInsertSpammerAccount: mutacion,
  };
});
vi.mock("@/hooks/useAgencyQa", () => ({ useTenantProfiles: () => ({ data: PERFILES }) }));
// El selector de fechas es de components/ui/ (su chip "Activo" es de otra
// migración); se dibuja el placeholder que le pasa LeadGen.
vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({ placeholder }: { placeholder?: string }) => <button type="button">{placeholder}</button>,
}));

import LeadGenContent from "@/pages/leadgen/LeadGenContent";
import SpammerAccountsTab from "@/pages/panel-de-control/SpammerAccountsTab";
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
  // Las miniaturas del uploader; jsdom no trae object URLs.
  URL.createObjectURL ??= () => "blob:miniatura";
  URL.revokeObjectURL ??= () => {};
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
    leadsVisibles = LEADS;
    statsAgentes = AGENT_STATS;
    cuentas = CUENTAS;
    disponibilidad = { kind: "new" };
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
    expect(within(dialogo).getByPlaceholderText("Full name (or search for an existing lead)")).toBeTruthy();
    expect(within(dialogo).getByText("4 screenshots missing")).toBeTruthy();
    expect(within(dialogo).getByText("You need at least 4 images to save.")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);

    // Con 3 de 4 capturas: el singular.
    const captura = (n: number) => new File(["x"], `captura-${n}.png`, { type: "image/png" });
    const selector = dialogo.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(selector, { target: { files: [captura(1), captura(2), captura(3)] } });
    expect(await within(dialogo).findByText("1 screenshot missing")).toBeTruthy();
    expect(within(dialogo).getByText("3/8 · 1 missing")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);

    // El buscador de leads, con un resultado y con el lead elegido.
    fireEvent.focus(within(dialogo).getByPlaceholderText("Full name (or search for an existing lead)"));
    fireEvent.change(within(dialogo).getByPlaceholderText("Full name (or search for an existing lead)"), {
      target: { value: "sofia" },
    });
    expect(await within(dialogo).findByText("📞 has a phone")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.click(within(dialogo).getByText("@sofia.model"));
    expect(await within(dialogo).findByTitle("Unlink from the lead")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /My IG accounts/ }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/Instagram accounts you use for outreach/)).toBeTruthy();
    expect(within(dialogo).getByText("Unique accounts")).toBeTruthy(); // la pestaña de verdad
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el alta de lead muestra en inglés por qué no se puede agregar", async () => {
    const hace5Dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    disponibilidad = {
      kind: "blocked", motivo: "exCreadora", nombre: "Ana Model", status: "terminated", desde: hace5Dias, faltanDias: 25,
    };
    envolver(<LeadGenContent />);
    fireEvent.click(await screen.findByRole("button", { name: /Add lead/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByPlaceholderText("https://instagram.com/username"), {
      target: { value: "https://instagram.com/ana.model" },
    });
    expect(await within(dialogo).findByText("Former creator — wait", {}, { timeout: 3000 })).toBeTruthy();
    expect(
      within(dialogo).getByText(
        "Ana Model was terminated 5 days ago. You have to wait 30 days from the status change — 25 days to go.",
      ),
    ).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: /Can't be added/ })).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("los singulares: 1 lead y 1 agente activo", async () => {
    leadsVisibles = LEADS.slice(0, 1);
    statsAgentes = { u1: AGENT_STATS.u1 };
    envolver(<LeadGenContent />);
    expect(await screen.findByText(/· 1 lead$/)).toBeTruthy();
    tab("Agents");
    expect(await screen.findByText(/· 1 active agent$/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Mis cuentas IG: tarjetas, detalle de cada caso, listas, alta y borrado en inglés", async () => {
    envolver(<SpammerAccountsTab viewMode="mine" />);
    expect(await screen.findByText("My IG accounts")).toBeTruthy();
    expect(screen.getByText("Add account")).toBeTruthy();
    expect(screen.getAllByText("Restricted").length).toBeGreaterThan(0);
    expect(screen.getByText("Not read")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    // Detalle con análisis: el "no respondería" y sus listas.
    fireEvent.click(screen.getByText("@kash.talent"));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Why they WOULDN'T reply")).toBeTruthy();
    expect(within(dialogo).getByText("Medium-term recommendations")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Restringida: la guía para recuperarla y la zona de capturas.
    fireEvent.click(screen.getByText("@kash.restricted"));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("How to recover this account")).toBeTruthy();
    expect(within(dialogo).getByText("STOP all outreach")).toBeTruthy(); // la negrita
    expect(within(dialogo).getByText(/1 screenshot uploaded/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // No se pudo leer (no es restricción).
    fireEvent.click(screen.getByText("@kash.unread"));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("We couldn't read the profile automatically")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Las listas de los recuadros.
    for (const [recuadro, resumen] of [
      ["Failed", /^1 account — the scan failed/],
      ["Waiting for scan", /^1 account waiting for or running an AI scan$/],
      ["Unique accounts", /^5 accounts registered in this tenant$/],
    ] as const) {
      fireEvent.click(screen.getByText(recuadro).closest("button")!);
      dialogo = await screen.findByRole("dialog");
      expect(within(dialogo).getByText(resumen)).toBeTruthy();
      expect(enEspanol(dialogo)).toEqual([]);
      fireEvent.keyDown(dialogo, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }

    // Borrar una cuenta.
    fireEvent.click(screen.getAllByTitle("Delete this account")[0]);
    dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/^Delete @kash\./)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    // El alta, con un handle que no sirve.
    fireEvent.click(screen.getByText("Add account").closest("button")!);
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Add IG account")).toBeTruthy();
    fireEvent.change(within(dialogo).getByPlaceholderText("handle or IG link"), { target: { value: "no vale!" } });
    expect(within(dialogo).getByText(/^Only letters, numbers/)).toBeTruthy();
    fireEvent.change(within(dialogo).getByPlaceholderText("handle or IG link"), {
      target: { value: "https://instagram.com/kash.new" },
    });
    expect(within(dialogo).getByText("Detected: @kash.new")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("Mis cuentas IG sin cuentas, y la vista de todo el equipo, en inglés", async () => {
    cuentas = [];
    const { unmount } = envolver(<SpammerAccountsTab viewMode="mine" />);
    expect(await screen.findByText("You don't have any accounts yet")).toBeTruthy();
    expect(screen.getByText("Add my first account")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    unmount();

    cuentas = CUENTAS;
    envolver(<SpammerAccountsTab />);
    expect(await screen.findByText("IG account health")).toBeTruthy();
    expect(screen.getByText("2 scouters use it")).toBeTruthy();
    expect(screen.getByText("No scouter assigned")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.change(screen.getByPlaceholderText("Search handle, name, scouter…"), { target: { value: "zzz" } });
    expect(await screen.findByText("No results for that search")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
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

    // Sus capturas: la miniatura y la imagen grande.
    fireEvent.click((await within(dialogo).findByAltText("evidence 1")).closest("button")!);
    expect(await screen.findByText(/^Image 1 of 1 · Uploaded /)).toBeTruthy();
    expect(screen.getByText("Download")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.keyDown(screen.getByText("Download"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Download")).toBeNull());

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
    leadsVisibles = LEADS;
    statsAgentes = AGENT_STATS;
    envolver(<LeadGenContent />);
    expect(await screen.findByText("Mejor LLG")).toBeTruthy();
    expect(screen.getByText("Teléfonos obtenidos por día")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agregar Lead/ })).toBeTruthy();
    tab("Agentes");
    expect(await screen.findByText("Rendimiento de Agentes")).toBeTruthy();
    expect(screen.getByText("Recup.")).toBeTruthy();
    expect(screen.getByText(/· 2 agentes activos$/)).toBeTruthy();
  });

  it("las cuentas IG y el uploader siguen en español", async () => {
    cuentas = CUENTAS;
    envolver(<SpammerAccountsTab viewMode="mine" />);
    expect(await screen.findByText("Mis cuentas IG")).toBeTruthy();
    expect(screen.getByText("Cuentas únicas")).toBeTruthy();
    fireEvent.click(screen.getByText("@kash.restricted"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("PARAR todo outreach")).toBeTruthy();
    expect(within(dialogo).getByText("1 screenshot cargado — el análisis usa la data real")).toBeTruthy();
  });
});
