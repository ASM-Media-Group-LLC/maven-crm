// RRHH, parte B, en INGLÉS: capacitación por rol, asistencia manual, la ficha
// del empleado, horarios, candidatos, directorio, evaluaciones, onboarding,
// horas extra, nómina, personal y los modales de anuncios. Con la app en EN no
// queda nada visible en español, ni en las tablas ni en los modales que se
// abren desde ahí.
//
// Se montan las pantallas de verdad con el LanguageProvider real. Lo único falso
// es de dónde salen los datos (supabase), así que los hooks corren tal cual. Los
// datos traen los valores COMO SE GUARDAN en la base ("presente", "activo",
// "remoto", "turno_manana"…): el test prueba que se ven traducidos.
//
// Lo que se reemplaza, y por qué:
//  - EmployeeSearchCombobox: es de otra parte de la migración (components/hr).
//  - EmployeeStatusBadge: dibuja el `label` de lib/hrConstants.ts, que también
//    es de otra parte de la migración.
//  - HrAttendanceAuto: la vista automática de asistencia es de RRHH parte A.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

// ─── Datos ──────────────────────────────────────────────────────────────
const HACE = "2026-09-01T12:00:00Z";
const EMP = {
  id: "e1", employee_code: "EMP-001", first_name: "Laura", last_name: "Smith", email: "laura@example.com",
  phone: null, mobile: "+1 555 0100", birth_date: "1995-04-02", gender: "femenino", national_id: "123",
  national_id_type: "CC", address: "Main St 1", city: "Austin", country: "US", profile_photo_url: null,
  emergency_contact_name: "John Smith", emergency_contact_phone: "+1 555 0101", emergency_contact_relation: "Brother",
  department_id: "d1", position_id: "p1", hire_date: "2025-01-15", termination_date: null,
  contract_type: "fijo", work_modality: "remoto", status: "activo", reports_to: null, base_salary: 2500000,
  salary_frequency: "mensual", bank_name: "Otro", bank_account_number: "999", bank_account_type: "ahorros",
  eps: "Sura", arl: "Positiva", afp: "Porvenir", caja_compensacion: "Compensar", notes: null, internal_notes: null,
  created_at: HACE, updated_at: HACE, profile_id: "u1",
  departments: { id: "d1", name: "Operations", code: "OPS", },
  positions: { id: "p1", name: "Analyst", code: "AN" },
};
const EMP2 = { ...EMP, id: "e2", first_name: "Mark", last_name: "Lee", work_modality: "hibrido", contract_type: "indefinido", status: "en_licencia", profile_id: null };

