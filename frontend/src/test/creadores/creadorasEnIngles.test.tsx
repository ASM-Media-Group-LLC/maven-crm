// Creadoras en INGLÉS: con la app en EN, ninguna pantalla del módulo muestra
// español — el listado (tabla y tarjetas), el dashboard, la ficha con TODAS sus
// pestañas (también en modo edición), los modales que se abren desde ahí, el
// onboarding (lista y los 4 pasos del asistente), el offboarding y el casting.
//
// El freno estático (test/i18n/sinEspanolNuevo) no ve el texto JSX que arranca en
// su propio renglón —`<CardTitle>⏎ <Icono/>⏎ Resumen del Creator⏎</CardTitle>`—,
// y así se habían quedado en español media docena de pantallas que figuraban como
// traducidas. Este test monta las pantallas de verdad y lee lo que se DIBUJA.
//
// Lo que es DATO (el nombre de la creadora, su país, su categoría, lo que
// escribió ella) viene de los fixtures en inglés o neutro a propósito: acá se
// mide la interfaz, no el contenido. La excepción son las OPCIONES que guardan los
// selects del onboarding en español («Dulce», «Rechazo suave», «Otro»): esas la
// interfaz las tiene que mostrar con su etiqueta, así que el fixture las trae tal
// cual se guardan.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ReactNode } from "react";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";
import translations from "@/lib/i18n";

