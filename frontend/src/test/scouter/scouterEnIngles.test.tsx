// Scouter Assist en INGLÉS: nada visible en español en ninguna pestaña, ni en los
// popups que se abren desde ellas (el lead, pasar a Closers, agregar lead, la
// compañía con el asistente IA, el detalle del spammer, el alta de cuentas).
//
// Se monta la pantalla REAL (ScouterAssist con sus pestañas) con el
// LanguageProvider de verdad; solo se reemplazan los hooks que leen la base. Los
// datos de prueba están en inglés a propósito: lo que se mira es el texto de la
// pantalla, no el de la base (una bio o un país vienen como vienen).
//
// Además de `esEspanol`, cada texto se compara contra el lado `es` del
// diccionario: así se ve un t() que alguien devolvió a texto a mano aunque la
// frase no tenga acento ni una palabra de la lista del detector ("Detener
// escaneo", "Saltar").
//
// Y lo que NO se traduce también se prueba: los submódulos de permisos que se
// consultan siguen siendo las llaves en español de role_permissions, el prompt
// de "Llena igual" le llega a la IA en español aunque en pantalla se lea en
// inglés, el balde "Sin país" sigue siendo el value del filtro y el aviso de
// error del asistente no se le manda a la IA.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

const estado = vi.hoisted(() => ({
  rol: "admin" as "admin" | "spammer",
  cuentas: [] as unknown[],
  permisos: [] as string[],
  invocaciones: [] as Array<{ fn: string; body: Record<string, unknown> }>,
  respuestasIa: [] as unknown[],
  paisPedido: undefined as string | undefined,
}));

// El popover de los selectores (Radix) se mide con ResizeObserver, y jsdom no lo trae.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const HOY = new Date().toISOString().slice(0, 10);

const LEAD = {
  id: "l1", company_id: "c1", instagram_handle: "sunny.days", instagram_url: null, name: "Sunny Days",
  phone: "+573001234567", country: "Colombia", city: "Medellin", category: "A", status: "contacting",
  platform: "instagram", onlyfans_url: "https://onlyfans.com/sunny", followers: 15400, bio: "Travel and fitness",
  verified: true, photo_data_url: null, ai_score: 8.2, ai_status: "high_fit", ai_reason: "Strong engagement; Matches the niche",
  link_in_bio_platform: "linktree", prefilter_score: 0, discovery_source: "hashtag", contact_account: null,
  target_companies: ["acme"], assigned_closer: null, sub_product: null, assigned_agency: null, monetization_usd: null,
  split_pct: null, notes: null, date_added: null, date_contacted: null, date_confirmed: null, date_active: null,
  date_rejected: null, contact_touches: [], created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z",
  converted_at: null, converted_to_contact_id: null, tenant_id: "t1", lookalike_score: 0.8, lookalike_seed_handle: "seed.one",
};
const LEAD_CONVERTIDO = {
  ...LEAD, id: "l2", instagram_handle: "moon.light", name: null, status: "rejected", bio: null, ai_reason: null,
  converted_at: "2026-09-21T10:00:00Z", verified: false, lookalike_score: null, lookalike_seed_handle: null,
};
const COMPANIAS = [
  {
    id: "c1", slug: "acme", name: "Acme Models", description: "Talent agency", active: true,
    logo_dark_url: null, logo_light_url: null,
    search_config: {
      ai_generated_at: "2026-09-01T00:00:00Z", content_type: "adult", profile_tier: "premium",
      followers_min: 10000, followers_max: 100000, geo_targets: ["LATAM"], target_countries: ["Colombia"],
      hashtags: ["fitgirl"], seed_accounts: ["seed.one"],
    },
  },
  { id: "c2", slug: "beta", name: "Beta Studio", description: null, active: false, logo_dark_url: null, logo_light_url: null, search_config: {} },
];
const CUENTA = {
  id: "acc1", user_id: "u1", instagram_handle: "my.account", display_name: "Main account", profile_pic_url: null,
  account_niche: "fitness", active: false,
};
const ASIGNACIONES = [
  {
    id: "a1", spammer_id: "s1", lead_id: "l1", assigned_date: HOY, ai_strategy: "multi_account",
    ai_reasoning: "Similar audience", priority: 1, status: "pending", lead: LEAD,
    tasks: [
      { id: "t1", assignment_id: "a1", from_account_id: "acc1", task_type: "follow", instruction: "Follow the profile",
        suggested_comment: null, status: "pending", screenshot_url: null, from_account: CUENTA },
      { id: "t2", assignment_id: "a1", from_account_id: "acc1", task_type: "comment", instruction: "Leave a comment",
        suggested_comment: "Love this!", status: "pending", screenshot_url: null, from_account: CUENTA },
      { id: "t3", assignment_id: "a1", from_account_id: "acc1", task_type: "story_react", instruction: "React to the story",
        suggested_comment: null, status: "done", screenshot_url: null, from_account: CUENTA },
    ],
  },
];

