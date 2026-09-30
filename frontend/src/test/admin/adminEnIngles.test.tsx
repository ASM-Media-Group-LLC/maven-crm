// Admin en INGLÉS: usuarios, papelera, roles y su modal de permisos, auditoría,
// reportes programados y Cowork vs Hubstaff, con la app en EN. Nada visible en
// español, ni en las tablas ni en cada modal que se abre desde ahí.
//
// Se montan las pantallas de verdad con el LanguageProvider real. Lo único falso
// es de dónde salen los datos (supabase y adminInvoke), así que los hooks
// (useAdminUsers, useRoles, useAuditoriaData, useReportSchedules…) corren tal
// cual: si uno vuelve a armar un texto en español, este test lo ve.
//
// ⚠️ Los nombres de módulos/submódulos del catálogo de permisos son LLAVES de
// role_permissions: se prueba que se VEN en inglés y que la llave no cambió.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { esEspanol } from "../i18n/detectarEspanol";

// Son pantallas enteras con decenas de diálogos: con toda la suite corriendo en
// paralelo, el segundo de espera por defecto de findBy/waitFor (y los 5 s por
// test) a veces no alcanza y el test falla sin que haya nada roto.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

// ─── Datos ──────────────────────────────────────────────────────────────
const HACE = "2026-08-01T12:00:00Z";
const TABLAS: Record<string, unknown[]> = {
  profiles: [
    { id: "u1", full_name: "Alvaro Mejia", avatar_url: null, avatar_seed: null, created_at: HACE, ai_daily_quota_override: null },
    { id: "u2", full_name: null, avatar_url: null, avatar_seed: null, created_at: HACE, ai_daily_quota_override: null },
    { id: "u3", full_name: "Jane Doe", avatar_url: null, avatar_seed: null, created_at: HACE, ai_daily_quota_override: 5 },
  ],
  employees: [],
  roles_config: [
    { id: "r1", name: "admin", description: null, is_active: true, is_system: true, ai_daily_quota: null, level: 100, created_at: HACE, updated_at: HACE },
    { id: "r2", name: "Chatter", description: null, is_active: true, is_system: false, ai_daily_quota: 20, level: 25, created_at: HACE, updated_at: HACE },
    { id: "r3", name: "supervisor", description: "Team lead", is_active: false, is_system: true, ai_daily_quota: null, level: 55, created_at: HACE, updated_at: HACE },
  ],
  user_roles: [
    { user_id: "u1", role: "admin" },
    { user_id: "u3", role: "Chatter" },
  ],
  role_groups: [
    { role_name: "admin", is_admin: true, is_manager_or_above: true, is_supervisor_or_above: true, is_member: true },
    { role_name: "supervisor", is_admin: false, is_manager_or_above: false, is_supervisor_or_above: true, is_member: true },
  ],
  role_permissions: [
    { role_id: "r2", module: "Contactos", submodule: null, can_access: true, data_scope: "subordinates" },
    { role_id: "r2", module: "Creadores", submodule: "Lista", can_access: true, data_scope: "self" },
    { role_id: "r2", module: "Creator Sales", submodule: null, can_access: true, data_scope: "all" },
    // Huérfano: su rol ya no existe.
    { role_id: "borrado", module: "Tickets", submodule: null, can_access: true, data_scope: "all" },
  ],
  audit_log: [
    { id: "a1", user_id: "u1", action: "role_assigned", target_type: "user", target_id: "u3", details: { role: "Chatter" }, created_at: HACE },
    { id: "a2", user_id: "u2", action: "role_changed", target_type: "user", target_id: "u2", details: { old_role: "Chatter", new_role: "supervisor" }, created_at: HACE },
    { id: "a3", user_id: "nadie", action: "role_removed", target_type: "user", target_id: "u2", details: { role: "closer" }, created_at: HACE },
    { id: "a4", user_id: "u1", action: "permission_changed", target_type: "role", target_id: "r2", details: {}, created_at: HACE },
  ],
  report_schedules: [
    { id: "s1", name: "Weekly LLG", module: "llg", role_name: "LLG", period: "weekly", dispatch_hour: 8, dispatch_weekdays: [3, 1], dispatch_days_of_month: null, dispatch_month_of_year: null, email_subject: null, metrics: ["llg.nuevos", "llg.total"], combined_roles: null, is_active: true, last_dispatched_at: HACE, created_at: HACE, updated_at: HACE },
    { id: "s2", name: "Monthly closers", module: "closers", role_name: "closer", period: "monthly", dispatch_hour: 9, dispatch_weekdays: null, dispatch_days_of_month: [5], dispatch_month_of_year: null, email_subject: null, metrics: null, combined_roles: null, is_active: false, last_dispatched_at: null, created_at: HACE, updated_at: HACE },
    { id: "s3", name: "Yearly chatters", module: "chatters", role_name: "Chatter Supervisor", period: "annual", dispatch_hour: 7, dispatch_weekdays: null, dispatch_days_of_month: [2], dispatch_month_of_year: 3, email_subject: "Custom", metrics: null, combined_roles: null, is_active: true, last_dispatched_at: null, created_at: HACE, updated_at: HACE },
    { id: "s4", name: "Biweekly mix", module: "combined", role_name: "__combined__", period: "quincenal", dispatch_hour: 10, dispatch_weekdays: null, dispatch_days_of_month: [1, 16], dispatch_month_of_year: null, email_subject: null, metrics: ["llg.nuevos", "closer.asignadas"], combined_roles: ["LLG", "closer"], is_active: true, last_dispatched_at: null, created_at: HACE, updated_at: HACE },
    { id: "s5", name: "Daily closers", module: "closers", role_name: "closer", period: "daily", dispatch_hour: 6, dispatch_weekdays: [1, 2, 3, 4, 5], dispatch_days_of_month: null, dispatch_month_of_year: null, email_subject: null, metrics: null, combined_roles: null, is_active: true, last_dispatched_at: null, created_at: HACE, updated_at: HACE },
  ],
  report_recipients: [
    { id: "rr1", schedule_id: "s1", email: "a@example.com", user_id: null },
    { id: "rr2", schedule_id: "s3", email: "b@example.com", user_id: null },
    { id: "rr3", schedule_id: "s3", email: "c@example.com", user_id: null },
    { id: "rr4", schedule_id: "s4", email: "d@example.com", user_id: null },
    { id: "rr5", schedule_id: "s5", email: "e@example.com", user_id: null },
  ],
};