const TABLAS: Record<string, unknown[]> = {
  employees: [EMP, EMP2],
  departments: [{ id: "d1", name: "Operations", code: "OPS", is_active: true }],
  positions: [{ id: "p1", name: "Analyst", code: "AN", is_active: true }],
  profiles: [{ id: "u1", full_name: "Laura Smith", avatar_url: null }],
  user_roles: [{ user_id: "u1", role: "employee" }],
  attendance: [
    { id: "a1", employee_id: "e1", shift: "turno_manana", shift_start: "08:00:00", shift_end: "16:00:00", check_in: "2026-09-01T08:05:00Z", check_out: "2026-09-01T16:00:00Z", date: "2026-09-01", status: "presente", notes: null, created_at: HACE, employees: { first_name: "Laura", last_name: "Smith", employee_code: "EMP-001", department_id: "d1" } },
    { id: "a2", employee_id: "e2", shift: "turno_noche", shift_start: "22:00:00", shift_end: "06:00:00", check_in: null, check_out: null, date: "2026-09-02", status: "ausente", notes: "Sick", created_at: HACE, employees: { first_name: "Mark", last_name: "Lee", employee_code: null, department_id: "d1" } },
    { id: "a3", employee_id: "e1", shift: "turno_tarde", shift_start: null, shift_end: null, check_in: null, check_out: null, date: "2026-09-03", status: "tardanza", notes: null, created_at: HACE, employees: null },
  ],
  employee_training_assignments: [
    { id: "t1", employee_id: "e1", status: "in_progress", start_date: "2026-09-01", completion_date: "2099-01-01", notes: "Focus on security", created_at: HACE,
      employees: { first_name: "Laura", last_name: "Smith", profile_photo_url: null, department_id: "d1", departments: { name: "Operations" } },
      training_programs: { id: "pr1", name: "Security basics", duration_hours: 4, modality: "virtual", target_role: "technology", is_mandatory: true } },
    { id: "t2", employee_id: "e2", status: "assigned", start_date: null, completion_date: null, notes: null, created_at: HACE,
      employees: { first_name: "Mark", last_name: "Lee", profile_photo_url: null, department_id: "d1", departments: { name: "Operations" } },
      training_programs: { id: "pr1", name: "Security basics", duration_hours: 4, modality: "virtual", target_role: "technology", is_mandatory: true } },
  ],
  training_programs: [
    { id: "pr1", name: "Security basics", description: "OWASP top 10", duration_hours: 4, modality: "virtual", provider: "Acme", target_role: "technology", is_mandatory: true, is_active: true },
    { id: "pr2", name: "Git workflow", description: null, duration_hours: null, modality: "hibrido", provider: null, target_role: "technology", is_mandatory: false, is_active: true },
  ],
  training_modules: [
    { id: "m1", training_program_id: "pr1", title: "Intro", description: "Why it matters", duration_minutes: 30, content_type: "video", content_url: "https://example.com/v", is_required: true, position: 0 },
    { id: "m2", training_program_id: "pr1", title: "Quiz", description: null, duration_minutes: null, content_type: "practica", content_url: null, is_required: false, position: 1 },
  ],
  training_module_progress: [{ id: "mp1", assignment_id: "t1", module_id: "m1", status: "completed", completed_at: HACE }],
  work_schedules: [
    { id: "s1", title: "September mornings", schedule_type: "manana", start_date: "2026-09-01", end_date: "2099-12-31", start_time: "08:00:00", end_time: "16:00:00", department_id: null, description: "Front desk", departments: null },
    { id: "s2", title: "Night crew", schedule_type: "noche", start_date: "2026-09-01", end_date: "2026-09-30", start_time: null, end_time: null, department_id: "d1", description: null, departments: { name: "Operations" } },
  ],
  hour_bank: [{ hours: 5, movement_type: "deposit" }, { hours: 2, movement_type: "withdrawal" }],
  overtime: [
    { id: "o1", employee_id: "e1", overtime_type: "dominical", date: "2026-09-06", hours: 3, rate_multiplier: 1.75, notes: "Launch", status: "pending", employees: { first_name: "Laura", last_name: "Smith", email: "laura@example.com", profile_photo_url: null } },
    { id: "o2", employee_id: "e2", overtime_type: "nocturno", date: "2026-09-07", hours: 2, rate_multiplier: 1.35, notes: null, status: "paid", employees: { first_name: "Mark", last_name: "Lee", email: null, profile_photo_url: null } },
  ],
  applicants: [
    { id: "ap1", full_name: "Ana Park", email: "ana@example.com", phone: null, position_applied: "Designer", department_id: "d1", source: "referral", status: "interview", notes: "Great portfolio", created_at: HACE, departments: { name: "Operations" } },
    { id: "ap2", full_name: "Tom Ray", email: null, phone: null, position_applied: null, department_id: null, source: "portal", status: "applied", notes: null, created_at: HACE, departments: null },
  ],
  employee_onboarding: [
    { id: "on1", employee_id: "e1", start_date: "2026-09-01", completion_date: null, status: "in_progress", notes: "Remote setup", buddy_employee_id: "e2", created_at: HACE,
      employees: { first_name: "Laura", last_name: "Smith", email: "laura@example.com", profile_photo_url: null, department_id: "d1", departments: { name: "Operations" }, positions: { name: "Analyst" } },
      buddy: { first_name: "Mark", last_name: "Lee" } },
  ],
  employee_onboarding_tasks: [{ onboarding_id: "on1", status: "completed" }, { onboarding_id: "on1", status: "pending" }],
  performance_evaluations: [
    // Sin `period` a propósito: con uno cargado, los KPI de Evaluaciones se caen
    // («Invalid time value»), igual que en main. Ese arreglo va aparte (ver el PR).
    { id: "pe1", employee_id: "e1", period: null, evaluation_date: "2026-09-10", overall_score: 4.2, punctuality_score: 4, quality_score: 5, teamwork_score: 4, initiative_score: 4,
      strengths: "Fast learner", areas_for_improvement: "Docs", goals_next_period: "1. Ship v2", comments: "Solid", status: "completed", created_at: HACE,
      employees: { first_name: "Laura", last_name: "Smith", employee_code: "EMP-001", department_id: "d1", profile_photo_url: null } },
    { id: "pe2", employee_id: "e2", period: null, evaluation_date: "2026-09-11", overall_score: null, punctuality_score: null, quality_score: null, teamwork_score: null, initiative_score: null,
      strengths: null, areas_for_improvement: null, goals_next_period: null, comments: null, status: "draft", created_at: HACE,
      employees: { first_name: "Mark", last_name: "Lee", employee_code: null, department_id: "d1", profile_photo_url: null } },
  ],
  absences: [{ total_days: 3 }],
  employee_incidents: [],
  employee_documents: [{ id: "doc1", file_name: "contract.pdf", document_type: "contrato", uploaded_at: HACE, file_url: "https://example.com/c.pdf" }],
  employee_history: [
    { id: "h1", change_type: "status_change", field_changed: "status", old_value: "activo", new_value: "suspendido", effective_date: "2026-08-01", reason: "Policy review", notes: null },
    { id: "h2", change_type: "promotion", field_changed: "position_id", old_value: null, new_value: "p1", effective_date: "2026-07-01", reason: null, notes: "Well deserved" },
  ],
  payroll_details: [{ id: "pd1", gross_salary: 2500000, net_total: 2100000, payroll_periods: { id: "pp1", period_name: "2026-08", status: "cerrado", created_at: HACE } }],
  commissions: [{ id: "c1", period: "2026-08", commission_type: "percentage", estimated_amount: 120000, status: "pagado" }],
  employee_deductions: [{ id: "dd1", deduction_type: "adelanto", month_year: "2026-08", amount: 50000, status: "pending" }],
  v_hr_roster: [
    { profile_id: "u1", name: "Laura Smith", role: "employee", in_hubstaff: true },
    { profile_id: "u2", name: "Carl Diaz", role: "coordinator_beta", in_hubstaff: false },
    { profile_id: "u3", name: "Dana Fox", role: "Chatter", in_hubstaff: true },
  ],
  v_hr_payroll: [
    { profile_id: "u1", name: "Laura Smith", role: "employee", base_salary_cop: 2500000, cost_usd: 600, cost_modelado: false, revenue_usd: null, margin_usd: null },
    { profile_id: "u3", name: "Dana Fox", role: "Chatter", base_salary_cop: 0, cost_usd: 900, cost_modelado: true, revenue_usd: 1500, margin_usd: 600 },
  ],
  hr_role_cost: [{ role: "employee", base_salary_cop: 2500000 }, { role: "coordinator_beta", base_salary_cop: 3000000 }],
  v_chatter_hubstaff_effort: [
    { blu_employee_id: "b1", name: "Dana Fox", total_hours: 120, avg_activity_pct: 71, sales: 5000, agency_revenue_usd: 1500, cost_usd: 900, margin_usd: 600, roi_x: 1.7, no_rentable: false, sin_venta_blu: false },
    { blu_employee_id: "b2", name: "Eve Stone", total_hours: 40, avg_activity_pct: 50, sales: 0, agency_revenue_usd: 0, cost_usd: 300, margin_usd: -300, roi_x: 0, no_rentable: true, sin_venta_blu: false },
  ],
  v_closer_hubstaff: [{ name: "Carl Diaz", total_hours: 80, avg_activity_pct: 60, leads: 40, cerradas: 0, monetizacion_usd: 0, usd_por_hora: 0, avg_qa_score: 7, sin_cierres: true }],
  v_llg_hubstaff: [],
  v_qa_effort: [],
  hubstaff_config: [{ last_sync_at: new Date(Date.now() - 5 * 60_000).toISOString() }],
  announcement_views: [{ id: "v1", announcement_id: "an1", user_id: "u1", viewed_at: HACE, opened_at: null }],
};

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const filas = () => TABLAS[tabla] ?? [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "not", "in", "gte", "lte", "order", "limit", "insert", "update", "delete", "upsert"]) {
      q[m] = () => q;
    }
    q.single = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.maybeSingle = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
      Promise.resolve({ data: filas(), error: null, count: filas().length }).then(ok, mal);
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

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));
vi.mock("@/components/hr/EmployeeSearchCombobox", () => ({
  EmployeeSearchCombobox: ({ onChange }: { onChange: (v: string | null) => void }) => (
    <button type="button" data-testid="employee-picker" onClick={() => onChange("e1")}>Laura Smith</button>
  ),
}));
vi.mock("@/components/hr/EmployeeStatusBadge", () => ({
  EmployeeStatusBadge: () => <span data-testid="status-badge" />,
}));
vi.mock("@/pages/hr/HrAttendanceAuto", () => ({ default: () => <div data-testid="attendance-auto" /> }));

