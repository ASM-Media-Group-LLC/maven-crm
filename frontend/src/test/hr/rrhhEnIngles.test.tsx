// RRHH (parte A) en INGLÉS: ausencias, permisos, vacaciones, capacitación,
// dashboard, incidentes, deducciones, offboarding, banco de horas, horarios,
// monitoreo, organigrama, directorio, alta de empleado, comunicación interna,
// ficha de la persona y asistencia automática. Con la app en EN, nada visible en
// español: ni en las tablas, ni en las grillas, ni en los diálogos que se abren.
//
// Se montan las pantallas de verdad con el LanguageProvider real. Lo único falso
// es de dónde salen los datos (supabase), y dos piezas que traduce OTRO PR de la
// ola (el buscador de empleados y los filtros de anuncios): acá se cambian por un
// hueco para que este test mida solo lo de estas pantallas.
//
// ⚠️ Los tipos y estados de la base ("enfermedad", "pending", "manana"…) llegan tal
// cual en los datos de prueba: se prueba que se VEN traducidos.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, within, configure, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

beforeAll(() => {
  // Radix (popover, scroll-area, select) lo pide y jsdom no lo trae.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// ─── Datos ──────────────────────────────────────────────────────────────
const hoy = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const enDias = (n: number) => {
  const d = new Date(hoy);
  d.setDate(d.getDate() + n);
  return d;
};
const AHORA = hoy.toISOString();
// Un día del mes en curso, lejos de los bordes (para que caiga en el calendario).
const DIA_DEL_MES = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 15));
const dia = (n: number) => `${DIA_DEL_MES.slice(0, 8)}${String(n).padStart(2, "0")}`;
const PERIODO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

const ANA = { first_name: "Ana", last_name: "Lopez", email: "ana@example.com", employee_code: "E-001", department_id: "d1", profile_photo_url: null, departments: { id: "d1", name: "Operations" } };
const JOHN = { first_name: "John", last_name: "Smith", email: "john@example.com", employee_code: "E-002", department_id: "d1", profile_photo_url: null, departments: { id: "d1", name: "Operations" } };

const ausencia = (id: string, absence_type: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, employee_id: "e1", absence_type, status, start_date: DIA_DEL_MES, end_date: DIA_DEL_MES, total_days: 1,
  notes: null, reason: null, created_at: AHORA, employees: ANA, ...extra,
});

