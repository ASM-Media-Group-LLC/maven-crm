// Company QA en INGLÉS: el marco (rail por rol), Closers QA con sus pestañas
// (Dashboard, Productividad, Asistencia, Anomalías, QA History, QA Chat, Modelos,
// Notificaciones) y las secciones de Managers y LLG. Nada visible en español.
//
// Se montan las pantallas REALES con el LanguageProvider de verdad; solo se
// reemplazan los hooks que leen la base.
//
// Lo que NO se traduce también se prueba: los submódulos de permisos siguen
// siendo las llaves de role_permissions ("Closers: Anomalías", "LLG QA"…), y el
// turno de la vista v_qa_attendance llega en español (es dato) pero se lee en
// inglés; uno que la pantalla no conoce se muestra tal cual.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, polyfillsDeRadix } from "./enIngles";

polyfillsDeRadix();

const { fijo, mutacion, estado } = vi.hoisted(() => {
  // Siempre el MISMO objeto por clave: un arreglo nuevo por render en un
  // useEffect([data]) es un bucle infinito (la prueba se cuelga sin error).
  const cache = new Map<string, unknown>();
  return {
    fijo: (clave: string, crear: () => unknown) => {
      if (!cache.has(clave)) cache.set(clave, { data: crear(), isLoading: false, isFetching: false, isError: false });
      return cache.get(clave) as { data: unknown; isLoading: boolean };
    },
    mutacion: () => ({ mutate: () => {}, mutateAsync: () => Promise.resolve({ score: 80 }), isPending: false }),
    estado: { permisos: [] as string[], admin: true, conTopClosers: false },
  };
});

const HACE_5_MIN = new Date(Date.now() - 5 * 60_000).toISOString();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }), functions: { invoke: () => Promise.resolve({ data: null, error: null }) } },
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canAccess: (_m: string, sub?: string) => {
      if (sub) estado.permisos.push(sub);
      return true;
    },
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: estado.admin, isManager: false, isSupervisor: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "sam@example.com", user_metadata: {} } }) }));
vi.mock("@/hooks/useUserProfile", () => ({ useMyProfile: () => ({ data: { full_name: "Sam Reviewer" } }) }));
vi.mock("@/hooks/useChatterEvaluator", () => ({
  useMavenUsers: () => fijo("users", () => [{ id: "p1", full_name: "Ana Supervisor", role: "manager" }, { id: "p2", full_name: null, role: null }]),
}));

const LLAMADA = (over: Record<string, unknown>) => ({
  id: "c1", model_id: "m1", closer_id: "k1", call_date: "2026-09-20", evaluator_name: "Claude AI", transcript: "hi",
  audio_path: "t1/c1.mp3", audio_metrics: null, claude_analysis: { summary: "ok" }, claude_score: 81, created_at: "2026-09-20T10:00:00Z",
  uploaded_by: "u1", status: "ready", error_message: null, call_type: "reclutamiento", service_sold: null,
  model: { name: "Jane Doe", avatar_data_url: null, ig_url: null }, closer: { name: "Bob Closer" }, ...over,
});

