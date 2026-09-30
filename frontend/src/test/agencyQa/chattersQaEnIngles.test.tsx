// Chatters QA en INGLÉS: el scorecard, el QA cualitativo (la lista, el detalle
// leyendo y editando, la pantalla de "analizando"), la productividad de Hubstaff,
// los masivos y los avisos. Nada visible en español.
//
// Se montan las pantallas REALES con el LanguageProvider de verdad; solo se
// reemplazan los hooks que leen la base o BLU. Lo que escribió el supervisor o la
// IA (el resumen, los aspectos, las citas) es dato: los datos de prueba están en
// inglés para que se mire el texto de la pantalla, no el del reporte.
//
// Lo que NO se traduce también se prueba: los submódulos de permisos que se
// consultan siguen siendo las llaves en español de role_permissions.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, polyfillsDeRadix } from "./enIngles";

polyfillsDeRadix();

// ⚠️ Cada hook tiene que devolver SIEMPRE el mismo objeto: varias pantallas copian
// `data` a su estado en un useEffect([data]) y un arreglo nuevo en cada render es un
// bucle infinito (la prueba se cuelga sin error). `fijo(clave, () => …)` lo arma una
// vez por clave y lo reutiliza.
const { fijo, mutacion, estado } = vi.hoisted(() => {
  const cache = new Map<string, unknown>();
  return {
    fijo: (clave: string, crear: () => unknown) => {
      if (!cache.has(clave)) cache.set(clave, { data: crear(), isLoading: false, isFetching: false });
      return cache.get(clave) as { data: unknown; isLoading: boolean; isFetching: boolean };
    },
    mutacion: () => ({ mutate: () => {}, mutateAsync: () => Promise.resolve(), isPending: false }),
    estado: { permisos: [] as string[], reporte: null as unknown, limpiar: () => cache.clear() },
  };
});

const FILA = (over: Record<string, unknown>) => ({
  id: "s1", chatter_name: "Alex Chatter", company: "CP", period: "2026-02-01", blu_employee_id: 7,
  c1_puntualidad: 4, c2_calidad_chats: 3, c3_cumplimiento_meta: 5, c4_productividad_hubstaff: 4,
  c5_actitud_disciplina: 5, c6_gestion_estrategia: 3, c7_scripts: 4, c8_camara_pantalla: 5,
  total: 33, note: null, source: "manual", ...over,
});