import RoleTrainingPage from "@/pages/hr/RoleTrainingPage";
import HRAttendance from "@/pages/hr/HRAttendance";
import EmployeeProfile from "@/pages/hr/EmployeeProfile";
import HRSchedules from "@/pages/hr/HRSchedules";
import HRApplicants from "@/pages/hr/HRApplicants";
import EmployeeDirectory from "@/pages/hr/EmployeeDirectory";
import HRPerformance from "@/pages/hr/HRPerformance";
import HROnboarding from "@/pages/hr/HROnboarding";
import HROvertimeDetail from "@/pages/hr/HROvertimeDetail";
import HRPayroll from "@/pages/hr/HRPayroll";
import HRPersonnel from "@/pages/hr/HRPersonnel";
import CreateAnnouncementModal from "@/pages/hr/announcements/CreateAnnouncementModal";
import AnnouncementDetailModal from "@/pages/hr/announcements/AnnouncementDetailModal";
import AnnouncementFilters from "@/pages/hr/announcements/AnnouncementFilters";
import DeleteAnnouncementDialog from "@/pages/hr/announcements/DeleteAnnouncementDialog";
import type { AnnouncementRow } from "@/pages/hr/announcements/useAnnouncementsAdmin";
import translations from "@/lib/i18n";

// ─── Recorrido ──────────────────────────────────────────────────────────
/** Todo el texto visible y los atributos que se leen en pantalla. */
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
// El detector no conoce todas las palabras ("Turno", "Candidatos", "Tardanza"
// no tienen tilde ni están en su lista). Por eso también se marca todo texto que
// sea EXACTAMENTE el español de una clave del diccionario (cuando en inglés se
// escribe distinto): es el síntoma de un t() que se perdió.
const ESPANOL_DEL_DICCIONARIO = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((par) => par.es !== par.en)
    .map((par) => par.es.trim()),
);
// El pie de la tabla paginada (components/ui/data-table-shell.tsx: "Mostrando
// 1–2 de 2 registros · Filas:") trae su texto escrito adentro. components/ui/ está
// fuera de la migración por decisión y no es de este PR: se ignora acá y queda
// anotado en el PR. Nada más se ignora.
const DE_OTRO_ARCHIVO = new Set(["Mostrando", "Filas:"]);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => !DE_OTRO_ARCHIVO.has(t) && (esEspanol(t) || ESPANOL_DEL_DICCIONARIO.has(t)));