const mutacion = () => ({
  mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve()), isPending: false, isSuccess: false,
});
const consulta = (data: unknown) => ({ data, isLoading: false });

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canAccess: (_m: string, sub?: string) => {
      if (sub) estado.permisos.push(sub);
      return true;
    },
    dataScope: () => (estado.rol === "admin" ? "all" : "self"),
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({
    role: estado.rol, isAdmin: estado.rol === "admin", isManager: false,
    isSpammer: estado.rol === "spammer", isLoading: false,
  }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useAgencyQa", () => ({ useCurrentTenantId: () => ({ data: "t1", isLoading: false }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/lib/avatarFetch", () => ({ enqueueAvatarFetch: () => Promise.resolve() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
    functions: {
      invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
        estado.invocaciones.push({ fn, body: opts.body });
        return Promise.resolve({ data: estado.respuestasIa.shift() ?? null, error: null });
      },
    },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  },
}));
vi.mock("@/hooks/useScouterLeads", () => ({
  useScouterLeads: (f: { country?: string }) => {
    estado.paisPedido = f.country;
    return consulta({ leads: [LEAD, LEAD_CONVERTIDO], total: 200 });
  },
  useScouterStats: () => consulta({ total: 200, contactedDistinct: 40, interested: 12, noResponse: 9 }),
  useScouterCompanies: () => consulta(COMPANIAS),
  useScouterCompaniesAll: () => consulta(COMPANIAS),
  // "Sin país" es el balde que arma el hook para los leads sin país (country NULL).
  useScouterCountries: () => consulta([{ country: "Colombia", count: 12 }, { country: "Sin país", count: 3 }]),
  useLeadFavoriteIds: () => consulta(new Set(["l1"])),
  useToggleLeadFavorite: () => mutacion(),
  useUpdateLead: () => mutacion(),
  useDiscardLead: () => mutacion(),
  useCreateLeadManual: () => mutacion(),
  useCreateCompany: () => mutacion(),
  useUpdateCompany: () => mutacion(),
  useScouterFunnel: () => consulta({
    funnel: { discovered: 100, contacted: 40, confirmed: 12, active: 5, rejected: 7, discarded: 3 },
    rates: { contactRate: 0.4, confirmRate: 0.3, closeRate: 0.4, overall: 0.05 },
    topSources: [{ source: "hashtag", count: 60 }],
    perCompany: [{ company_id: "c1", total: 80, active: 4 }],
  }),
  useScouterJobs: () => consulta([
    { id: "j1", kind: "discover_hashtag", status: "queued", payload: { hashtag: "fitgirl" }, created_at: "2026-09-25T10:00:00Z", started_at: null, completed_at: null, last_error: null },
    { id: "j2", kind: "discover_seed", status: "running", payload: { seeds: ["a", "b"] }, created_at: "2026-09-25T10:01:00Z", started_at: "2026-09-25T10:01:00Z", completed_at: null, last_error: null },
    { id: "j3", kind: "score_lead", status: "done", payload: { leadId: "12345678abcdef" }, created_at: "2026-09-25T10:02:00Z", started_at: null, completed_at: "2026-09-25T10:03:00Z", last_error: null },
    { id: "j4", kind: "discover_hashtag", status: "failed", payload: { hashtag: "x" }, created_at: "2026-09-25T10:04:00Z", started_at: null, completed_at: "2026-09-25T10:05:00Z", last_error: null },
  ]),
  useScouterJobCounts: () => consulta({ running: 1, queued: 2, queuedByKind: { discover: 1, score: 1, enrich: 0 } }),
  useEnqueueDiscoverySeed: () => mutacion(),
  useEnqueueDiscoveryHashtag: () => mutacion(),
  useCancelScouterJob: () => mutacion(),
  useScouterApifyBudget: () => consulta({ est_spend_usd: 1.5, runs_count: 3, items_processed: 120 }),
  useScouterAutopilot: () => consulta({ active: true, paused_reason: null }),
  useToggleScouterAutopilot: () => mutacion(),
  useSetAutopilotCompaniesFilter: () => mutacion(),
  useRecentDiscoveredLeads: () => consulta([
    { id: "l1", instagram_handle: "sunny.days", name: null, country: "Colombia", followers: 15400, ai_score: 8.2, ai_status: "high_fit", company_id: "c1", created_at: "2026-09-25T10:06:00Z" },
  ]),
}));
vi.mock("@/hooks/useSpammerTasks", () => ({
  TOP_UP_TARGET: 200,
  getTopUpCooldownRemaining: () => 0,
  useDailyAssignments: () => consulta(ASIGNACIONES),
  useGenerateTasks: () => mutacion(),
  useCompleteTask: () => mutacion(),
  useSkipTask: () => mutacion(),
  useUploadScreenshot: () => mutacion(),
  useSpammerAlerts: () => consulta([
    { spammer_id: "s1", spammer_name: "Alex", date: "2026-09-24", total_assignments: 10, done: 4, pending: 6, pending_tasks: 15 },
    // Así llega del hook un spammer sin full_name.
    { spammer_id: "s2", spammer_name: "(sin nombre)", date: "2026-09-24", total_assignments: 2, done: 0, pending: 2, pending_tasks: 3 },
  ]),
}));
vi.mock("@/hooks/useSpammerAccounts", () => ({
  useSpammerAccounts: () => consulta(estado.cuentas),
  useInsertSpammerAccount: () => mutacion(),
  useUpdateSpammerAccount: () => mutacion(),
  useDeleteSpammerAccount: () => mutacion(),
}));
vi.mock("@/hooks/useSpammerProgress", () => ({
  useSpammerProgress: () => consulta([
    { spammer_id: "s1", spammer_name: null, total_tasks: 10, completed_tasks: 4, pending_tasks: 6, completion_rate: 0.4 },
  ]),
}));
vi.mock("@/hooks/useSpammerDetail", () => ({
  useSpammerDetail: () => consulta([
    {
      id: "a1", ai_strategy: "warm_approach", ai_reasoning: "Good fit", status: "pending", priority: 1,
      created_at: "2026-09-25T10:00:00Z", completed_at: null,
      lead: { id: "l1", instagram_handle: "sunny.days", bio: null, ai_score: 8, profile_pic_url: null },
      tasks: [
        { id: "d1", task_type: "comment", instruction: "Comment on the last post", suggested_comment: "Nice!", status: "pending",
          screenshot_url: null, signed_screenshot_url: null, completed_at: null, sort_order: 1,
          from_account: { instagram_handle: "my.account", profile_pic_url: null } },
        { id: "d2", task_type: "story_react", instruction: "React to the story", suggested_comment: null, status: "skipped",
          screenshot_url: null, signed_screenshot_url: null, completed_at: null, sort_order: 2, from_account: null },
      ],
    },
  ]),
}));