const TABLAS: Record<string, Record<string, unknown>[]> = {
  employees: [
    { id: "e1", ...ANA, status: "activo", hire_date: iso(enDias(-10)), termination_date: null, base_salary: 1200, work_modality: "remoto", city: "Medellin", country: "Colombia", reports_to: null, positions: { id: "p1", name: "Analyst", code: "AN" }, departments: { id: "d1", name: "Operations", code: "OPS" } },
    { id: "e2", ...JOHN, status: "en_licencia", hire_date: "2024-01-10", termination_date: null, base_salary: 900, work_modality: "hibrido", city: null, country: null, reports_to: "e1", positions: null, departments: { id: "d1", name: "Operations", code: "OPS" } },
  ],
  departments: [{ id: "d1", name: "Operations", code: "OPS", is_active: true }],
  positions: [{ id: "p1", name: "Analyst", department_id: "d1", is_active: true }],
  profiles: [{ id: "u1", full_name: "Alvaro Mejia", avatar_url: null }],
  companies: [{ id: "c1", name: "Maven" }],
  absences: [
    ausencia("a1", "enfermedad", "pending", { notes: "Flu", end_date: iso(enDias(1)), total_days: 2 }),
    ausencia("a2", "permiso_medico", "pending", { notes: "14:00 - 16:00", reason: "Doctor" }),
    // Del 14 al 16: el calendario compara contra medianoche UTC, y un rango de un solo
    // día no cae en su celda en husos detrás de UTC (Bogotá). No es de este test.
    ausencia("a3", "vacaciones", "approved", { start_date: dia(14), end_date: dia(16), total_days: 3, reason: "Trip" }),
    ausencia("a4", "vacaciones", "pending", { reason: "Beach" }),
    ausencia("a5", "dia_personal", "rejected", { total_days: 1 }),
    ausencia("a6", "llegada_tarde", "approved", { notes: "08:30" }),
  ],
  employee_training_assignments: [
    { id: "t1", employee_id: "e1", status: "in_progress", start_date: iso(hoy), completion_date: iso(enDias(3)), notes: "Focus on scripts", created_at: AHORA, employees: { ...ANA, departments: { name: "Operations" } }, training_programs: { id: "pr1", name: "Sales basics", duration_hours: 4, modality: "hibrido", target_role: "content", is_mandatory: true } },
    { id: "t2", employee_id: "e2", status: "failed", start_date: iso(hoy), completion_date: null, notes: null, created_at: AHORA, employees: { ...JOHN, departments: { name: "Operations" } }, training_programs: { id: "pr2", name: "Tech onboarding", duration_hours: 2, modality: "presencial", target_role: "technology", is_mandatory: false } },
  ],
  training_programs: [
    { id: "pr1", name: "Sales basics", description: "Intro course", duration_hours: 4, modality: "hibrido", target_role: "content", is_mandatory: true, is_active: true, provider: "Acme" },
    { id: "pr2", name: "Tech onboarding", description: null, duration_hours: 2, modality: "presencial", target_role: "technology", is_mandatory: false, is_active: true, provider: null },
  ],
  training_modules: [
    { id: "m1", training_program_id: "pr1", title: "Welcome", description: "Kickoff", duration_minutes: 30, content_type: "documento", content_url: null, is_required: true, position: 0 },
    { id: "m2", training_program_id: "pr1", title: "Role play", description: null, duration_minutes: 45, content_type: "practica", content_url: "https://example.com/x", is_required: false, position: 1 },
  ],
  training_module_progress: [{ id: "mp1", assignment_id: "t1", module_id: "m1", status: "completed", completed_at: AHORA }],
  hour_bank: [
    { id: "h1", employee_id: "e1", hours: 5, movement_type: "deposit", reason: "Overtime", created_at: AHORA, employees: ANA },
    { id: "h2", employee_id: "e1", hours: 2, movement_type: "withdrawal", reason: null, created_at: AHORA, employees: ANA },
  ],
  employee_deductions: [
    { id: "x1", employee_id: "e1", deduction_type: "infraccion", amount: 50, description: "[redes_sociales] Phone use", month_year: PERIODO, status: "pending", created_at: AHORA, employees: ANA },
    { id: "x2", employee_id: "e2", deduction_type: "adelanto", amount: 200, description: null, month_year: PERIODO, status: "applied", created_at: AHORA, employees: JOHN },
  ],
  employee_incidents: [
    { id: "i1", employee_id: "e1", title: "Late login", description: "Details", incident_type: "asistencia", severity: "critical", status: "open", incident_date: iso(hoy), corrective_action: "Warning", created_at: AHORA, employees: ANA },
    { id: "i2", employee_id: "e2", title: "Badge", description: null, incident_type: "desempeno", severity: "medium", status: "in_progress", incident_date: iso(hoy), corrective_action: null, created_at: AHORA, employees: JOHN },
  ],
  employee_offboarding: [
    { id: "o1", employee_id: "e2", termination_type: "voluntary", termination_date: iso(hoy), termination_reason: "Relocation", exit_interview_notes: "Good talk", access_revoked: false, equipment_returned: true, final_payment_status: "processing", status: "in_progress", created_at: AHORA, employees: { ...JOHN, departments: { name: "Operations" }, positions: { name: "Analyst" } } },
  ],
  employee_offboarding_tasks: [{ offboarding_id: "o1", status: "completed" }, { offboarding_id: "o1", status: "pending" }],
  work_schedules: [
    { id: "w1", title: "Morning block", schedule_type: "manana", start_date: iso(hoy), end_date: iso(enDias(5)), start_time: "08:00:00", end_time: "16:00:00", description: "Main shift", team: "chatters" },
    { id: "w2", title: "Night block", schedule_type: "noche", start_date: iso(hoy), end_date: iso(enDias(2)), start_time: null, end_time: null, description: null, team: "chatters" },
  ],
  internal_announcements: [
    { id: "an1", title: "Holiday notice", announcement_type: "holiday", priority: "high", status: "scheduled", visibility: "targeted", view_count: 3, starts_at: AHORA, created_at: AHORA },
    { id: "an2", title: "Policy update", announcement_type: "policy", priority: "low", status: "draft", visibility: "global", view_count: 0, starts_at: AHORA, created_at: AHORA },
  ],
  announcement_audience: [
    { announcement_id: "an1", target_label: "Operations" },
    { announcement_id: "an1", target_label: "Closers" },
  ],
  hubstaff_daily_data: [{ date: iso(hoy), hubstaff_user_id: "hs1", tracked_seconds: 7200, overall_activity: 55 }],
  v_qa_attendance: [
    { hubstaff_user_id: "hs1", name: "Ana Lopez", role: "Chatter", period: PERIODO, shift_start: 480, turno: "Mañana · 8am–4pm", dias: 10, checkin_prom_min: 485, tardanzas: 2, pct_a_tiempo: 70, min_tarde_prom: 7, horario_cargado: true },
    { hubstaff_user_id: "hs2", name: "John Smith", role: "closer", period: PERIODO, shift_start: 960, turno: "Según horario propio", dias: 2, checkin_prom_min: 965, tardanzas: 0, pct_a_tiempo: 100, min_tarde_prom: null, horario_cargado: false },
    { hubstaff_user_id: "hs3", name: "Alvaro Mejia", role: "closer", period: PERIODO, shift_start: 0, turno: "Madrugada · 12am–8am", dias: 12, checkin_prom_min: 2, tardanzas: 0, pct_a_tiempo: 100, min_tarde_prom: null, horario_cargado: false },
  ],
  payroll_periods: [],
  hubstaff_config: [{ id: "hc1", last_sync_at: AHORA, org_id: "123", sync_enabled: false, api_token_set: true }],
  v_qa_staff: [{ profile_id: "u1", name: "Alvaro Mejia", role: "closer" }],
  whatsapp_user_schedules: [{ user_id: "u1", weekday: 1, start_time: "08:00:00", end_time: "17:00:00" }],
};