const dia = (d: string, p: string, nombre: string, extra: Record<string, number | null>) => ({
  dia: d, profile_id: p, nombre, hubstaff_seg: 0, hubstaff_actividad: null, cowork_activo_seg: 0, cowork_pausa_seg: 0,
  cowork_sin_camara_seg: 0, cowork_sin_pantalla_seg: 0, cowork_fuera_seg: 0, cowork_en_sala_seg: 0, cowork_sesiones: 0,
  cowork_sin_conexion_seg: 0, cowork_sin_conexion_larga_seg: 0, ...extra,
});
const RPCS: Record<string, unknown[]> = {
  admin_list_user_roles: [
    { user_id: "u1", role: "admin", level: 100, manageable: false },
    { user_id: "u2", role: null, level: 0, manageable: true },
    { user_id: "u3", role: "Chatter", level: 25, manageable: true },
  ],
  admin_cowork_vs_hubstaff: [
    dia("2026-09-24", "p1", "Alvaro Mejia", { hubstaff_seg: 28800, hubstaff_actividad: 61, cowork_activo_seg: 21600, cowork_en_sala_seg: 27000, cowork_pausa_seg: 1800, cowork_sin_camara_seg: 1200, cowork_sin_pantalla_seg: 1200, cowork_fuera_seg: 1200 }),
    dia("2026-09-25", "p1", "Alvaro Mejia", { hubstaff_seg: 3600 }),
    dia("2026-09-25", "p2", "Jane Doe", { hubstaff_seg: 7200, cowork_activo_seg: 7000, cowork_en_sala_seg: 7200 }),
  ],
};

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const filas = () => TABLAS[tabla] ?? [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is", "not", "in", "order", "limit", "insert", "update", "delete", "upsert"]) {
      q[m] = () => q;
    }
    q.maybeSingle = () => Promise.resolve({ data: filas()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
      Promise.resolve({ data: filas(), error: null }).then(ok, mal);
    return q;
  };
  return {
    supabase: {
      from: consulta,
      rpc: (fn: string) => Promise.resolve({ data: RPCS[fn] ?? [], error: null }),
      functions: {
        invoke: () => Promise.resolve({
          data: { html: "<p>preview</p>", subject: "Maven CRM", from: HACE, to: HACE, row_count: 4 },
          error: null,
        }),
      },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});

// Lo que contesta cada acción de las edge functions de admin.
const RESPUESTAS: Record<string, unknown> = {
  list_users: { users: [{ id: "u1", email: "alvaro@maven-ai.me" }, { id: "u3", email: "jane@gmail.com" }] },
  list_deleted_users: {
    dias_de_papelera: 30,
    users: [
      { id: "d1", full_name: "Old Person", avatar_url: null, avatar_seed: null, email: "old@example.com", deleted_at: HACE, deleted_by: "u1", deleted_by_name: "Alvaro Mejia", dias_restantes: 12 },
      { id: "d2", full_name: null, avatar_url: null, avatar_seed: null, email: "", deleted_at: HACE, deleted_by: null, deleted_by_name: null, dias_restantes: 0 },
      { id: "d3", full_name: "Someone", avatar_url: null, avatar_seed: null, email: "s@example.com", deleted_at: HACE, deleted_by: null, deleted_by_name: null, dias_restantes: 1 },
    ],
  },
  create_user: { email: "new.person@maven-ai.me", temp_password: "Tmp-123", hand_delivery: true, mailbox: { ok: false, error: "quota" } },
  reset_password: { temp_password: "Tmp-456", email_sent: false, email_error: "RESEND_API_KEY no configurada" },
  migrate_email: { success: true, email: "jane@maven-ai.me", mailbox: { ok: true, email_address: "jane@maven-ai.me", outcome: "created", error: null } },
  delete_user: { mailbox_removed: "jane@maven-ai.me" },
};
vi.mock("@/lib/adminInvoke", async () => {
  const real = await vi.importActual<typeof import("@/lib/adminInvoke")>("@/lib/adminInvoke");
  return {
    ...real,
    adminInvoke: (_fn: string, body: { action?: string }) => Promise.resolve(RESPUESTAS[body.action ?? ""] ?? {}),
  };
});

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, role: "admin", isLoading: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));
vi.mock("@/hooks/usePermissions", async () => {
  const real = await vi.importActual<typeof import("@/hooks/usePermissions")>("@/hooks/usePermissions");
  return { ...real, usePermissions: () => ({ canAccess: () => true, isLoading: false }) };
});