// ── La base: cualquier cadena de supabase termina en las filas de su tabla ──
const HOY = new Date();
const ISO_HOY = HOY.toISOString();
const DIA = (d: number) => `${HOY.getFullYear()}-${String(HOY.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const CREADORA = {
  id: "c1", name: "Jane Doe", artistic_name: "Janie", status: "active", category: "A",
  country: "Colombia", country_code: "CO", city: "Medellin", email: "jane@example.com", phone: "+573001112233",
  whatsapp_number: "+573001112233", instagram_handle: "janie", tiktok_handle: "janie", twitter_handle: "janie",
  youtube_handle: null, onlyfans_url: "https://onlyfans.com/janie", piclink_url: null, linkedin_handle: null,
  chat_url: null, telegram_handle: "janie", reddit_handle: null, facebook_handle: null, other_url: null,
  profile_photo_url: null, birth_date: "1995-04-10", age: 30, registration_date: "2026-01-15",
  created_at: ISO_HOY, updated_at: ISO_HOY, entered_crm_at: "2026-02-01T00:00:00Z", languages: ["English"],
  blu_infloww_active: true, internal_notes: "VIP", bio: "Hi", instagram_followers: 150000,
  tono_voz: "Dulce", apodos_permitidos: "babe, princess", palabras_prohibidas: "ugly", emoji_frecuente: "🔥",
  contenido_jamas_haria: "Meetups", frases_venta: "Want something special?", hobbies: "Yoga",
  mascotas_nombres: "Luna", comida_favorita: "Sushi", personalidad_marca: "Directa", tono_emocional: "Warm",
  terminos_afecto: "baby", como_quieres_que_te_llamen: "Janie", gfe_disponible: true, currency: "USD",
  precios_contenido: { cat1: { price: 20, notes: "" }, custom: { price: 50, notes: "24h" }, videocalls: { price: 80 } },
  respuesta_sexo_en_persona: "Never", respuesta_usuario_grosero: "Block", estrategia_rechazo: "Rechazo suave",
  plataforma_videollamada: "Otro", usuarios_vip: "whale1", estrategia_recuperacion: "Discounts", restricciones_seguridad: "No face",
  assigned_manager_profile_id: "m1",
  creator_business: {
    id: "b1", assigned_agency: "Kash Plus", manager_type: "Full", kash_type: "Plus", start_date: "2026-01-15",
    company_id: null, company: { id: "k", name: "Kash Plus" }, agency_percentage: 30,
    commission_type: "fixed", commission_tiers: [],
  },
};
const PAUSADA = { ...CREADORA, id: "c2", name: "Ann Roe", artistic_name: null, status: "paused", category: null, country: null };
const EN_REVISION = { ...CREADORA, id: "c3", name: "Kim Poe", status: "pendiente_verificacion", email: null };

const TABLAS: Record<string, unknown[]> = {
  v_creators: [CREADORA, PAUSADA, EN_REVISION],
  creator_guidelines: [
    { id: "g1", creator_id: "c1", guideline_type: "Operación Core", title: "Precios", content: "Custom photo 20", created_at: ISO_HOY },
    { id: "g2", creator_id: "c1", guideline_type: "limits", title: "Face", content: "Never show face", created_at: ISO_HOY },
    { id: "g3", creator_id: "c1", guideline_type: "Custom", title: "Custom", content: "Other", created_at: ISO_HOY },
  ],
  creator_notes: [{ id: "n1", note_text: "Great month", created_by: "11111111-2222", created_at: ISO_HOY }],
  creator_history: [{ id: "h1", action: "Status change", old_value: "paused", new_value: "active", user_id: "11111111-2222", created_at: ISO_HOY }],
  creator_documents: [{ id: "d1", file_name: "contract.pdf", file_type: "application/pdf", file_url: "x", uploaded_at: ISO_HOY }],
  tickets: [{ id: "t1", title: "Payment issue", ticket_type: "billing", company: "kash_agency", created_at: ISO_HOY, priority: "high", status: "in_progress" }],
  creator_monetization: [{ id: "mo1", month_year: "2026-08-01", amount: 1200, notes: null }],
  creator_daily_earnings: [
    { date: DIA(1), total_gross: 100, subscription_gross: 60, tips_gross: 10, message_gross: 30, post_gross: 0, referral_gross: 0, stream_gross: 0 },
    { date: DIA(2), total_gross: 300, subscription_gross: 100, tips_gross: 50, message_gross: 150, post_gross: 0, referral_gross: 0, stream_gross: 0 },
  ],
  creator_social_accounts: [{ id: "s1", username: "janie.backup", active: true }],
  creator_offboardings: [{
    id: "o1", creator_id: "c1", status: "pendiente_aprobacion", categoria: "voluntaria", exit_date: null,
    estimated_lost_revenue: 5000, motivo_operativo: null, motivo_comercial: null, motivo_final: null, comentarios: null,
    check_pagos: true, check_material: false, check_campanas: false, check_accesos: false, check_documentacion: false,
    created_at: ISO_HOY, creator_name: "Jane Doe", artistic_name: "Janie", instagram_handle: "janie", approval_count: 1,
  }],
  creator_offboarding_approvals: [],
  v_creator_prospects: [
    { id: "p1", name: "Lia Moe", instagram: "lia", tiktok: null, platform: "OnlyFans", category: null, agency: "Otra", country: null, email: null, phone: null, source: "otro", notes: "Met at event", status: "contactado", created_at: ISO_HOY },
    { id: "p2", name: "Eve Low", instagram: null, tiktok: null, platform: "Otra", category: null, agency: null, country: null, email: null, phone: null, source: "redes", notes: null, status: "lead", created_at: ISO_HOY },
  ],
  creator_onboarding_videos: [],
  creators: [CREADORA],
  scouter_companies: [],
  model_categories: [],
  profiles: [{ id: "m1", full_name: "Mia Manager" }],
  creator_manager_history: [],
};
const RPC: Record<string, unknown> = {
  get_assignable_managers: [{ id: "m1", full_name: "Mia Manager" }],
  get_assignable_closers: [{ id: "cl1", full_name: "Cole Closer" }],
};

function cadena(tabla: string) {
  const filas = () => TABLAS[tabla] ?? [];
  const b: Record<string, unknown> = {};
  const devolver = () => b;
  for (const m of ["select", "eq", "neq", "in", "gte", "lte", "gt", "lt", "order", "limit", "range", "ilike", "or", "not", "is", "filter", "match", "contains"]) {
    b[m] = devolver;
  }
  b.maybeSingle = async () => ({ data: filas()[0] ?? null, error: null });
  b.single = async () => ({ data: filas()[0] ?? null, error: null });
  b.insert = () => ({ ...b, then: (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: null, error: null })) });
  b.update = devolver;
  b.upsert = devolver;
  b.delete = devolver;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: filas(), error: null, count: filas().length }));
  return b;
}

vi.mock("@/integrations/supabase/client", () => {
  const canal = { on: () => canal, subscribe: () => canal, unsubscribe: () => {} };
  return {
    supabase: {
      from: (t: string) => cadena(t),
      rpc: async (n: string) => ({ data: RPC[n] ?? [], error: null }),
      auth: {
        getUser: async () => ({ data: { user: { id: "u1" } } }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      functions: { invoke: async () => ({ data: null, error: null }) },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "x" }, error: null }) }) },
      channel: () => canal,
      removeChannel: () => {},
    },
  };
});

// Quién mira: admin, así se ve TODO (edición, borrar, vender, aprobar).
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ role: "admin", isAdmin: true, isManager: false, isAgent: false, isEmployee: false, isLoading: false }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canAccess: () => true, isLoading: false }),
  UNIVERSAL_MODULES: [],
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));

// Botones compartidos con Closers/Contactos (components/, fuera de este módulo):
// abren la bandeja de WhatsApp/Telegram y tienen su propio pendiente de i18n.
vi.mock("@/components/WaChatButton", () => ({ WaChatButton: () => <button type="button">WA</button>, toE164: () => "+1" }));
vi.mock("@/components/TgChatButton", () => ({ TgChatButton: () => <button type="button">TG</button> }));
// El selector de fecha y el pie de paginación de la tabla son primitivas de
// components/ui: su traducción va en otro PR de esta ola ("pulido"). Acá solo estorban.
vi.mock("@/components/ui/data-table-shell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/date-input", () => ({
  DateInput: ({ value }: { value?: string }) => <input type="date" defaultValue={value} />,
}));

import CreadoresContent from "@/pages/creadores/CreadoresContent";
import CreadorasDashboardContent from "@/pages/creadores/CreadorasDashboardContent";
import CreadorProfileContent from "@/pages/creadores/CreadorProfileContent";
import OnboardingContent from "@/pages/creadores/onboarding/OnboardingContent";
import OnboardingWizard from "@/pages/creadores/onboarding/OnboardingWizard";
import OffboardingListPage from "@/pages/creadores/offboarding/OffboardingListPage";
import OffboardingDetailPage from "@/pages/creadores/offboarding/OffboardingDetailPage";
import ProspectosPage from "@/pages/creadores/prospectos/ProspectosPage";
import NuevoCreadorForm from "@/pages/creadores/NuevoCreadorForm";
import LineamientosSoloLectura from "@/pages/creadores/LineamientosSoloLectura";
import ChatterOperationalView from "@/pages/creadores/ChatterOperationalView";
import AssignmentModal from "@/pages/creadores/onboarding/AssignmentModal";
import CommissionTiersEditor, { type CommissionTier } from "@/components/commission/CommissionTiersEditor";
import { useState } from "react";

/** Todo el texto visible y los atributos que se leen en pantalla. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    // Lo que hay dentro de un <textarea> es su VALOR (lo que se edita y se guarda,
    // como el de un <input>), no texto de la interfaz.
    if (n.parentElement?.closest("code, pre, script, style, textarea")) continue;
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
// El detector del freno mira acentos y palabras típicas: una etiqueta como
// «Comentarios» o «Aprobaciones» se le escapa. Por eso el test además conoce TODO
// el español del diccionario: si algo en pantalla es exactamente el `es` de una
// clave que en inglés se dice distinto, quedó sin pasar por t().
const ES_DEL_DICCIONARIO = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((par) => par.es !== par.en)
    .map((par) => par.es),
);
// Un texto armado con partes («Core operations · Precios») no es exactamente el
// `es` de ninguna clave: se mira también cada parte.
const PARTES = /\s[·•–—|]\s/;
const enEspanol = () =>
  textosVisibles(document.body).filter(
    (t) => esEspanol(t) || ES_DEL_DICCIONARIO.has(t) || t.split(PARTES).some((parte) => ES_DEL_DICCIONARIO.has(parte.trim())),
  );

/** Para cambiar el idioma con algo ya en pantalla, como lo hace el botón ES/EN. */
function BotonesIdioma() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button type="button" onClick={() => setLanguage("es")}>ES</button>
      <button type="button" onClick={() => setLanguage("en")}>EN</button>
    </>
  );
}

function montar(ui: ReactNode, ruta = "/", patron = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        {/* La app monta un TooltipProvider global (App.tsx); acá también. */}
        <TooltipProvider>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route path={patron} element={ui} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** Radix activa las pestañas con mousedown, no con click. */
const abrirPestana = (nombre: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: nombre }));

// Montan pantallas enteras y recorren pestañas: con el equipo cargado pasan de los
// 5 s por defecto.
const LENTO = 30_000;

describe("Creadoras en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
  });

  it("el listado: tabla, tarjetas, el popup y el lápiz", async () => {
    montar(<CreadoresContent />);
    await screen.findByText("Janie");
    expect(screen.getByRole("button", { name: /Add creator/ })).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    // El lápiz de la fila abre la edición.
    fireEvent.click(screen.getAllByRole("button", { name: "Edit creator" })[0]);
    const edicion = await screen.findByRole("dialog");
    expect(within(edicion).getByText("Edit creator")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(within(edicion).getByRole("button", { name: "Cancel" }));

    // Vista de tarjetas + el popup de la creadora.
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    fireEvent.click(await screen.findByText("Janie"));
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText("Full profile")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("el dashboard y el popup de un status", async () => {
    montar(<CreadorasDashboardContent />);
    await screen.findByText("Latest additions");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: /^Paused/ })[0]);
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText("Paused creators (1)")).toBeTruthy();
    // El grupo sin categoría se nombra en inglés.
    expect(within(popup).getByText("Uncategorized")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("la ficha: cabecera, verificación y todas las pestañas, también editando", async () => {
    montar(<CreadorProfileContent />, "/creadores/c1", "/creadores/:id");
    await screen.findByText("Character sheet");
    expect(screen.getByText("Export spec sheet")).toBeTruthy();
    // Las opciones guardadas en español se muestran con su etiqueta.
    expect(screen.getByText("Sweet")).toBeTruthy();
    expect(screen.getByText("Direct")).toBeTruthy();
    expect(screen.getByText("Soft rejection")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    // Operaciones editando.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByText("Crisis protocol");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    for (const [pestana, marca] of [
      ["Info", "General information"],
      ["Guidelines", "Operating guidelines"],
      ["Socials", "Links to social media profiles"],
      ["Monetization", "Monthly monetization"],
      ["Documents", "contract.pdf"],
      ["Notes", "Great month"],
      ["Tickets", "Payment issue"],
      ["History", "Change history"],
    ] as const) {
      abrirPestana(pestana);
      await screen.findByText(marca);
      await waitFor(() => expect(enEspanol()).toEqual([]));
    }

    // Info y Redes en modo edición.
    abrirPestana("Info");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByPlaceholderText("Internal notes…");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    abrirPestana("Socials");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByText("Instagram followers");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Lineamientos: el catálogo para agregar.
    abrirPestana("Guidelines");
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    await screen.findByText("Core operations");
    expect(enEspanol()).toEqual([]);

    // El modal de cambio de status (desde el badge de la cabecera).
    fireEvent.click(screen.getAllByText("Active")[0]);
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Change creator status")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("el popup de una creadora del dashboard: el manager en singular", async () => {
    montar(<CreadorasDashboardContent />);
    await screen.findByText("Latest additions");
    fireEvent.click(screen.getAllByRole("button", { name: /Janie/ })[0]);
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText("View full profile")).toBeTruthy();
    expect(within(popup).getByText("Manager")).toBeTruthy();
    expect(within(popup).queryByText("Managers")).toBeNull();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("el modal de un lineamiento del catálogo muestra la categoría y el título traducidos", async () => {
    montar(<CreadorProfileContent />, "/creadores/c1", "/creadores/:id");
    await screen.findByText("Character sheet");
    abrirPestana("Guidelines");
    await screen.findByText("Operating guidelines");
    // g1 es «Operación Core» / «Precios»: los dos se guardan en español.
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Edit guideline")).toBeTruthy();
    expect(within(modal).getByText("Core operations · Prices")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("la ficha de una creadora en revisión muestra la verificación en inglés", async () => {
    TABLAS.v_creators = [EN_REVISION];
    try {
      montar(<CreadorProfileContent />, "/creadores/c3", "/creadores/:id");
      await screen.findByText("Verification pending");
      expect(enEspanol()).toEqual([]);
    } finally {
      TABLAS.v_creators = [CREADORA, PAUSADA, EN_REVISION];
    }
  }, LENTO);

  it("la vista de trabajo del chatter y sus lineamientos", async () => {
    montar(<><ChatterOperationalView creatorId="c1" creator={CREADORA} /><LineamientosSoloLectura creatorId="c1" /></>);
    await screen.findByText("Character and voice");
    await screen.findByText("Core operations");
    expect(screen.getByText("Limits")).toBeTruthy();
    expect(screen.getByText("Sweet")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("el alta de una creadora, sus 5 pasos", async () => {
    montar(<NuevoCreadorForm />);
    await screen.findByText("New creator");
    for (let paso = 1; paso <= 5; paso++) {
      expect(enEspanol()).toEqual([]);
      if (paso < 5) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    }
    expect(screen.getByRole("button", { name: "Save creator" })).toBeTruthy();
  }, LENTO);

  it("el onboarding: la lista y los 4 pasos del asistente", async () => {
    const { unmount } = montar(<OnboardingContent />);
    await screen.findByText("Kim Poe");
    expect(enEspanol()).toEqual([]);
    unmount();

    for (const paso of [1, 2, 3, 4]) {
      const r = montar(<OnboardingWizard onCancel={() => {}} initialStep={paso} />);
      await screen.findByRole("button", { name: "Save draft" });
      // Abrir los acordeones del paso para que se vea todo.
      for (const b of screen.queryAllByRole("button", { expanded: false })) fireEvent.click(b);
      await waitFor(() => expect(enEspanol()).toEqual([]));
      r.unmount();
    }
  }, LENTO);

  it("el offboarding: la lista y el detalle", async () => {
    const lista = montar(<OffboardingListPage />);
    await screen.findByText("Jane Doe");
    expect(enEspanol()).toEqual([]);
    lista.unmount();

    montar(<OffboardingDetailPage />, "/creadores/offboarding/o1", "/creadores/offboarding/:offboardingId");
    await screen.findByText("Financial impact");
    expect(enEspanol()).toEqual([]);
  }, LENTO);

  it("el casting (prospectos) y sus modales", async () => {
    montar(<ProspectosPage />);
    await screen.findByText("Lia Moe");
    expect(screen.getByText("Contacted")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: /New profile/ })[0]);
    await screen.findByRole("dialog");
    expect(enEspanol()).toEqual([]);
  }, LENTO);
});

// Los errores de validación y el «Sin nombre» se guardan en el estado (o en la
// caché de react-query) como CLAVE y se traducen al dibujarlos: si se guardara el
// texto ya traducido, al cambiar de idioma con el error en pantalla quedaría el
// idioma de antes.
describe("Creadoras: cambiar de idioma con un mensaje ya en pantalla", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
  });

  it("los errores del paso 1 y del paso de documentos del onboarding", async () => {
    const paso1 = montar(<><BotonesIdioma /><OnboardingWizard onCancel={() => {}} initialStep={1} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(screen.getByText("Email is required")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ES" }));
    expect(await screen.findByText("Nombre es requerido")).toBeTruthy();
    expect(screen.getByText("Email es requerido")).toBeTruthy();
    paso1.unmount();

    localStorage.setItem("app-language", "en");
    montar(<><BotonesIdioma /><OnboardingWizard onCancel={() => {}} initialStep={3} /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("You must confirm the details")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ES" }));
    expect(await screen.findByText("Debe confirmar los datos")).toBeTruthy();
  }, LENTO);

  it("el error de los tramos de comisión", async () => {
    function Tramos() {
      const [tramos, setTramos] = useState<CommissionTier[]>([{ min_revenue: 0, max_revenue: null, percentage: 10 }]);
      return (
        <CommissionTiersEditor
          commissionType="tiered"
          fixedPercentage={0}
          tiers={tramos}
          onTypeChange={() => {}}
          onFixedPercentageChange={() => {}}
          onTiersChange={setTramos}
        />
      );
    }
    montar(<><BotonesIdioma /><Tramos /></>);
    // [mínimo, porcentaje]: el máximo del último tramo es el botón «Sin límite».
    const porcentaje = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(porcentaje, { target: { value: "150" } });
    expect(await screen.findByText("Tier 1: the percentage must be between 0 and 100")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ES" }));
    expect(await screen.findByText("Tramo 1: porcentaje debe estar entre 0 y 100")).toBeTruthy();
  }, LENTO);

  it("el «Sin nombre» de quien no tiene nombre, en el modal de asignación", async () => {
    const perfiles = TABLAS.profiles;
    TABLAS.user_roles = [{ user_id: "x1" }];
    TABLAS.profiles = [{ id: "x1", full_name: null }];
    try {
      montar(
        <>
          <BotonesIdioma />
          <AssignmentModal open onOpenChange={() => {}} onConfirm={() => {}} isSubmitting={false} />
        </>,
      );
      // Elegir a la persona sin nombre como manager: queda escrita en el botón.
      const [elegirManager] = await screen.findAllByRole("combobox");
      await waitFor(() => expect(elegirManager).not.toBeDisabled());
      fireEvent.click(elegirManager);
      fireEvent.click(await screen.findByRole("option", { name: "No name" }));
      await waitFor(() => expect(within(elegirManager).getByText("No name")).toBeTruthy());
      // El modal deja el resto de la página aria-hidden: el botón está, pero «oculto».
      fireEvent.click(screen.getByRole("button", { name: "ES", hidden: true }));
      await waitFor(() => expect(within(elegirManager).getByText("Sin nombre")).toBeTruthy());
    } finally {
      TABLAS.profiles = perfiles;
      delete TABLAS.user_roles;
    }
  }, LENTO);
});

describe("Creadoras en español: sigue diciendo lo mismo", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "es");
  });

  it("la ficha conserva sus textos y el status se ve con su etiqueta", async () => {
    montar(<CreadorProfileContent />, "/creadores/c1", "/creadores/:id");
    await screen.findByText("Ficha de Personaje");
    for (const pestana of ["Operaciones", "Información", "Lineamientos", "Redes", "Monetización", "Documentos", "Notas", "Historial"]) {
      expect(screen.getByRole("tab", { name: pestana })).toBeTruthy();
    }
    expect(screen.getByText("Exportar Ficha Técnica")).toBeTruthy();
    expect(screen.getAllByText("Activa").length).toBeGreaterThan(0);
  }, LENTO);
});