const REPORTE = {
  id: "r1", chatter_name: "Alex Chatter", company: "CM", period: "2026-02-01", blu_employee_id: 7,
  evaluated_models: [{ model_id: 1, model_name: "Luna" }],
  report: {
    intro: "Goal: review February chats.",
    resumen: "Good pacing with @fan_one overall.",
    aspectos_positivos: ["Fast replies"],
    aspectos_mejora: [{ categoria: "Warm-up", detalle: "Skips the warm-up with @fan_two." }],
    observaciones_por_modelo: [{ model_name: "Luna", observaciones: ["Upsells well"], ejemplos: [{ quote: "Want more?", por_que: "Clear upsell", fan: "@fan_one" }] }],
    venta_masiva: {
      resumen: "Blasts convert well.",
      mejores: [{ copy: "New set tonight", metricas: "40 sales", por_que: "Urgency" }],
      peores: [{ copy: "Hi", metricas: "2 sales", por_que: "Too short" }],
      patrones: ["Evening sends work"],
      recomendaciones: ["Add a teaser"],
      stats: { count: 12, sent: 3400, viewed: 1200, purchased: 80, earnings: 950 },
    },
    recomendaciones: ["Use the script more"],
    conclusion: "Keep going.",
    hallazgo_principal: "Needs a warm-up routine.",
  },
  veredicto: "requiere_mejora",
  sampling: { threads_sampled: 30, models: 1, messages_read: 540, fan_index: { "@fan_one": { m: 1, c: 2, n: "Fan One" } } },
  evaluator_name: "Claude AI", source: "ai_draft", status: "ready", error_message: null,
  email_sent_at: "2026-02-10T12:00:00Z", created_at: "2026-02-09T12:00:00Z", updated_at: "2026-02-09T12:00:00Z",
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }), insert: () => Promise.resolve({ error: null }) }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canAccess: (_m: string, sub?: string) => {
      if (sub) estado.permisos.push(sub);
      return true;
    },
  }),
}));
vi.mock("@/hooks/useChatterEvaluator", () => ({
  useMavenUsers: () => fijo("users", () => [{ id: "p1", full_name: "Ana Supervisor", role: "manager" }, { id: "p2", full_name: null, role: null }]),
}));
vi.mock("@/pages/sales-performance/useBluMp", () => ({
  useBluModels: () => fijo("models", () => [{ id: 1, internalName: "Luna" }]),
  bluModelLabel: (m: { internalName?: string }) => m.internalName ?? "?",
  useBluMasivos: (id: number | null) => fijo(`masivos-${id}`, () => id ? [
    { id: "b1", type: "of-mass", copy: "<p>New set tonight</p>", senderName: "Alex", source: null, isExternal: false, price: 10, sent: 1000, viewed: 400, purchased: 30, earnings: 300, sentAt: null },
    { id: "b2", type: "of-mass", copy: "", senderName: null, source: "external", isExternal: true, price: 5, sent: 200, viewed: 50, purchased: 2, earnings: 10, sentAt: null },
  ] : []),
}));
vi.mock("@/pages/agency-qa/chatters-qa/useChatterScorecards", async () => {
  const real = await vi.importActual<typeof import("@/pages/agency-qa/chatters-qa/useChatterScorecards")>("@/pages/agency-qa/chatters-qa/useChatterScorecards");
  return {
    ...real,
    useScorecardPeriods: () => fijo("periods", () => ["2026-02-01", "2026-01-01"]),
    useLatestScoredPeriod: () => fijo("latest", () => "2026-02-01"),
    useScorecards: (p: string | null) => fijo(`rows-${p}`, () => p === "2026-02-01"
      ? [FILA({}), FILA({ id: "s2", chatter_name: "Bea Chatter", company: "CU", total: 20 })]
      : [FILA({ total: 30 })]),
    useUpdateScorecardCell: mutacion,
    useAddChatter: mutacion,
    useDeleteScorecard: mutacion,
    useChatterRoster: () => fijo("roster", () => [{ blu_employee_id: 7, name: "Alex Chatter" }, { blu_employee_id: 8, name: "Cam Chatter" }]),
  };
});
vi.mock("@/pages/agency-qa/chatters-qa/useChatterQaReports", async () => {
  const real = await vi.importActual<typeof import("@/pages/agency-qa/chatters-qa/useChatterQaReports")>("@/pages/agency-qa/chatters-qa/useChatterQaReports");
  return {
    ...real,
    useQaReports: () => fijo("reports", () => [
      REPORTE,
      { ...REPORTE, id: "r2", chatter_name: "Bea Chatter", status: "processing", veredicto: null, source: "manual", email_sent_at: null, evaluated_models: [], report: {} },
      { ...REPORTE, id: "r3", chatter_name: "Cam Chatter", status: "failed", veredicto: "critico", error_message: "no_chats" },
    ]),
    useQaReport: () => fijo(`report-${(estado.reporte as { status?: string } | null)?.status}`, () => estado.reporte),
    useCreateQaReport: mutacion,
    useUpdateQaReport: mutacion,
    useDeleteQaReport: mutacion,
    useGenerateQaDraft: mutacion,
    useSendChatterQaEmail: mutacion,
    useBluChatters: () => fijo("blu", () => [{ blu_employee_id: 7, name: "Alex Chatter", group_name: "Night", assignedCreators: [1] }]),
    useChatterQaConfig: () => fijo("config", () => ({ id: 1, notification_emails: ["boss@example.com"], notify_user_ids: ["p1"], notify_on_analyzed: true, notify_on_low_score: true, notify_on_failed: false, updated_at: "" })),
    useUpdateChatterQaConfig: mutacion,
    useQaProcessingWatcher: () => {},
  };
});
vi.mock("@/pages/agency-qa/chatters-qa/useHubstaffEffort", () => ({
  useHubstaffSyncStatus: () => fijo("sync", () => ({ last_sync_at: new Date(Date.now() - 5 * 60_000).toISOString() })),
  useHubstaffEffort: () => fijo("effort", () => [
    { blu_employee_id: 7, name: "Alex Chatter", period: "2026-02-01", days_tracked: 20, total_hours: 150, avg_activity_pct: 60, sales: 5000, sales_per_hour: 33, avg_response_min: 3, unlock_rate: null, sold_messages: null, fans_chatted: null, online_improductivo: false, cost_usd: 800, agency_revenue_usd: 2000, margin_usd: 1200, roi_x: 2.5, no_rentable: false, agency_rate_used: 50, sin_venta_blu: false },
    { blu_employee_id: 8, name: "Cam Chatter", period: "2026-02-01", days_tracked: 18, total_hours: 140, avg_activity_pct: 55, sales: 0, sales_per_hour: 0, avg_response_min: null, unlock_rate: null, sold_messages: null, fans_chatted: null, online_improductivo: true, cost_usd: 800, agency_revenue_usd: 0, margin_usd: -800, roi_x: 0, no_rentable: true, agency_rate_used: 50, sin_venta_blu: true },
    { blu_employee_id: 9, name: "Dee Chatter", period: "2026-02-01", days_tracked: 18, total_hours: 140, avg_activity_pct: 55, sales: 100, sales_per_hour: 1, avg_response_min: 9, unlock_rate: null, sold_messages: null, fans_chatted: null, online_improductivo: true, cost_usd: 800, agency_revenue_usd: 40, margin_usd: -760, roi_x: 0.05, no_rentable: true, agency_rate_used: 50, sin_venta_blu: false },
  ]),
  useChatterEffortRange: () => fijo("range", () => [
    { blu_employee_id: 7, total_hours: 150, avg_activity_pct: 60, days_tracked: 20 },
    { blu_employee_id: 9, total_hours: 140, avg_activity_pct: 55, days_tracked: 18 },
  ]),
  useChatterSalesRange: () => fijo("sales", () => [
    { blu_employee_id: 7, sales: 5000, agency_revenue_usd: 2000, cost_usd: 800, margin_usd: 1200, roi_x: 2.5 },
    { blu_employee_id: 9, sales: 100, agency_revenue_usd: 40, cost_usd: 800, margin_usd: -760, roi_x: 0.05 },
  ]),
}));