vi.mock("@/hooks/useAgencyQa", async () => {
  const real = await vi.importActual<typeof import("@/hooks/useAgencyQa")>("@/hooks/useAgencyQa");
  return {
    ...real,
    // Con `conTopClosers`, el popup de "Closers activos" trae un closer sin nombre.
    useQaAnalytics: () => fijo(`analytics-${estado.conTopClosers}`, () => ({
      window: "30d", total_calls: 12, cerro: 5, no_cerro: 4, en_espera: 2, unscored: 1, close_rate: 5 / 12, avg_score: 71,
      active_models: 6, active_closers: 3,
      top_closers: estado.conTopClosers ? [{ name: null, closer_name: null, calls: 2, score: 60 }] : undefined,
      closer_leaderboard: [{ closer_id: "k1", closer_name: "Bob Closer", calls: 7, avg_score: 75, cerro: 3, close_rate: 0.43 }],
      top_models: [{ model_id: "m1", model_name: "Jane Doe", calls: 4, avg_score: 70 }],
      weekly_volume: [{ week_start: "2026-09-14", count: 5, avg_score: 70 }],
    })),
    useQaModelsWithStats: () => fijo("models", () => [
      { id: "m1", name: "Jane Doe", category: "A+", country: "Colombia", ig_url: "https://instagram.com/jane", avatar_data_url: null, active: true, created_at: "",
        total_calls: 4, avg_score: 70, last_call_date: "2026-09-20", last_call: { id: "c1", closer_name: "Bob Closer", outcome: "en_espera", score: 70 } },
      { id: "m2", name: "Kim Lee", category: null, country: null, ig_url: null, avatar_data_url: null, active: true, created_at: "",
        total_calls: 0, avg_score: 0, last_call_date: null, last_call: null },
    ]),
    useQaCalls: () => fijo("calls", () => [
      LLAMADA({}),
      LLAMADA({ id: "c2", status: "processing", claude_score: 0, call_type: "venta_servicio", service_sold: "Kash" }),
      LLAMADA({ id: "c3", status: "failed", claude_score: 0, call_type: "venta_externa", service_sold: null }),
      LLAMADA({ id: "c4", status: null, transcript: null, claude_score: 0, model: null, closer: null }),
      LLAMADA({ id: "c5", status: null, claude_score: 0, claude_analysis: {} }),
    ]),
    useFireQaWebhook: mutacion,
    useDeleteQaCall: mutacion,
    useReprocessQaCall: mutacion,
    useQaChatSessions: () => fijo("sessions", () => [
      { id: "s1", user_id: "u1", scope_type: "closer", scope_closer_id: "k1", title: null, created_at: "2026-09-20T10:00:00Z", updated_at: new Date().toISOString(), closer: { name: "Bob Closer" } },
      { id: "s2", user_id: "u1", scope_type: "all", scope_closer_id: null, title: null, created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z", closer: null },
    ]),
    useQaChatMessages: () => fijo("messages", () => [
      { id: "mm1", session_id: "s1", role: "user", content: "Who closes the most?", tokens_in: null, tokens_out: null, cached_tokens: null, created_at: HACE_5_MIN },
      { id: "mm2", session_id: "s1", role: "assistant", content: "Bob does.", tokens_in: null, tokens_out: null, cached_tokens: null, created_at: HACE_5_MIN },
    ]),
    // Como lo devuelve el hook de verdad: ordenado por nombre, y el que no tiene
    // nombre llega con null (queda PRIMERO). La pantalla lo reordena por lo que muestra.
    useQaClosers: () => fijo("closers", () => [{ id: "k2", name: null, active: true, created_at: "" }, { id: "k1", name: "Bob Closer", active: true, created_at: "" }]),
    useCreateQaChatSession: mutacion,
    useDeleteQaChatSession: mutacion,
    useSendQaChatMessage: mutacion,
    useQaConfig: () => fijo("config", () => ({
      id: 1, notification_emails: ["boss@example.com"], notify_user_ids: ["p1"], notify_on_uploaded: false, notify_on_analyzed: true,
      notify_on_low_score: true, notify_on_failed: true, low_score_threshold: 55, updated_at: "",
    })),
    useUpdateQaConfig: mutacion,
  };
});
vi.mock("@/pages/agency-qa/useQaHubstaff", () => ({
  useQaAttendance: () => fijo("attendance", () => [
    { hubstaff_user_id: "h1", name: "Bob Closer", role: "closer", period: "2026-09-01", shift_start: 480, turno: "Mañana · 8am–4pm", dias: 12, checkin_prom_min: 485, tardanzas: 3, pct_a_tiempo: 75, min_tarde_prom: 14 },
    { hubstaff_user_id: "h2", name: "Ann Closer", role: "closer", period: "2026-09-01", shift_start: 0, turno: "Según horario propio", dias: 12, checkin_prom_min: 5, tardanzas: 0, pct_a_tiempo: 100, min_tarde_prom: null },
    { hubstaff_user_id: "h3", name: "Cy Closer", role: "closer", period: "2026-09-01", shift_start: 960, turno: "Night owl", dias: 2, checkin_prom_min: 965, tardanzas: 0, pct_a_tiempo: 100, min_tarde_prom: null },
  ]),
  useQaAnomalies: () => fijo("anomalies", () => [
    { hubstaff_user_id: "h1", name: "Bob Closer", role: "closer", period: "2026-09-01", date: "2026-09-03", hours: 1.2, act: 40, tipo: "dia_corto" },
    { hubstaff_user_id: "h1", name: "Bob Closer", role: "closer", period: "2026-09-01", date: "2026-09-04", hours: 13, act: 50, tipo: "dia_largo" },
    { hubstaff_user_id: "h2", name: "Ann Closer", role: "closer", period: "2026-09-01", date: "2026-09-05", hours: 3, act: 20, tipo: "baja_actividad" },
    { hubstaff_user_id: "h3", name: "Cy Closer", role: "closer", period: "2026-09-01", date: "2026-09-06", hours: 0.05, act: 0, tipo: "dia_corto" },
  ]),
  useQaEffort: () => fijo("effort", () => [
    { hubstaff_user_id: "h9", name: "Max Manager", role: "manager", period: "2026-09-01", dias: 15, total_hours: 110, avg_activity_pct: 35 },
  ]),
  useLlgHubstaff: () => fijo("llg", () => [
    { name: "Lia Leadgen", period: "2026-09-01", dias: 15, total_hours: 100, avg_activity_pct: 60, leads: 2400, leads_por_hora: 24 },
    { name: "Leo Leadgen", period: "2026-09-01", dias: 15, total_hours: 90, avg_activity_pct: 50, leads: 0, leads_por_hora: null },
  ]),
}));
vi.mock("@/pages/agency-qa/useCloserHubstaff", () => ({
  useCloserHubstaff: () => fijo("closerHs", () => [
    { name: "Bob Closer", period: "2026-09-01", dias: 15, total_hours: 120, avg_activity_pct: 20, leads: 30, cerradas: 4, monetizacion_usd: 9000, usd_por_hora: 75, qa_calls: 5, avg_qa_score: 72, sin_cierres: false },
    { name: "Ann Closer", period: "2026-09-01", dias: 15, total_hours: 60, avg_activity_pct: 15, leads: 10, cerradas: 0, monetizacion_usd: 0, usd_por_hora: 0, qa_calls: 0, avg_qa_score: null, sin_cierres: true },
  ]),
}));
vi.mock("@/pages/agency-qa/chatters-qa/useHubstaffEffort", () => ({
  useHubstaffSyncStatus: () => fijo("sync", () => ({ last_sync_at: HACE_5_MIN })),
}));
// Chatters QA tiene su propia prueba (chattersQaEnIngles): aquí no se monta.
vi.mock("@/pages/agency-qa/chatters-qa/ChattersQaSection", () => ({ default: () => <div>chatters</div> }));

import AgencyQA from "@/pages/agency-qa/AgencyQA";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>
          <AgencyQA />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Las pestañas de Radix se activan con mousedown, no con click. */
const abrirPestana = (nombre: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name: nombre }), { button: 0 });