const TARJETA = {
  identity: { profile_id: "u1", name: "Alvaro Mejia", role: "employee", hubstaff_user_id: "hs3", in_hubstaff: true },
  attendance: { period: PERIODO, turno: "Tarde · 4pm–12am", shift_start: 960, dias: 9, checkin_prom_min: 970, tardanzas: 3, pct_a_tiempo: 82, min_tarde_prom: 6, horario_cargado: false },
  effort: { period: PERIODO, dias: 9, total_hours: 60, avg_activity_pct: 48 },
  chatter: { period: PERIODO, days_tracked: 9, total_hours: 60, avg_activity_pct: 48, sales: 1500, sales_per_hour: 25, avg_response_min: 2, unlock_rate: 30, sold_messages: 10, fans_chatted: 40, online_improductivo: null, cost_usd: 400, agency_revenue_usd: 900, margin_usd: 500, roi_x: 2.2, no_rentable: false, sin_venta_blu: true },
  scorecard: { total_sales: 1500, fan_conversion_rate: 12, unlock_rate: 30, avg_response_seconds: 95, scheduled_hours: 60, clocked_hours: 58, creators_count: 3, sold_messages: 10, fans_chatted: 40, snapshot_from: null, snapshot_to: null },
  closer: { period: PERIODO, dias: 9, total_hours: 50, avg_activity_pct: 60, leads: 20, cerradas: 4, monetizacion_usd: 800, usd_por_hora: 16, qa_calls: 5, avg_qa_score: 80, sin_cierres: false },
  llg: { period: PERIODO, dias: 9, total_hours: 40, avg_activity_pct: 50, leads: 30, leads_por_hora: 0.75 },
};

type Fila = Record<string, unknown>;
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const filtros: Array<(f: Fila) => boolean> = [];
    const filas = () => (TABLAS[tabla] ?? []).filter((f) => filtros.every((ok) => ok(f)));
    const q: Record<string, unknown> = {};
    for (const m of ["select", "neq", "is", "not", "order", "limit", "ilike", "gte", "lte", "insert", "update", "delete", "upsert", "range"]) {
      q[m] = () => q;
    }
    q.eq = (col: string, v: unknown) => { filtros.push((f) => f[col] === undefined || f[col] === v); return q; };
    q.in = (col: string, vs: unknown[]) => { filtros.push((f) => vs.includes(f[col])); return q; };
    q.maybeSingle = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.single = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
      Promise.resolve({ data: filas(), error: null, count: filas().length }).then(ok, mal);
    return q;
  };
  return {
    supabase: {
      from: consulta,
      rpc: (fn: string) => Promise.resolve({ data: fn === "get_hr_person_card" ? TARJETA : [], error: null }),
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }),
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), createSignedUrl: () => Promise.resolve({ data: null }) }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));