import ChattersQaSection from "@/pages/agency-qa/chatters-qa/ChattersQaSection";
import ChattersQaScorecard from "@/pages/agency-qa/chatters-qa/ChattersQaScorecard";
import ChattersQaQualitative from "@/pages/agency-qa/chatters-qa/ChattersQaQualitative";
import ChatterQaReportDetail from "@/pages/agency-qa/chatters-qa/ChatterQaReportDetail";
import ChattersQaHubstaff from "@/pages/agency-qa/chatters-qa/ChattersQaHubstaff";
import ChattersQaMasivos from "@/pages/agency-qa/chatters-qa/ChattersQaMasivos";
import ChatterQaNotifications from "@/pages/agency-qa/chatters-qa/ChatterQaNotifications";

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Abre las secciones colapsadas del detalle (el título es el botón). */
const abrirSecciones = (titulos: string[]) => {
  for (const titulo of titulos) {
    const boton = screen.getAllByText(titulo).map((el) => el.closest("button")).find(Boolean)!;
    fireEvent.click(boton);
  }
};

/** Los chips del renglón de estadísticas de la venta masiva, uno por span. */
const chipsDeMasivos = (primero: string) => {
  const chip = screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === primero);
  return Array.from(chip.parentElement!.children).map((el) => el.textContent);
};
const n = (x: number) => x.toLocaleString();

/** Las pestañas de Radix se activan con mousedown, no con click. */
const abrirPestana = (nombre: string) =>
  fireEvent.mouseDown(screen.getByRole("tab", { name: nombre }), { button: 0 });