import AdminUsuarios from "@/pages/admin/AdminUsuarios";
import AuditoriaRoles from "@/pages/admin/AuditoriaRoles";
import AdminReportes from "@/pages/admin/AdminReportes";
import CoworkVsHubstaff from "@/pages/admin/CoworkVsHubstaff";
import { MODULES_CONFIG } from "@/pages/admin/useRoles";
import { ETIQUETAS, IGUAL_EN_INGLES, etiquetaPermiso, nombreVisibleDeSeccion } from "@/pages/admin/etiquetasPermisos";
import { METRICS_CATALOG } from "@/hooks/reportMetricsCatalog";
import { admin } from "@/lib/i18n/admin";
import translations, { getTranslation, type TranslationKey } from "@/lib/i18n";

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
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
// El detector no conoce todas las palabras: "Recuperar", "Lista" o "Tablero" no
// tienen tilde ni están en su lista, y pasarían. Por eso también se marca todo
// texto que sea EXACTAMENTE el español de una clave del diccionario (cuando no se
// escribe igual en inglés): es el síntoma de un t() que se perdió.
const ESPANOL_DEL_DICCIONARIO = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((par) => par.es !== par.en)
    .map((par) => par.es.trim()),
);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || ESPANOL_DEL_DICCIONARIO.has(t));