// Lo traduce el PR de componentes de esta misma ola: acá no se mide.
vi.mock("@/components/hr/EmployeeSearchCombobox", () => ({ EmployeeSearchCombobox: () => <div data-testid="buscador-empleados" /> }));
// Lo traduce el PR de RRHH parte B (announcements/): acá no se mide.
vi.mock("@/pages/hr/announcements/AnnouncementFilters", () => ({ default: () => <div data-testid="filtros-anuncios" /> }));

// El monitoreo lee Hubstaff con un hook propio que arma "Última actividad" en
// español: se usan sus formas reales para probar que la pantalla las traduce.
vi.mock("@/hooks/useHubstaffData", () => ({
  useHubstaffData: () => ({
    agents: [
      { id: "g1", memberId: "g1", profileId: "u1", name: "Ana Lopez", role: "", department: "", departmentCode: "", status: "inactivo", mouseActivity: 40, keyboardActivity: 20, hoursToday: 3.5, lastActivity: "Hace 12 min", alerts: 1, avatarInitials: "AL" },
      { id: "g2", memberId: "g2", profileId: "u2", name: "Sin nombre", role: "", department: "", departmentCode: "", status: "desconectado", mouseActivity: 0, keyboardActivity: 0, hoursToday: 0, lastActivity: "Sin actividad", alerts: 0, avatarInitials: "SN" },
      { id: "g3", memberId: "g3", profileId: "u3", name: "John Smith", role: "", department: "", departmentCode: "", status: "activo", mouseActivity: 90, keyboardActivity: 80, hoursToday: 6, lastActivity: "Hace 1h 5min", alerts: 0, avatarInitials: "JS" },
    ],
    isLoading: false,
    config: { id: "hc1", api_token_set: true, org_id: "123", sync_enabled: false, last_sync_at: AHORA, sync_interval_minutes: 5 },
    isEmpty: false,
    refetch: () => {},
  }),
}));

import HRAbsences from "@/pages/hr/HRAbsences";
import HRPermisos from "@/pages/hr/HRPermisos";
import HRPermisoNew from "@/pages/hr/HRPermisoNew";
import HRVacations from "@/pages/hr/HRVacations";
import HRTraining from "@/pages/hr/HRTraining";
import HRDashboard from "@/pages/hr/HRDashboard";
import HRIncidents from "@/pages/hr/HRIncidents";
import HRDeductions from "@/pages/hr/HRDeductions";
import HROffboarding from "@/pages/hr/HROffboarding";
import HRHourBank from "@/pages/hr/HRHourBank";
import HRChatterSchedules from "@/pages/hr/HRChatterSchedules";
import HRMonitoring from "@/pages/hr/HRMonitoring";
import HROrganigrama from "@/pages/hr/HROrganigrama";
import HRDirectoryLookup from "@/pages/hr/HRDirectoryLookup";
import EmployeeNew from "@/pages/hr/EmployeeNew";
import HRAnnouncements from "@/pages/hr/HRAnnouncements";
import HRPersonCard from "@/pages/hr/HRPersonCard";
import HrAttendanceAuto from "@/pages/hr/HrAttendanceAuto";
import HRStaffSchedules from "@/pages/hr/HRStaffSchedules";
import {
  ABSENCE_TYPES, ABSENCE_STATUSES, INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATUSES,
  DEDUCTION_DISPLAY_TYPES, DEDUCTION_STATUSES, INFRACTION_CATEGORIES, TRAINING_STATUSES,
  CONTRACT_TYPES, WORK_MODALITIES, NATIONAL_ID_TYPES, GENDER_OPTIONS, SALARY_FREQUENCIES, BANK_ACCOUNT_TYPES,
} from "@/lib/hrConstants";
import * as etiquetas from "@/pages/hr/etiquetasRrhh";
import translations from "@/lib/i18n";

// ─── Cómo se mira ───────────────────────────────────────────────────────
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, script, style")) continue;
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