describe("Company QA → Closers QA en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    estado.permisos.length = 0;
    estado.admin = true;
    estado.conTopClosers = false;
  });

  it("el marco y el Dashboard", async () => {
    montar();
    expect(screen.getByText("Audits by role")).toBeTruthy();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Dashboard", "Productivity", "Attendance", "Anomalies", "New QA", "QA History", "QA Chat", "Models", "Notifications",
    ]);
    expect(screen.getByText("QA analytics")).toBeTruthy();
    expect(screen.getByText("in the last 30 days")).toBeTruthy();
    expect(screen.getByText("Successful")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    // role_permissions guarda las llaves en español: no se traducen.
    expect(estado.permisos).toEqual(expect.arrayContaining([
      "Closers QA", "Chatters QA", "Managers QA", "LLG QA", "Calls", "Closers: Hubstaff", "Closers: Asistencia", "Closers: Anomalías", "New QA", "Models",
    ]));
    // El popup de un KPI (y su vacío, que trae KpiDetailDialog en español).
    fireEvent.click(screen.getByText("Active closers").closest("button") ?? screen.getByText("Active closers"));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("No records to show.")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("Productividad, Asistencia y Anomalías de closers", () => {
    montar();
    abrirPestana("Productivity");
    expect(screen.getByText("Effort vs closing")).toBeTruthy();
    expect(screen.getByText("works, doesn't close")).toBeTruthy();
    expect(screen.getByText("Synced 5 min ago")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    abrirPestana("Attendance");
    // El turno llega en español de la vista y se lee en inglés; uno desconocido, tal cual.
    expect(screen.getByText("Morning · 8am–4pm")).toBeTruthy();
    expect(screen.getByText("Own schedule")).toBeTruthy();
    expect(screen.getByText("Night owl")).toBeTruthy();
    expect(screen.getByText("little data")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    abrirPestana("Anomalies");
    expect(screen.getByText("09/03")).toBeTruthy();
    expect(screen.getByText("only 1.2h worked")).toBeTruthy();
    expect(screen.getByText("almost no time tracked")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("QA History con todos sus estados y el popup de borrar", async () => {
    montar();
    abrirPestana("QA History");
    expect(screen.getByText("QA history")).toBeTruthy();
    for (const e of ["Ready", "Processing…", "Failed", "No transcript", "No analysis", "Sale: Kash", "External: platform"]) {
      expect(screen.getByText(e)).toBeTruthy();
    }
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getAllByTitle("Delete QA")[0]);
    const dialogo = await screen.findByRole("alertdialog");
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("QA Chat: sesiones, mensajes y el alta de conversación", async () => {
    montar();
    abrirPestana("QA Chat");
    expect(screen.getAllByText("About Bob Closer").length).toBeGreaterThan(0);
    expect(screen.getByText("About the whole team")).toBeTruthy();
    expect(screen.getAllByText("5 min ago").length).toBe(2);
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /New conversation/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("New conversation with Mike")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("Modelos y Notificaciones", () => {
    montar();
    abrirPestana("Models");
    expect(screen.getByText("2 models")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    abrirPestana("Notifications");
    expect(screen.getByText("QA uploaded")).toBeTruthy();
    expect(screen.getByLabelText("Remove boss@example.com")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Managers QA y LLG's QA", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Managers QA/ }));
    expect(screen.getByText("Productivity · effort")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /LLG's QA/ }));
    expect(screen.getByText("Productivity · effort vs leads")).toBeTruthy();
    expect(screen.getAllByText("Leads/hour").length).toBe(2);
    expect(enEspanol()).toEqual([]);
  });

  it("un closer sin nombre: «No name» en el popup del KPI y en el alta de conversación, ordenado por lo que se ve", async () => {
    estado.conTopClosers = true;
    montar();
    fireEvent.click(screen.getByText("Active closers").closest("button") ?? screen.getByText("Active closers"));
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText("No name")).toBeTruthy();
    expect(enEspanol(popup)).toEqual([]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    abrirPestana("QA Chat");
    fireEvent.click(screen.getByRole("button", { name: /New conversation/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("combobox"));
    const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opciones).toEqual(["All closers (team-wide)", "Bob Closer", "No name"]);
  });

  it("en español, el closer sin nombre dice «Sin nombre» (como siempre) y queda en la S", async () => {
    localStorage.setItem("app-language", "es");
    estado.conTopClosers = true;
    montar();
    fireEvent.click(screen.getByText("Closers activos").closest("button") ?? screen.getByText("Closers activos"));
    const popup = await screen.findByRole("dialog");
    expect(within(popup).getByText("Sin nombre")).toBeTruthy();
    expect(within(popup).queryByText("(sin nombre)")).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    abrirPestana("QA Chat");
    fireEvent.click(screen.getByRole("button", { name: /Nueva conversación/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("combobox"));
    const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(opciones).toEqual(["Todos los closers (cross-equipo)", "Bob Closer", "Sin nombre"]);
  });

  it("en español sigue diciendo lo de siempre", () => {
    localStorage.setItem("app-language", "es");
    montar();
    expect(screen.getByText("Auditorías por rol")).toBeTruthy();
    expect(screen.getByText("Exitoso")).toBeTruthy();
    abrirPestana("Asistencia");
    expect(screen.getByText("Mañana · 8am–4pm")).toBeTruthy();
    abrirPestana("Anomalías");
    expect(screen.getByText("03/09")).toBeTruthy();
  });
});