function montar(pantalla: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter initialEntries={["/admin/usuarios"]}>
          {pantalla}
          <Toaster />
          <Sonner />
        </MemoryRouter>
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

const filaDe = (nombre: string) => screen.getByText(nombre).closest("tr") as HTMLElement;

beforeEach(() => {
  localStorage.setItem("app-language", "en");
});

describe("Admin › Usuarios en inglés", () => {
  it("la lista, las tarjetas y cada modal de una persona", async () => {
    montar(<AdminUsuarios />);
    await screen.findByText("Jane Doe");
    expect(screen.getByText("User management")).toBeTruthy();
    expect(screen.getByText("No name")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    const jane = () => filaDe("Jane Doe");
    await revisarDialogo(() => fireEvent.click(within(jane()).getByLabelText("Edit")));
    await revisarDialogo(() => fireEvent.click(within(jane()).getByLabelText("Assign role")));
    await revisarDialogo(
      () => fireEvent.click(within(jane()).getByLabelText("Reset password")),
      async (d) => {
        fireEvent.click(within(d).getByRole("button", { name: "Reset password" }));
        await within(d).findByText("The password was reset successfully.");
        // El error del servidor es un dato: se reconoce y se muestra traducido.
        expect(within(d).getByText(/RESEND_API_KEY isn't set/)).toBeTruthy();
        expect(enEspanol(d)).toEqual([]);
      },
    );
    await revisarDialogo(
      () => fireEvent.click(within(jane()).getByLabelText("Change email / create mailbox")),
      async (d) => {
        fireEvent.click(within(d).getByRole("button", { name: "Change email and create mailbox" }));
        await within(d).findByText("Email changed.");
        expect(enEspanol(d)).toEqual([]);
      },
    );
    await revisarDialogo(() => fireEvent.click(within(jane()).getByLabelText("Delete")), async (d) => {
      fireEvent.click(within(d).getByRole("button", { name: "Delete" }));
      // El aviso de "quedó eliminado" también sale en inglés.
      expect(await screen.findByText("Jane Doe was deleted")).toBeTruthy();
    });

    // Las tarjetas.
    fireEvent.click(screen.getByLabelText("Card view"));
    await waitFor(() => expect(document.querySelector("table")).toBeNull());
    expect(enEspanol()).toEqual([]);
  });

  it("el alta: el formulario y la entrega de la contraseña", async () => {
    montar(<AdminUsuarios />);
    await screen.findByText("Jane Doe");
    fireEvent.click(screen.getByRole("button", { name: /Add user/ }));
    const d = await screen.findByRole("dialog");
    expect(enEspanol(d)).toEqual([]);
    fireEvent.change(within(d).getByPlaceholderText("First name"), { target: { value: "New" } });
    fireEvent.change(within(d).getByPlaceholderText("Last name"), { target: { value: "Person" } });
    expect(await within(d).findByText(/They'll sign in with/)).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    // Correo externo.
    fireEvent.click(within(d).getByText("External email"));
    expect(within(d).getByPlaceholderText("person@gmail.com")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByText("Maven mailbox"));
    fireEvent.click(within(d).getByRole("button", { name: "Add" }));
    expect(await within(d).findByText("User created")).toBeTruthy();
    expect(within(d).getByText(/the mailbox couldn't be created \(quota\)/)).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("la papelera (Eliminadas) y su confirmación de borrado", async () => {
    montar(<AdminUsuarios />);
    await screen.findByText("Jane Doe");
    fireEvent.click(screen.getByRole("button", { name: "Deleted" }));
    await screen.findByText("Old Person");
    expect(screen.getByText("today")).toBeTruthy();
    expect(screen.getByText("1 day")).toBeTruthy();
    expect(screen.getByText("12 days")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getByLabelText("Permanently delete Old Person")));
  });
});

describe("Admin › Roles en inglés", () => {
  const abrirRoles = async () => {
    montar(<AdminUsuarios />);
    await screen.findByText("Jane Doe");
    fireEvent.click(screen.getByRole("button", { name: "Roles" }));
    await screen.findAllByTitle("Manage this role's users");
  };

  it("la tabla, las tarjetas y los modales de alta, edición y borrado", async () => {
    await abrirRoles();
    expect(screen.getAllByText("System").length).toBe(2);
    expect(enEspanol()).toEqual([]);
    const chatter = () => filaDe("Chatter");
    await revisarDialogo(() => fireEvent.click(within(chatter()).getByLabelText("Edit")));
    await revisarDialogo(() => fireEvent.click(within(chatter()).getByLabelText("Delete")));
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /New role/ })));
    fireEvent.click(screen.getByLabelText("Card view"));
    await waitFor(() => expect(document.querySelector("table")).toBeNull());
    expect(screen.getAllByText("1 user").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
  });

  it("el modal de permisos, con todas las secciones abiertas", async () => {
    await abrirRoles();
    await revisarDialogo(
      () => fireEvent.click(within(filaDe("Chatter")).getByLabelText("Permissions")),
      async (d) => {
        for (const b of within(d).getAllByLabelText("Show subtabs")) fireEvent.click(b);
        expect(within(d).getByText("Control panel")).toBeTruthy();
        expect(within(d).getByText("Revenue")).toBeTruthy();
        expect(within(d).getByText("Human resources")).toBeTruthy();
        expect(within(d).getByText("Guidelines")).toBeTruthy();
        expect(within(d).getByText("Convert to creator")).toBeTruthy();
        expect(enEspanol(d)).toEqual([]);
      },
    );
    // Con todas las secciones abiertas son cientos de casillas: es el más lento.
  }, 60_000);

  it("gestionar los usuarios de un rol, con sus dos confirmaciones", async () => {
    await abrirRoles();
    await revisarDialogo(
      () => fireEvent.click(within(filaDe("Chatter")).getByTitle("Manage this role's users")),
      async (d) => {
        expect(within(d).getByText("1 user with this role.")).toBeTruthy();
        fireEvent.click(within(d).getByRole("button", { name: "Remove" }));
        const quitar = await screen.findByRole("alertdialog");
        expect(within(quitar).getByText(/will be left without a role/)).toBeTruthy();
        expect(enEspanol(quitar)).toEqual([]);
        fireEvent.click(within(quitar).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

        const pestana = within(d).getByRole("tab", { name: "Add" });
        fireEvent.mouseDown(pestana);
        fireEvent.click(pestana);
        await within(d).findByText("No name");
        expect(enEspanol(d)).toEqual([]);
        // Alvaro ya es admin: agregarlo a Chatter pide confirmación.
        const alvaro = within(d).getByText("Alvaro Mejia").closest("li") as HTMLElement;
        fireEvent.click(within(alvaro).getByRole("button", { name: "Add" }));
        const cambiar = await screen.findByRole("alertdialog");
        expect(within(cambiar).getByText(/currently has the/)).toBeTruthy();
        expect(enEspanol(cambiar)).toEqual([]);
        fireEvent.click(within(cambiar).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      },
    );
  });
});

describe("Admin › Auditoría en inglés", () => {
  it("resumen con sus hallazgos abiertos, matriz y actividad", async () => {
    montar(<AuditoriaRoles />);
    await screen.findByText("Users and roles");
    expect(screen.getByText("Role audit")).toBeTruthy();
    // Abrir cada hallazgo para ver a quién afecta.
    for (const b of screen.getAllByRole("button").filter((b) => b.getAttribute("aria-controls"))) fireEvent.click(b);
    expect(await screen.findByText("Users without a role")).toBeTruthy();
    expect(screen.getByText("Orphan permission")).toBeTruthy();
    expect(screen.getByText('Permission for module "Tickets" with no valid role')).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Permission matrix" }));
    expect(await screen.findByText("Contacts")).toBeTruthy();
    expect(screen.getByText("Subordinates")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Activity" }));
    expect(await screen.findByText('The "Chatter" role was assigned to Alvaro Mejia')).toBeTruthy();
    expect(screen.getByText('The "closer" role was removed from Unknown user')).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("Admin › Reportes programados en inglés", () => {
  it("la lista, la vista previa y las dos confirmaciones", async () => {
    montar(<AdminReportes />);
    await screen.findByText("Weekly LLG");
    expect(screen.getByText("No recipients")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getAllByRole("button", { name: /Email preview/ })[0]);
    expect(await screen.findByText(/4 rows/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    await revisarDialogo(() => fireEvent.click(screen.getAllByRole("button", { name: /Send now/ })[0]));
    await revisarDialogo(() => fireEvent.click(screen.getAllByLabelText("Delete")[0]));
  });

  it("el modal, en cada periodicidad (semanal, mensual, anual, quincenal combinado y diario)", async () => {
    montar(<AdminReportes />);
    await screen.findByText("Weekly LLG");
    const editar = (i: number) => () => fireEvent.click(screen.getAllByLabelText("Edit")[i]);
    await revisarDialogo(editar(0), async (d) => {
      expect(await within(d).findByText("New leads")).toBeTruthy();
      expect(within(d).getByText(/Every Monday, Wednesday at 08:00 Miami time/)).toBeTruthy();
      // Sin permisos explícitos del rol: el aviso de que se muestran todas.
      expect(within(d).getByText(/has no explicit permissions/)).toBeTruthy();
      expect(enEspanol(d)).toEqual([]);
    });
    await revisarDialogo(editar(1), (d) => {
      expect(within(d).getByText(/On day 5 of every month/)).toBeTruthy();
    });
    await revisarDialogo(editar(2), (d) => {
      expect(within(d).getByText(/On March 2 at 07:00/)).toBeTruthy();
    });
    await revisarDialogo(editar(3), async (d) => {
      expect(within(d).getByText(/On days 1 and 16 of every month/)).toBeTruthy();
      expect(await within(d).findByText("Assigned")).toBeTruthy();
    });
    await revisarDialogo(editar(4), (d) => {
      expect(within(d).getByText("Only on the selected days (5/7).")).toBeTruthy();
    });
    await revisarDialogo(() => fireEvent.click(screen.getByRole("button", { name: /New report/ })));
  });
});

describe("Admin › Cowork vs Hubstaff en inglés", () => {
  it("los totales y el detalle de una persona", async () => {
    montar(<CoworkVsHubstaff />);
    await screen.findByText("Jane Doe");
    expect(screen.getAllByText("Coverage").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByText("Alvaro Mejia").closest("button")!);
    expect(await screen.findByText(/Clock stopped/)).toBeTruthy();
    expect(screen.getByText("2 days on Hubstaff · 1 on Cowork")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("Admin en español sigue igual", () => {
  it("la pantalla de usuarios", async () => {
    localStorage.setItem("app-language", "es");
    montar(<AdminUsuarios />);
    await screen.findByText("Jane Doe");
    expect(screen.getByText("Gestión de Usuarios")).toBeTruthy();
    expect(screen.getByText("Sin nombre")).toBeTruthy();
  });
});

describe("el catálogo de permisos: se traduce lo que se ve, la llave no", () => {
  // Cada nombre que el modal dibuja: grupo, módulo, sección (sin el prefijo del
  // padre) y función.
  const nombres = [...new Set(MODULES_CONFIG.flatMap((m) => [
    m.group, m.module, ...m.subtabs.map((s) => nombreVisibleDeSeccion(s.name)), ...m.functions,
  ]))];
  const en = (k: TranslationKey) => getTranslation(k, "en");
  const es = (k: TranslationKey) => getTranslation(k, "es");

  it("todo nombre del catálogo tiene su etiqueta en inglés o se escribe igual", () => {
    const sinAnotar = nombres.filter((n) => !(n in ETIQUETAS) && !IGUAL_EN_INGLES.has(n));
    expect(
      sinAnotar,
      "Nombres de MODULES_CONFIG sin etiqueta: sumalos a ETIQUETAS (con su clave admin.perm.*) o a IGUAL_EN_INGLES en pages/admin/etiquetasPermisos.ts",
    ).toEqual([]);
    const enEspanolAun = nombres.map((n) => etiquetaPermiso(en, n)).filter((e) => esEspanol(e));
    expect(enEspanolAun).toEqual([]);
  });

  it("en español se ve exactamente la llave (salvo Creator Sales, que siempre se vio como Ingresos)", () => {
    const distintos = nombres.filter((n) => etiquetaPermiso(es, n) !== n);
    expect(distintos).toEqual(["Creator Sales"]);
    expect(etiquetaPermiso(es, "Creator Sales")).toBe("Ingresos");
  });

  it("ETIQUETAS no anota nombres que ya no existen", () => {
    expect(Object.keys(ETIQUETAS).filter((n) => !nombres.includes(n))).toEqual([]);
  });
});

describe("las métricas de los reportes", () => {
  it("cada métrica del catálogo tiene su etiqueta, con el español EXACTO del catálogo", () => {
    const dic = admin as unknown as Record<string, { es: string; en: string }>;
    for (const m of METRICS_CATALOG) {
      const par = dic[`admin.metric.${m.key}`];
      expect(par, `la métrica ${m.key} no tiene clave admin.metric.${m.key} en lib/i18n/admin.ts`).toBeTruthy();
      expect(par.es).toBe(m.label);
      expect(esEspanol(par.en), `admin.metric.${m.key}`).toBe(false);
    }
  });
});