// El detector del freno evita a propósito palabras que no están en su lista (para
// no dar falsas alarmas en toda la app): "Ausencias", "Permiso", "Capacitación"
// sin tilde le pasarían. Acá, que solo se mira RRHH, se suman las del módulo.
const PALABRAS_RRHH = new RegExp(
  "\\b(?:" +
    "falta|faltas|ausencias?|permisos?|vacaciones|capacitaci\\w*|empleados?|solicitud\\w*|turnos?|horarios?|" +
    "motivo|departamentos?|programas?|modulos?|incidentes?|deducci\\w*|aprobad\\w*|rechazad\\w*|registrar|" +
    "detalle|asignad\\w*|tipo|estado|fechas?|obligatorio|proveedor|monto|movimientos?|anuncios?|borrador\\w*|" +
    "programad\\w*|puntualidad|tardanzas?|entrada|salida|rotacion|plantilla|nomina|resumen|acciones|" +
    "configurar|guardar|cancelar|editar|buscar|todos|todas|agente|agentes|actividad|teclado|ahora|" +
    "manana|tarde|noche|semana|mes|dias|horas|activos?|inactivos?|desconectado|pausa|cargo|ubicacion|" +
    "reporta|empresa|organigrama|directorio|balance alto|devuelto|revocados|pago|terminacion" +
  ")\\b",
  "i",
);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// Nombres propios de entidades colombianas (EPS, ARL, fondos de pensión) que el
// alta de empleado lista en sus selects: se ven igual en los dos idiomas.
const NOMBRES_PROPIOS = new Set(["Nueva EPS", "Seguros Bolívar", "Protección", "Salud Total", "Sura ARL", "AXA Colpatria", "Liberty Seguros"]);
// Un value crudo que se cuela sin etiqueta ("permiso_medico", "en_licencia") también
// cuenta: se mira con los guiones bajos como espacios.
const pareceEspanol = (s: string): boolean => {
  if (NOMBRES_PROPIOS.has(s)) return false;
  const plano = sinAcentos(s).replace(/_/g, " ");
  return esEspanol(s) || esEspanol(plano) || PALABRAS_RRHH.test(plano);
};
const enEspanol = (raiz: HTMLElement = document.body) => textosVisibles(raiz).filter((t) => pareceEspanol(t));

function montar(ui: ReactNode, ruta = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** El botón que tiene adentro el ícono de lucide `nombre` (los de vista no tienen
 *  texto). Con `ultimo`, el último de la pantalla: el mismo ícono puede estar antes
 *  en una tarjeta. */
function botonConIcono(nombre: string, { ultimo = false, raiz = document as ParentNode } = {}): HTMLElement {
  const botones = Array.from(raiz.querySelectorAll(`svg.lucide-${nombre}`))
    .map((svg) => svg.closest("button") as HTMLElement | null)
    .filter((b): b is HTMLElement => !!b);
  const boton = ultimo ? botones[botones.length - 1] : botones[0];
  if (!boton) throw new Error(`no hay botón con el ícono ${nombre}`);
  return boton;
}

const sinEspanol = () => expect(enEspanol()).toEqual([]);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("app-language", "en");
});

// ─── Las dos pantallas más grandes ──────────────────────────────────────
describe("RRHH en inglés: Capacitación", () => {
  it("el tablero, la grilla y el calendario de asignaciones", async () => {
    montar(<HRTraining />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getByText("Training")).toBeTruthy();
    // El estado y el rol llegan como dato ("in_progress", "content") y se ven traducidos.
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Content").length).toBeGreaterThan(0);
    expect(screen.getByText("Due soon")).toBeTruthy();
    sinEspanol();

    fireEvent.click(botonConIcono("layout-grid"));
    await screen.findAllByText("Sales basics");
    sinEspanol();

    fireEvent.click(botonConIcono("calendar-days"));
    await screen.findByText("MON");
    sinEspanol();
  });

  it("el detalle de una asignación, con sus módulos", async () => {
    montar(<HRTraining />);
    await screen.findAllByText("Ana Lopez");
    fireEvent.click(botonConIcono("eye"));
    await screen.findByText("Welcome");
    expect(screen.getByText("Program modules")).toBeTruthy();
    sinEspanol();
  });

  it("la configuración de programas, sus módulos y los diálogos de alta", async () => {
    montar(<HRTraining />);
    await screen.findAllByText("Ana Lopez");
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    await screen.findByText("Program settings");
    await screen.findByText("Intro course");
    sinEspanol();

    fireEvent.click(botonConIcono("list"));
    await screen.findByText("Target role");
    sinEspanol();

    fireEvent.click(screen.getByRole("button", { name: /New program/ }));
    const alta = await screen.findByRole("dialog");
    expect(within(alta).getByText("New training program")).toBeTruthy();
    expect(enEspanol(alta)).toEqual([]);
    fireEvent.click(within(alta).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getAllByRole("button", { name: /Modules/ })[0]);
    await screen.findByText("Role play");
    expect(screen.getByText("Document")).toBeTruthy();
    expect(screen.getByText("Practice")).toBeTruthy();
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: /New module/ }));
    const modulo = await screen.findByRole("dialog");
    expect(enEspanol(modulo)).toEqual([]);
  });

  it("asignar una capacitación", async () => {
    montar(<HRTraining />);
    await screen.findAllByText("Ana Lopez");
    fireEvent.click(screen.getByRole("button", { name: /Assign training/ }));
    await screen.findByText("Assign a training program to an employee");
    sinEspanol();
  });
});