import ScouterAssist from "@/pages/scouter/ScouterAssist";
import MisTareas from "@/pages/scouter/MisTareas";

/** Todo el texto visible (sin lo que es código) y los atributos que se leen. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, style, script")) continue;
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

// El lado `es` del diccionario que en inglés dice otra cosa. Se descarta lo que
// también es el `en` de alguna clave (eso puede estar bien en pantalla) y lo que
// no tiene al menos 3 letras propias.
const EN_DE_ALGUNA_CLAVE = new Set(Object.values(translations).map((v) => v.en.trim()));
const VARIABLE = /\{\w+\}/; // sin /g: .test() y .split() no guardan estado
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ES_EXACTO = new Set<string>();
const esPlantillas: string[] = [];
for (const { es, en } of Object.values(translations)) {
  const s = es.trim();
  if (s === en.trim() || EN_DE_ALGUNA_CLAVE.has(s)) continue;
  const partes = s.split(VARIABLE);
  if (partes.join("").replace(/[^\p{L}]/gu, "").length < 3) continue;
  if (partes.length > 1) esPlantillas.push(partes.map(escapar).join(".+?"));
  else ES_EXACTO.add(s);
}
const ES_PLANTILLA = new RegExp(`^(?:${esPlantillas.join("|")})$`, "su");
const esDelDiccionario = (t: string) => ES_EXACTO.has(t) || ES_PLANTILLA.test(t);

/** El texto entero de cada elemento que solo tiene texto adentro: una frase
 *  armada con {variables} en el JSX llega partida en varios nodos de texto. */