/** `precarga`: consultas que ya llegan con datos, como si estuvieran en caché. */
function montar(pantalla: ReactNode, ruta = "/hr", patron = "*", precarga: [unknown[], unknown][] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const [clave, datos] of precarga) qc.setQueryData(clave, datos);
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[ruta]}>
            <Routes>
              <Route path={patron} element={pantalla} />
            </Routes>
            <Toaster />
          </MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

const dialogoAbierto = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');

/** Abre un diálogo, revisa que no tenga español y lo cierra. */
async function revisarDialogo(abrir: () => void, alAbrir?: (d: HTMLElement) => Promise<void> | void) {
  abrir();
  const d = await waitFor(() => {
    const abierto = dialogoAbierto();
    if (!abierto) throw new Error("no se abrió ningún diálogo");
    return abierto;
  });
  expect(enEspanol(d)).toEqual([]);
  await alAbrir?.(d);
  expect(enEspanol(document.body)).toEqual([]);
  fireEvent.keyDown(document.activeElement ?? d, { key: "Escape" });
  await waitFor(() => expect(dialogoAbierto()).toBeNull());
}

const pestana = (nombre: string | RegExp) => {
  const p = screen.getByRole("tab", { name: nombre });
  fireEvent.mouseDown(p);
  fireEvent.click(p);
};