describe("RRHH en inglés: Vacaciones", () => {
  it("las solicitudes, en lista y en grilla", async () => {
    montar(<HRVacations />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getAllByText("Annual vacation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(botonConIcono("layout-grid"));
    await screen.findAllByText("Trip");
    sinEspanol();
  });

  it("balances, historial y calendario (con el panel del día)", async () => {
    montar(<HRVacations />);
    await screen.findAllByText("Ana Lopez");
    fireEvent.click(screen.getByRole("button", { name: "Balances" }));
    await screen.findByText("Vacation used");
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: /Calendar/ }));
    await screen.findByText("Pick a day");
    expect(screen.getByText("Mon")).toBeTruthy();
    // El día 15 del mes en curso tiene la vacación aprobada de los datos.
    const celda = screen.getAllByText("15").find((el) => el.closest(".grid-cols-7"));
    fireEvent.click(celda!);
    await screen.findByText(/3 days · Vacation/);
    sinEspanol();
  });

  it("los días personales, la nueva solicitud y el detalle", async () => {
    montar(<HRVacations />);
    await screen.findAllByText("Ana Lopez");
    fireEvent.click(screen.getByRole("button", { name: /Personal days/ }));
    await screen.findByText("Days used");
    sinEspanol();

    fireEvent.click(screen.getByRole("button", { name: /New request/ }));
    const nueva = await screen.findByRole("dialog");
    expect(within(nueva).getByText(/New request — Personal days/)).toBeTruthy();
    expect(enEspanol(nueva)).toEqual([]);
    fireEvent.click(within(nueva).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Annual vacation/ }));
    await screen.findAllByText("Beach");
    fireEvent.click(botonConIcono("eye"));
    const detalle = await screen.findByRole("dialog");
    expect(within(detalle).getByText("Request details")).toBeTruthy();
    expect(enEspanol(detalle)).toEqual([]);
  });
});