describe("Chatters QA en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    estado.permisos.length = 0;
    estado.reporte = REPORTE;
  });

  it("la sección: pestañas en inglés, permisos con las llaves de siempre", () => {
    montar(<ChattersQaSection />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Scorecard", "Qualitative QA", "Mass messages", "Productivity", "Attendance", "Anomalies", "Notifications",
    ]);
    // role_permissions guarda las llaves en español: no se traducen.
    expect(estado.permisos).toEqual(expect.arrayContaining([
      "Chatters: Scorecard", "Chatters: QA Cualitativo", "Chatters: Masivos", "Chatters: Hubstaff",
      "Chatters: Asistencia", "Chatters: Anomalías", "Chatters: Notificaciones",
    ]));
    expect(enEspanol()).toEqual([]);
  });

  it("el scorecard: mes, criterios, tablas por compañía y el alta de chatter", async () => {
    montar(<ChattersQaScorecard />);
    expect(screen.getByText("February 2026 · monthly measurement · 8 criteria /40")).toBeTruthy();
    expect(screen.getAllByText("Punctuality").length).toBeGreaterThan(0);
    expect(screen.getAllByText("vs prev. month").length).toBe(2);
    expect(enEspanol()).toEqual([]);
    // El borrado de un chatter del mes.
    fireEvent.click(screen.getAllByText("Alex Chatter")[0].closest("tr")!.querySelector("button")!);
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Remove from scorecard")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el QA cualitativo: la lista con sus estados y los popups", async () => {
    montar(<ChattersQaQualitative />);
    expect(screen.getByText("Needs improvement")).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /New report/ }));
    expect(screen.getByText("Chatter (from BLU)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("el detalle leyendo: secciones, veredicto y muestreo", () => {
    montar(<ChatterQaReportDetail id="r1" onBack={() => {}} />);
    // Las secciones se leen colapsadas: se abren todas (el título es el botón).
    for (const titulo of ["Summary", "Strengths", "Areas to improve", "Notes per model", "Mass sales", "Recommendations", "Conclusion"]) {
      const boton = screen.getAllByText(titulo).map((el) => el.closest("button")).find(Boolean)!;
      fireEvent.click(boton);
    }
    expect(screen.getAllByText("Needs improvement").length).toBe(2);
    expect(screen.getByText(/1 model\(s\) · 30 threads · 540 messages/)).toBeTruthy();
    expect(screen.getByText("Most effective")).toBeTruthy();
    // Cuatro chips sueltos + la plata, como siempre (sin " · " que los pegue).
    expect(chipsDeMasivos("12 mass messages")).toEqual([
      "12 mass messages", `${n(3400)} sent`, `${n(1200)} viewed`, `${n(80)} sales (6.7%)`, `$${n(950)}`,
    ]);
    expect(enEspanol()).toEqual([]);
  });

  it("el detalle editando y la pantalla de analizando", () => {
    montar(<ChatterQaReportDetail id="r1" onBack={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(screen.getByText("Introduction / goal")).toBeTruthy();
    expect(screen.getByPlaceholderText("Category (e.g. No warm-up)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la pantalla de analizando (borrador IA en curso)", () => {
    estado.reporte = { ...REPORTE, status: "processing" };
    montar(<ChatterQaReportDetail id="r1" onBack={() => {}} />);
    expect(screen.getByText("Analyzing with AI…")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la productividad: esfuerzo, resultado y rentabilidad", () => {
    montar(<ChattersQaHubstaff />);
    expect(screen.getByText("Effort · Results · Profitability")).toBeTruthy();
    expect(screen.getByText("Synced 5 min ago")).toBeTruthy();
    expect(screen.getByText("no BLU sales")).toBeTruthy();
    expect(screen.getByText("unprofitable")).toBeTruthy();
    expect(screen.getByText("performing")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("los masivos: vacío y con un modelo elegido", async () => {
    montar(<ChattersQaMasivos />);
    expect(screen.getByText("Pick a model to see its mass messages.")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "Luna" }));
    expect(await screen.findByText("Analyze quality with AI")).toBeTruthy();
    expect(screen.getByText("(no text)")).toBeTruthy();
    expect(screen.getByText("External")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("los avisos: destinatarios y disparos", () => {
    montar(<ChatterQaNotifications />);
    expect(screen.getByText("AI draft ready")).toBeTruthy();
    expect(screen.getByPlaceholderText("1 selected — type to filter")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("en español, el subtítulo de la sección es el de siempre", () => {
    localStorage.setItem("app-language", "es");
    montar(<ChattersQaSection />);
    expect(screen.getByText('Medición y auditoría de chatters — reemplaza el sheet "Medidor de chatters".')).toBeTruthy();
  });

  it("en español, los chips de la venta masiva siguen separados", () => {
    localStorage.setItem("app-language", "es");
    montar(<ChatterQaReportDetail id="r1" onBack={() => {}} />);
    abrirSecciones(["Venta masiva"]);
    expect(chipsDeMasivos("12 masivos")).toEqual([
      "12 masivos", `${n(3400)} enviados`, `${n(1200)} vistos`, `${n(80)} ventas (6.7%)`, `$${n(950)}`,
    ]);
  });

  it("en español, el scorecard sigue diciendo lo de siempre", () => {
    localStorage.setItem("app-language", "es");
    montar(<ChattersQaScorecard />);
    expect(screen.getByText("Febrero 2026 · medición mensual · 8 criterios /40")).toBeTruthy();
    expect(screen.getAllByText("Puntualidad").length).toBeGreaterThan(0);
    // La ayuda de arriba: el texto y el «azul» son hijos directos del flex (como en
    // main), sin un span que los envuelva y cambie cómo se reparte el renglón.
    const azul = screen.getByText("azul", { selector: "span" });
    const ayuda = azul.parentElement!;
    expect(ayuda.tagName).toBe("P");
    expect(ayuda.textContent).toMatch(/^Edita una celda .* Los criterios en azul se auto-completarán/);
    expect(Array.from(ayuda.children).map((el) => el.tagName.toLowerCase())).toEqual(["svg", "span"]);
  });
});