beforeEach(() => {
  localStorage.setItem("app-language", "en");
});

describe("RRHH › Capacitación por rol en inglés", () => {
  it("la lista, el detalle, la configuración, los módulos y la asignación", async () => {
    montar(<RoleTrainingPage targetRole="technology" roleLabel="Tecnología" />);
    await screen.findAllByText("Security basics");
    // El nombre del rol llega en español por prop: se dibuja traducido.
    expect(screen.getByText("Technology training")).toBeTruthy();
    expect(screen.getByText("Technology programs")).toBeTruthy();
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(screen.getByText("Mandatory")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    // Detalle de una asignación (el ojo de la primera fila).
    fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
    await screen.findByText("Program modules");
    await screen.findByText("Intro");
    expect(screen.getByText("Program role")).toBeTruthy();
    expect(screen.getByText("Technology")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    // Configuración → programas (tarjetas y tabla) → módulos.
    fireEvent.click(await screen.findByRole("button", { name: /Settings/ }));
    await screen.findByText("Manage training programs and modules");
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(screen.getByText("Hybrid")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /New program/ })));
    fireEvent.click(screen.getAllByRole("button", { name: /Modules/ })[0]);
    await screen.findByText("Program modules · 2 modules");
    expect(screen.getByText("Practice")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /New module/ })));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]));
  });

  it("el calendario y la asignación nueva", async () => {
    montar(<RoleTrainingPage targetRole="technology" roleLabel="Tecnología" />);
    await screen.findAllByText("Security basics");
    fireEvent.click(screen.getByRole("button", { name: "Calendar view" }));
    expect(screen.getByText("MON")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Assign/ }));
    await screen.findByText("Assign training — Technology");
    expect(enEspanol()).toEqual([]);
  });
});

describe("RRHH › Asistencia manual en inglés", () => {
  it("la tabla, los KPI, el alta y la edición", async () => {
    montar(<HRAttendance />);
    expect(await screen.findByTestId("attendance-auto")).toBeTruthy();
    expect(screen.getByText("Automatic check-in and punctuality from Hubstaff")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Manual" }));
    await screen.findAllByText("Laura Smith");
    // Lo guardado ("presente", "turno_manana") se ve traducido.
    expect(screen.getAllByText("Present").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Absent").length).toBeGreaterThan(1);
    expect(screen.getByText("Morning shift")).toBeTruthy();
    expect(screen.getByText("Showing 3 of 3 records")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /\+ Record/ })));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Absent/ })), (d) => {
      expect(within(d).getByText("Absent — 1")).toBeTruthy();
    });
  });
});