// ─── El resto de las pantallas ──────────────────────────────────────────
describe("RRHH en inglés: el resto de la parte A", () => {
  it("Ausencias: tabla, grilla, alta, detalle y edición", async () => {
    montar(<HRAbsences />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getAllByText("Illness").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: /Log absence/ }));
    let d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getAllByTitle("View detail")[0]);
    d = await screen.findByRole("dialog");
    expect(within(d).getByText("Absence details")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("layout-grid"));
    await screen.findAllByRole("button", { name: /Approve/ });
    sinEspanol();
  });

  it("Permisos: tabla, grilla, detalle y edición; y la página de alta", async () => {
    montar(<HRPermisos />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getAllByText("Medical appointment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Late arrival").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(botonConIcono("eye"));
    let d = await screen.findByRole("dialog");
    expect(within(d).getByText("Leave details")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("pencil"));
    d = await screen.findByRole("dialog");
    expect(within(d).getByText("Edit leave")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("layout-grid"));
    await screen.findAllByRole("button", { name: /View/ });
    sinEspanol();
  });

  it("Permisos: la página de nueva solicitud", async () => {
    montar(<HRPermisoNew />);
    await screen.findAllByText("New request");
    sinEspanol();
  });

  it("Dashboard: tarjetas, pendientes, módulos y la configuración de atajos", async () => {
    montar(<HRDashboard />);
    await screen.findByText("Human Resources");
    await screen.findAllByText(/Illness ·/);
    sinEspanol();
    fireEvent.click(botonConIcono("settings2"));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Configure quick actions")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("Incidentes: tabla, grilla, detalle y edición", async () => {
    montar(<HRIncidents />);
    await screen.findAllByText("Late login");
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(botonConIcono("eye"));
    let d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("pencil"));
    d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("layout-grid"));
    sinEspanol();
  });

  it("Deducciones: tabla, grilla y detalle", async () => {
    montar(<HRDeductions />);
    await screen.findAllByText("Social media use");
    expect(screen.getAllByText("Payroll advance").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(botonConIcono("eye"));
    const d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("layout-grid"));
    sinEspanol();
  });

  it("Offboarding: tabla, grilla, detalle y edición", async () => {
    montar(<HROffboarding />);
    await screen.findAllByText("Voluntary");
    sinEspanol();
    fireEvent.click(botonConIcono("eye"));
    let d = await screen.findByRole("dialog");
    expect(within(d).getByText("Offboarding details")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("pencil"));
    d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(botonConIcono("layout-grid"));
    sinEspanol();
  });

  it("Banco de horas: balances, movimientos y el alta", async () => {
    montar(<HRHourBank />);
    await screen.findAllByText("Ana Lopez");
    sinEspanol();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Entries" }));
    await screen.findByText("Deposit");
    sinEspanol();
    fireEvent.click(screen.getAllByRole("button", { name: /Add hours/ })[0]);
    const d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
  });

  it("Horarios de chatters: tabla, grilla, calendario y alta", async () => {
    montar(<HRChatterSchedules />);
    await screen.findAllByText("Morning block");
    expect(screen.getAllByText("Morning").length).toBeGreaterThan(0);
    sinEspanol();
    fireEvent.click(botonConIcono("layout-grid"));
    sinEspanol();
    fireEvent.click(botonConIcono("calendar-days", { ultimo: true }));
    await screen.findByText("Current week");
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: /Create shift/ }));
    const d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
  });

  it("Monitoreo: tabla, grilla, calendario y configuración (con la actividad que arma Hubstaff)", async () => {
    montar(<HRMonitoring />);
    await screen.findByText("12 min ago");
    expect(screen.getByText("1h 5min ago")).toBeTruthy();
    expect(screen.getByText("No activity")).toBeTruthy();
    expect(screen.getByText("Idle")).toBeTruthy();
    sinEspanol();
    fireEvent.click(botonConIcono("layout-grid"));
    sinEspanol();
    fireEvent.click(botonConIcono("calendar-days"));
    sinEspanol();
    fireEvent.click(screen.getByRole("button", { name: /Configure API/ }));
    const d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
  });

  it("Organigrama: tabla, árbol, grilla y por departamento", async () => {
    montar(<HROrganigrama />);
    await screen.findAllByText("Ana Lopez");
    sinEspanol();
    for (const vista of ["Tree", "Grid", "By department"]) {
      fireEvent.click(screen.getByRole("button", { name: vista }));
      sinEspanol();
    }
  });

  it("Directorio y alta de empleado (los cinco pasos)", async () => {
    const { unmount } = montar(<HRDirectoryLookup />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getByText("Remote")).toBeTruthy();
    sinEspanol();
    unmount();

    montar(<EmployeeNew />);
    await screen.findByText("New employee");
    for (let paso = 1; paso <= 5; paso++) {
      sinEspanol();
      if (paso < 5) fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    }
    expect(screen.getByText("Platform access")).toBeTruthy();
    // Los mensajes de validación (zod) también salen en inglés.
    fireEvent.click(screen.getByRole("button", { name: /Create employee/ }));
    fireEvent.click(screen.getByRole("button", { name: /Personal details/ }));
    expect((await screen.findAllByText("Required")).length).toBe(2);
    sinEspanol();
  });

  it("Comunicación interna", async () => {
    montar(<HRAnnouncements />);
    await screen.findByText("Holiday notice");
    expect(screen.getByText("2 audiences")).toBeTruthy();
    sinEspanol();
  });

  it("La ficha de la persona", async () => {
    montar(
      <Routes><Route path="/hr/persona/:id" element={<HRPersonCard />} /></Routes>,
      "/hr/persona/u1",
    );
    await screen.findByText("Alvaro Mejia");
    expect(screen.getByText("Employee")).toBeTruthy();
    expect(screen.getByText("Evening · 4pm–12am")).toBeTruthy();
    sinEspanol();
  });

  it("Asistencia automática y el horario del personal", async () => {
    const { unmount } = montar(<HrAttendanceAuto />);
    await screen.findByText("Check-in and punctuality");
    expect(screen.getByText("Morning · 8am–4pm")).toBeTruthy();
    expect(screen.getByText("Own schedule")).toBeTruthy();
    sinEspanol();
    unmount();

    montar(<HRStaffSchedules />);
    fireEvent.click(await screen.findByText("Alvaro Mejia"));
    await screen.findByText("Monday");
    sinEspanol();
  });
});