function frasesEnteras(raiz: HTMLElement): string[] {
  return Array.from(raiz.querySelectorAll("*"))
    .filter((el) => el.children.length === 0 && !el.closest("code, pre, style, script"))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const enEspanol = (raiz: HTMLElement = document.body) => [
  ...textosVisibles(raiz).filter((t) => esEspanol(t) || esDelDiccionario(t)),
  ...frasesEnteras(raiz).filter((t) => esDelDiccionario(t)),
];

function montar(ui = <ScouterAssist />) {
  // Pasar a Closers usa useMutation directo (no un hook de los mockeados).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Las pestañas de Radix se activan con mousedown, no con click. */
function abrirPestana(nombre: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name: nombre }), { button: 0 });
}

describe("Scouter Assist en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    estado.rol = "admin";
    estado.cuentas = [CUENTA];
    estado.permisos.length = 0;
    estado.invocaciones.length = 0;
    estado.respuestasIa.length = 0;
  });

  it("Home: tarjetas, filtros y paginación", () => {
    montar();
    expect(screen.getByText("Total scouted")).toBeTruthy();
    expect(screen.getByText("Page 1 of 4")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Home", "Searches", "Favorites", "Leads", "Analytics", "Settings", "My tasks", "Alerts",
    ]);
    expect(enEspanol()).toEqual([]);
  });

  it("el filtro de país en Home y en Búsquedas: el balde sin país", async () => {
    // Un combobox no toma el nombre de su contenido: se lo busca por el texto.
    const selectorDePais = (texto: string) =>
      screen.getAllByRole("combobox").filter((el) => el.textContent === texto);
    montar();
    for (const pestana of ["Home", "Searches"]) {
      abrirPestana(pestana);
      const [selector] = selectorDePais("All countries");
      fireEvent.click(selector);
      const sinPais = await screen.findByRole("option", { name: "🌍 No country (3)" });
      expect(screen.getByRole("option", { name: "🇨🇴 Colombia (12)" })).toBeTruthy();
      expect(enEspanol()).toEqual([]);
      fireEvent.click(sinPais);
      // Se lee en inglés, pero lo que se filtra es el balde del hook (IS NULL).
      expect(selectorDePais("🌍 No country (3)")).toHaveLength(1);
      expect(estado.paisPedido).toBe("Sin país");
      expect(enEspanol()).toEqual([]);
    }
  });

  it("el popup del lead: leyendo, editando, descartando y pasando a Closers", async () => {
    montar();
    fireEvent.click(screen.getAllByText("@sunny.days")[0].closest("button")!);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Qualifying companies")).toBeTruthy();
    expect(within(dialogo).getAllByText("Contacting").length).toBe(2);
    // El detector no ve toda palabra española ("Analisis IA" no tiene acento ni
    // palabra de la lista): lo que más se ve, se nombra.
    expect(within(dialogo).getByText("AI analysis")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);

    fireEvent.click(within(dialogo).getByRole("button", { name: /Edit/ }));
    expect(within(dialogo).getByPlaceholderText("Closer name")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);

    fireEvent.click(within(dialogo).getByRole("button", { name: "Discard" }));
    const alerta = await screen.findByRole("alertdialog");
    expect(within(alerta).getByText("Discard this lead?")).toBeTruthy();
    expect(enEspanol(alerta)).toEqual([]);
    fireEvent.click(within(alerta).getByRole("button", { name: "Cancel" }));

    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /Move to Closers pipeline/ }));
    // Radix esconde (aria-hidden) el popup del lead cuando se abre este encima.
    const convertir = (await screen.findByText("Data that will be transferred")).closest<HTMLElement>("[role=dialog]")!;
    expect(within(convertir).getByRole("heading", { name: "Move to Closers pipeline" })).toBeTruthy();
    expect(convertir.querySelector("code")?.textContent).toBe("source='scouter'");
    expect(enEspanol(convertir)).toEqual([]);
  });

  it("Búsquedas: consola, detener escaneo y selector de compañías", async () => {
    montar();
    abrirPestana("Searches");
    expect(screen.getByText("1 running · 2 queued")).toBeTruthy();
    expect(screen.getByText(/\[hashtag\] queued — #fitgirl/)).toBeTruthy();
    expect(screen.getByText("[hashtag] ✗ unknown error")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /^Stop$/ }));
    const detener = await screen.findByRole("dialog");
    expect(within(detener).getByText("Stop scan")).toBeTruthy();
    expect(within(detener).getByText("There's 1 job running. Cancel all?")).toBeTruthy();
    expect(enEspanol(detener)).toEqual([]);
    fireEvent.click(within(detener).getByRole("button", { name: "Back" }));

    fireEvent.click(screen.getByRole("button", { name: /Companies \(all\)/ }));
    const selector = await screen.findByRole("dialog");
    expect(within(selector).getByText("All companies")).toBeTruthy();
    expect(enEspanol(selector)).toEqual([]);
  });

  it("Favoritas, Leads (con el alta manual), Analytics y Alertas", async () => {
    montar();
    abrirPestana("Favorites");
    expect(enEspanol()).toEqual([]);

    abrirPestana("Leads");
    expect(screen.getByText("2 of ≤200")).toBeTruthy();
    expect(screen.getByText("Discovered")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Add lead/ }));
    const alta = await screen.findByRole("dialog");
    expect(within(alta).getByText("Add lead manually")).toBeTruthy();
    expect(enEspanol(alta)).toEqual([]);
    fireEvent.click(within(alta).getByRole("button", { name: "Cancel" }));

    abrirPestana("Analytics");
    expect(screen.getByText("Overall conversion (discovered → active)")).toBeTruthy();
    expect(screen.getAllByText("Team progress").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);

    abrirPestana("Alerts");
    expect(screen.getByText("2 spammers · 18 pending tasks")).toBeTruthy();
    expect(screen.getByText("(no name)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Settings: compañías, el formulario con el asistente IA, cuentas y generación", async () => {
    montar();
    abrirPestana("Settings");
    expect(screen.getByText("Spammer accounts")).toBeTruthy();
    expect(screen.getByText("Daily generation")).toBeTruthy();
    expect(screen.getByText(/No AI configuration — edit it and use "Improve with AI"/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /New company/ }));
    const form = await screen.findByRole("dialog");
    expect(within(form).getByText("Logo for dark mode")).toBeTruthy();
    expect(enEspanol(form)).toEqual([]);

    // El asistente pregunta; "Fill anyway" manda el prompt EN ESPAÑOL a la IA y
    // en pantalla se lee en inglés.
    estado.respuestasIa.push({ ready: false, question: "Which niche?" }, { ready: true, config: {}, summary: "All good" });
    fireEvent.change(within(form).getByPlaceholderText(/Management agency/), { target: { value: "Agency" } });
    fireEvent.click(within(form).getByRole("button", { name: /Improve with AI/ }));
    await within(form).findByText("Which niche?");
    fireEvent.click(within(form).getByRole("button", { name: "Fill anyway" }));
    await within(form).findByText("✓ Done. All good");
    expect(within(form).getByText(/Fill in the config with your best guess/)).toBeTruthy();
    const ultima = estado.invocaciones[estado.invocaciones.length - 1];
    const mensajes = ultima.body.messages as Array<Record<string, unknown>>;
    expect(mensajes[mensajes.length - 1]).toEqual({
      role: "user",
      content: "Llena la config con la mejor inferencia que tengas con la info actual; no preguntes más. Si dudas, deja las dudas en scoring_notes.",
    });
    expect(enEspanol(form)).toEqual([]);
  });

  it("Settings: si el asistente falla, el aviso se lee en inglés y NO se le manda a la IA", async () => {
    montar();
    abrirPestana("Settings");
    fireEvent.click(screen.getByRole("button", { name: /New company/ }));
    const form = await screen.findByRole("dialog");
    // Sin respuesta en la cola, invoke devuelve data null: "respuesta vacía".
    fireEvent.change(within(form).getByPlaceholderText(/Management agency/), { target: { value: "Agency" } });
    fireEvent.click(within(form).getByRole("button", { name: /Improve with AI/ }));
    await within(form).findByText("Error: The assistant sent an empty response");
    expect(enEspanol(form)).toEqual([]);

    estado.respuestasIa.push({ ready: false, question: "Which niche?" });
    fireEvent.change(within(form).getByPlaceholderText("Answer the question…"), { target: { value: "Fitness models" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send" }));
    await within(form).findByText("Which niche?");
    // El aviso sigue en pantalla, pero la IA solo ve lo que escribió la persona.
    expect(within(form).getByText("Error: The assistant sent an empty response")).toBeTruthy();
    const ultima = estado.invocaciones[estado.invocaciones.length - 1];
    expect(ultima.body.messages).toEqual([{ role: "user", content: "Fitness models" }]);
  });

  it("Mis Tareas: tarjetas de tareas, progreso y el detalle de un spammer", async () => {
    montar();
    abrirPestana("My tasks");
    expect(screen.getByText("Why this lead")).toBeTruthy();
    expect(screen.getByText("Attach the comment screenshot")).toBeTruthy();
    expect(screen.getByText("Multi-account")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Skip$/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Skip all/ })).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByText("No name").closest("tr")!);
    const detalle = await screen.findByRole("dialog");
    expect(within(detalle).getByText("Waiting for the comment screenshot")).toBeTruthy();
    expect(enEspanol(detalle)).toEqual([]);
  });

  it("el alta de cuentas del spammer, paso por paso", async () => {
    estado.rol = "spammer";
    estado.cuentas = [];
    montar(<MisTareas />);
    expect(screen.getByText("Register your Instagram accounts")).toBeTruthy();
    const primera = screen.getByPlaceholderText("Account 1 (required)");
    fireEvent.change(primera, { target: { value: "bad handle!" } });
    expect(screen.getByText("Only letters, numbers, periods and underscores (max 30).")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.change(primera, { target: { value: "@good.handle" } });
    fireEvent.click(screen.getByRole("button", { name: /Verify accounts/ }));
    expect(screen.getByText(/We found 1 account\./)).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: /Set up accounts/ }));
    expect(screen.getByText("Label and niche")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("Scouter Assist: lo que NO se traduce", () => {
  beforeEach(() => {
    localStorage.clear();
    estado.rol = "admin";
    estado.cuentas = [CUENTA];
    estado.permisos.length = 0;
  });

  it("los permisos se consultan con las llaves de siempre, en los dos idiomas", () => {
    for (const idioma of ["en", "es"]) {
      localStorage.setItem("app-language", idioma);
      estado.permisos.length = 0;
      const { unmount } = montar();
      expect(new Set(estado.permisos)).toEqual(new Set([
        "Home", "Busquedas", "Favoritas", "Leads", "Funnel", "Settings", "Mis Tareas", "Alertas",
      ]));
      unmount();
    }
  });

  it("en español la pantalla sigue diciendo lo de antes", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    expect(screen.getByText("Total scouteadas")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Mis Tareas" })).toBeTruthy();
    expect(screen.getByText("Página 1 de 4")).toBeTruthy();
    const [pais] = screen.getAllByRole("combobox").filter((el) => el.textContent === "Todos los países");
    fireEvent.click(pais);
    expect(await screen.findByRole("option", { name: "🌍 Sin país (3)" })).toBeTruthy();
  });
});