describe("RRHH › Ficha del empleado en inglés", () => {
  it("cada pestaña", async () => {
    montar(<EmployeeProfile />, "/hr/empleado/e1", "/hr/empleado/:id");
    await screen.findAllByText("Laura Smith");
    expect(screen.getByText("Fixed term")).toBeTruthy();
    expect(screen.getByText("Remote")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    for (const [tab, visible] of [
      ["Work info", "Savings account"],
      ["Time tracking", "Attendance (30 days)"],
      [/Performance/, "Completed"],
      [/Documents/, /Employment contract/],
      ["Finance", "Payroll advance"],
      [/History/, "Suspended"],
      ["Access", "Access active"],
    ] as const) {
      pestana(tab);
      expect(await screen.findByText(visible)).toBeTruthy();
      expect(enEspanol()).toEqual([]);
    }
    // El rol vinculado ("employee") y el banco guardado como "Otro".
    expect(screen.getByText("Employee")).toBeTruthy();
    pestana("Work info");
    expect(screen.getByText("Other")).toBeTruthy();
  });
});

describe("RRHH › Horarios, candidatos, directorio y evaluaciones en inglés", () => {
  it("horarios: lista, tarjetas, calendario y el alta", async () => {
    montar(<HRSchedules />);
    await screen.findByText("September mornings");
    expect(screen.getAllByText("Morning").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Calendar view" }));
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getAllByText("MON").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Create shift/ })));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Shifts today/ })));
  });

  it("candidatos: tabla, tarjetas y cada modal", async () => {
    montar(<HRApplicants />);
    await screen.findByText("Ana Park");
    expect(screen.getByText("Referral")).toBeTruthy();
    expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    const fila = screen.getByText("Ana Park").closest("tr") as HTMLElement;
    const botones = within(fila).getAllByRole("button");
    await revisarDialogo(() => fireEvent.click(botones[0]));
    await revisarDialogo(() => fireEvent.click(botones[1]));
    await revisarDialogo(() => fireEvent.click(botones[2]), (d) => {
      expect(within(d).getByText("Ana Park")).toBeTruthy();
    });
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Interviewing/ })));
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(await screen.findByText("Job board")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("directorio: tabla, tarjetas y el cambio de estado", async () => {
    montar(<EmployeeDirectory />);
    await screen.findByText("Laura Smith");
    expect(screen.getAllByText("Remote").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Hybrid").length).toBeGreaterThan(1);
    expect(screen.getByText("Indefinite term")).toBeTruthy();
    expect(screen.getByText("2 results")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Change status" })[0]));
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Remote work/ })));
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(enEspanol()).toEqual([]);
  });

  it("evaluaciones: el operativo y las evaluaciones manuales", async () => {
    montar(<HRPerformance />);
    await screen.findByText("Dana Fox");
    expect(screen.getByText("profitable")).toBeTruthy();
    expect(screen.getByText("unprofitable")).toBeTruthy();
    expect(screen.getByText(/^Synced \d+ min ago$/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Closer/ }));
    expect(await screen.findByText("no closings")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /LLG/ }));
    expect(await screen.findByText("No data for this role yet.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Evaluations" }));
    await screen.findAllByText("Laura Smith");
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector(".lucide-eye"))!));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /With goals/ })));
  });
});