// ─── En español no cambia nada ──────────────────────────────────────────
describe("RRHH en español: se ve lo de siempre", () => {
  it("las etiquetas de tipos y estados siguen diciendo lo mismo", async () => {
    localStorage.setItem("app-language", "es");
    const { unmount } = montar(<HRPermisos />);
    await screen.findAllByText("Permiso Médico");
    expect(screen.getAllByText("Llegada Tarde").length).toBeGreaterThan(0);
    expect(screen.getByText("Gestiona las solicitudes de permisos de horario")).toBeTruthy();
    unmount();

    montar(<HRVacations />);
    await screen.findAllByText("Ana Lopez");
    expect(screen.getAllByText("Vacaciones Anuales").length).toBeGreaterThan(0);
    expect(screen.getByText("Vacaciones & Tiempo Libre")).toBeTruthy();
  });
});

// ─── Los catálogos: todo value que se muestra tiene su etiqueta ─────────
describe("RRHH: las etiquetas de los catálogos", () => {
  const casos: Array<[string, readonly { value: string | number }[], Readonly<Record<string, string>>]> = [
    ["ABSENCE_TYPES", ABSENCE_TYPES, etiquetas.TIPO_AUSENCIA],
    ["ABSENCE_STATUSES", ABSENCE_STATUSES, etiquetas.ESTADO_AUSENCIA],
    ["INCIDENT_TYPES", INCIDENT_TYPES, etiquetas.TIPO_INCIDENTE],
    ["INCIDENT_SEVERITIES", INCIDENT_SEVERITIES, etiquetas.SEVERIDAD],
    ["INCIDENT_STATUSES", INCIDENT_STATUSES, etiquetas.ESTADO_INCIDENTE],
    ["DEDUCTION_DISPLAY_TYPES", DEDUCTION_DISPLAY_TYPES, etiquetas.TIPO_DEDUCCION],
    ["DEDUCTION_STATUSES", DEDUCTION_STATUSES, etiquetas.ESTADO_DEDUCCION],
    ["INFRACTION_CATEGORIES", INFRACTION_CATEGORIES, etiquetas.CATEGORIA_INFRACCION],
    ["TRAINING_STATUSES", TRAINING_STATUSES, etiquetas.ESTADO_CAPACITACION],
    ["CONTRACT_TYPES", CONTRACT_TYPES, etiquetas.TIPO_CONTRATO],
    ["WORK_MODALITIES", WORK_MODALITIES, etiquetas.MODALIDAD_TRABAJO],
    ["GENDER_OPTIONS", GENDER_OPTIONS, etiquetas.GENERO],
    ["SALARY_FREQUENCIES", SALARY_FREQUENCIES, etiquetas.FRECUENCIA_PAGO],
    ["BANK_ACCOUNT_TYPES", BANK_ACCOUNT_TYPES, etiquetas.TIPO_CUENTA],
  ];

  it.each(casos)("%s: cada value tiene clave, y su español es el de siempre", (_n, catalogo, claves) => {
    const dic = translations as Record<string, { es: string; en: string }>;
    for (const o of catalogo as readonly { value: string; label: string }[]) {
      const clave = claves[o.value];
      expect(clave, `falta la etiqueta de «${o.value}»`).toBeTruthy();
      // En español la pantalla dice exactamente lo que decía el catálogo.
      expect(dic[clave].es).toBe(o.label);
    }
  });

  it("los documentos de identidad: todos menos NIT (que es la sigla) tienen etiqueta", () => {
    for (const o of NATIONAL_ID_TYPES.filter((x) => x.value !== "NIT")) {
      expect(etiquetas.TIPO_DOCUMENTO[o.value], o.value).toBeTruthy();
    }
  });
});