describe("RRHH › Onboarding, horas extra, nómina y personal en inglés", () => {
  it("onboarding: tabla y modales", async () => {
    montar(<HROnboarding />);
    await screen.findByText("Analyst");
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    const fila = screen.getByText("Analyst").closest("tr") as HTMLElement;
    const botones = within(fila).getAllByRole("button");
    await revisarDialogo(() => fireEvent.click(botones[0]));
    await revisarDialogo(() => fireEvent.click(botones[1]));
    await revisarDialogo(() => fireEvent.click(botones[2]));
  });

  it("horas extra: tabla, tarjetas y modales", async () => {
    montar(<HROvertimeDetail />);
    await screen.findAllByText("Laura Smith");
    expect(screen.getByText("Sunday/holiday")).toBeTruthy();
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Record overtime/ })));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /Total hours/ })));
    fireEvent.click(screen.getByRole("button", { name: "Card view" }));
    expect(screen.getByText(/Type: Night/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("nómina y costo, con el editor de salarios", async () => {
    // Los costos por rol llegan ya cargados: mientras esa consulta carga, la
    // pantalla (igual que en main) vuelve a renderizar sin parar por su
    // `roleCosts = []` y el test se cuelga. Ese arreglo va aparte (ver el PR).
    montar(<HRPayroll />, "/hr", "*", [[["hr-role-cost"], TABLAS.hr_role_cost]]);
    await screen.findByText("Dana Fox");
    expect(screen.getAllByText("Employee").length).toBeGreaterThan(0);
    expect(screen.getByText("modeled")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /Base salaries by role/ }));
    expect(await screen.findByText("Coordinator")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("personal: los roles guardados se leen en inglés", async () => {
    montar(<HRPersonnel />);
    await screen.findByText("Carl Diaz");
    expect(screen.getAllByText("Coordinator").length).toBeGreaterThan(0);
    expect(screen.getByText("Profile per person with hours, punctuality, cost and revenue (Hubstaff/BLU) · 3 people")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("RRHH › En español no cambia nada", () => {
  it("capacitación y asistencia se leen como siempre", async () => {
    localStorage.setItem("app-language", "es");
    const { unmount } = montar(<RoleTrainingPage targetRole="technology" roleLabel="Tecnología" />);
    await screen.findAllByText("Security basics");
    expect(screen.getByText("Capacitación Tecnología")).toBeTruthy();
    expect(screen.getAllByText("En Progreso").length).toBeGreaterThan(0);
    expect(screen.getByText("Obligatorio")).toBeTruthy();
    unmount();

    montar(<HRAttendance />);
    fireEvent.click(await screen.findByRole("button", { name: "Manual" }));
    await screen.findAllByText("Laura Smith");
    expect(screen.getByText("Turno Mañana")).toBeTruthy();
    expect(screen.getAllByText("Presente").length).toBeGreaterThan(0);
    expect(screen.getByText("Mostrando 3 de 3 registros")).toBeTruthy();
  });

  // Donde la pantalla mostraba el valor GUARDADO tal cual ("fijo", "ahorros",
  // "pending"…), en español se sigue viendo así: la etiqueta es solo para inglés.
  it("la ficha muestra lo guardado tal cual, como siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar(<EmployeeProfile />, "/hr/empleado/e1", "/hr/empleado/:id");
    await screen.findAllByText("Laura Smith");
    expect(screen.getByText("fijo")).toBeTruthy();
    expect(screen.getByText("remoto")).toBeTruthy();
    for (const [tab, visibles] of [
      ["Info Laboral", ["femenino", "ahorros", "mensual", "Otro"]],
      [/Documentos/, [/^contrato ·/]],
      ["Finanzas", ["cerrado", "pagado", "adelanto", "pending"]],
      [/Historial/, ["activo", "suspendido", "Estado:"]],
      ["Acceso", ["Empleado"]],
    ] as const) {
      pestana(tab);
      for (const v of visibles) expect(await screen.findByText(v)).toBeTruthy();
    }
  });

  it("los KPI, el detalle de un anuncio y la sincronización, como siempre", async () => {
    localStorage.setItem("app-language", "es");
    const candidatos = montar(<HRApplicants />);
    await screen.findByText("Ana Park");
    fireEvent.click(screen.getByRole("button", { name: /En Entrevista/ }));
    const kpi = await screen.findByRole("dialog");
    expect(within(kpi).getByText("interview")).toBeTruthy();
    candidatos.unmount();

    const anuncio = montar(
      <AnnouncementDetailModal open onOpenChange={() => {}} announcement={{
        id: "an1", title: "Office closed", message: "We're closed.", content_html: null, announcement_type: "holiday",
        priority: "high", is_active: true, status: "scheduled", visibility: "segmented", delivery_channels: ["feed", "banner"],
        related_module: null, recurrence_type: "none", recurrence_end_at: null, attachment_url: null, attachment_name: null,
        image_url: null, view_count: 0, open_count: 0, starts_at: HACE, expires_at: null, created_at: HACE, created_by: null,
        updated_at: HACE,
        audience: [
          { id: "x1", announcement_id: "an1", target_type: "all", target_id: null, target_label: "Toda la empresa" },
          { id: "x2", announcement_id: "an1", target_type: "role", target_id: "employee", target_label: "Empleado" },
        ],
      } as AnnouncementRow} />,
    );
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("feed")).toBeTruthy();
    expect(within(d).getByText("banner")).toBeTruthy();
    pestana("Audiencia");
    expect(await within(d).findByText("segmented")).toBeTruthy();
    expect(within(d).getByText("all:")).toBeTruthy();
    expect(within(d).getByText("role:")).toBeTruthy();
    expect(within(d).getByText("Toda la empresa")).toBeTruthy();
    expect(within(d).getByText("Empleado")).toBeTruthy();
    anuncio.unmount();

    montar(<HRPerformance />);
    expect(await screen.findByText("Sincronizado hace 5 min")).toBeTruthy();
  });
});

describe("RRHH › Performance operativo sin sincronizar", () => {
  const sincronizado = TABLAS.hubstaff_config;
  afterEach(() => { TABLAS.hubstaff_config = sincronizado; });

  it("en inglés se lee entero, sin «Synced» delante; en español, como siempre", async () => {
    TABLAS.hubstaff_config = [{ last_sync_at: null }];
    const en = montar(<HRPerformance />);
    expect(await screen.findByText("Not synced yet")).toBeTruthy();
    expect(screen.queryByText(/Synced/)).toBeNull();
    en.unmount();

    localStorage.setItem("app-language", "es");
    montar(<HRPerformance />);
    expect(await screen.findByText("Sincronizado sin sincronizar")).toBeTruthy();
  });
});

describe("RRHH › Anuncios en inglés", () => {
  const ANUNCIO = {
    id: "an1", title: "Office closed", message: "We're closed on Monday.", content_html: null, announcement_type: "holiday",
    priority: "high", is_active: true, status: "scheduled", visibility: "segmented", delivery_channels: ["feed", "banner"],
    related_module: null, recurrence_type: "none", recurrence_end_at: null, attachment_url: "https://example.com/a.pdf",
    attachment_name: null, image_url: null, view_count: 3, open_count: 1, starts_at: HACE, expires_at: "2026-10-01T12:00:00Z",
    created_at: HACE, created_by: null, updated_at: HACE,
    // Las etiquetas guardadas están en español (las lee todo el mundo en el listado).
    audience: [
      { id: "x1", announcement_id: "an1", target_type: "all", target_id: null, target_label: "Toda la empresa" },
      { id: "x2", announcement_id: "an1", target_type: "role", target_id: "employee", target_label: "Empleado" },
    ],
  } as AnnouncementRow;

  it("el alta, paso por paso", async () => {
    montar(<CreateAnnouncementModal open onOpenChange={() => {}} />);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("New announcement")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.change(within(d).getByPlaceholderText("Announcement title"), { target: { value: "Hi" } });
    fireEvent.click(within(d).getByRole("button", { name: /Next/ }));
    expect(await within(d).findByText("Publish as")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByRole("button", { name: /Next/ }));
    expect(await within(d).findByText("Delivery channels")).toBeTruthy();
    expect(within(d).getByText("Announcement board")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("el detalle: contenido, métricas y audiencia", async () => {
    montar(<AnnouncementDetailModal open onOpenChange={() => {}} announcement={ANUNCIO} />);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("High")).toBeTruthy();
    expect(within(d).getByText("Scheduled")).toBeTruthy();
    expect(within(d).getByText("Dashboard banner")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    pestana("Metrics");
    expect(await within(d).findByText("Users reached")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    pestana("Audience");
    // El target_label guardado en español se dibuja en el idioma de quien mira.
    expect(await within(d).findByText("Whole company")).toBeTruthy();
    expect(within(d).getByText("Employee")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("los filtros y el borrado", async () => {
    montar(
      <>
        <AnnouncementFilters search="" onSearchChange={() => {}} filterType="all" onFilterTypeChange={() => {}} filterPriority="all" onFilterPriorityChange={() => {}} />
        <DeleteAnnouncementDialog open onOpenChange={() => {}} announcementId="an1" />
      </>,
    );
    expect(await screen.findByText("Delete announcement?")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search announcements...")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});
