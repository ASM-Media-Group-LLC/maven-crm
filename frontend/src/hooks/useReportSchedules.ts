import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// CRUD de reportes programados. Las dos tablas viven en:
//   · report_schedules — un registro por reporte (nombre, módulo, period)
//   · report_recipients — N-M, lista de emails (cada email puede tener
//     un user_id si es un user de Maven, o ser email externo)
//
// El cron `dispatch-reports` corre diario 8am Miami y manda los
// schedules cuya period matchea HOY. Ver supabase/functions/dispatch-reports.

export type ReportModule = "llg" | "closers" | "chatters" | "combined";
export type ReportPeriod = "daily" | "weekly" | "quincenal" | "monthly" | "annual";

// Mapeo rol → módulo de reporte. El UI muestra "rol" pero internamente
// las queries se agrupan por uno de los 3 módulos disponibles. Roles
// "estratégicos" (admin/manager/supervisor) caen al LLG por default;
// Fase 2 va a permitir cherry-pick de métricas según permisos del rol.
// Sentinel role: cuando el admin elige "Combinado (LLG + Closers)" en
// el modal, guardamos este string en role_name para que se distinga
// de un rol real. El backend ignora role_name si el módulo es 'combined'
// (cada sub-fetch usa hardcoded "LLG" / "closer" para los role filters).
export const COMBINED_ROLE_SENTINEL = "__combined__";

export const ROLE_TO_MODULE: Record<string, ReportModule> = {
  closer: "closers",
  // Closer Supervisor es un superset de closer: mismas métricas + permisos
  // de supervisión. El equipo migró cerradores legacy a este rol custom.
  "Closer Supervisor": "closers",
  "Chatter Supervisor": "chatters",
  // Chatter individual (rol custom, sin supervisión)
  Chatter: "chatters",
  // LLG custom rol — equivalente a employee/spammer pero más descriptivo.
  LLG: "llg",
  employee: "llg",
  spammer: "llg",
  agent: "llg",
  admin: "llg",
  manager: "llg",
  supervisor: "llg",
  coordinator_beta: "llg",
  [COMBINED_ROLE_SENTINEL]: "combined",
};

// Heurística para roles custom creados desde UI (`Administración → Roles`)
// que NO están listados en ROLE_TO_MODULE. Inferimos el módulo de
// reporte por substring del nombre. Ejemplos:
//   "Closer Supervisor Senior" → closers
//   "Chatter Lead"             → chatters
//   "Lead Gen Lead"            → llg
//   "Sales Reviewer"           → llg (fallback)
// Sin esta heurística, todo rol nuevo termina en "llg" silenciosamente
// y el admin no sabe por qué no le aparecen las métricas correctas.
function inferModuleFromRoleName(roleName: string): ReportModule {
  const n = roleName.toLowerCase();
  // Closers: "closer", "closing", "cerrador"
  if (/\b(closer|closing|cerrador)\b/.test(n)) return "closers";
  // Chatters: "chatter", "chat", "chateador"
  if (/\b(chatter|chateador)\b/.test(n) || /\bchat\b/.test(n)) return "chatters";
  // LLG / LeadGen
  if (/\b(llg|leadgen|lead\s*gen|generador)\b/.test(n)) return "llg";
  // Fallback: LLG (mismo comportamiento que antes)
  return "llg";
}

export const roleToModule = (roleName: string): ReportModule => {
  // 1) Mapping explícito (built-in roles + roles custom conocidos)
  const explicit = ROLE_TO_MODULE[roleName];
  if (explicit) return explicit;
  // 2) Heurística por substring para roles custom no listados
  return inferModuleFromRoleName(roleName);
};

export interface ReportSchedule {
  id: string;
  tenant_id: string;
  name: string;
  module: ReportModule;
  role_name: string | null;
  period: ReportPeriod;
  dispatch_hour: number;
  // Día(s) en que dispara según period:
  //   weekly    → dispatch_weekdays (1=Mon ... 7=Sun)
  //   quincenal → dispatch_days_of_month (1-2 valores, 1-28)
  //   monthly   → dispatch_days_of_month (1 valor)
  //   annual    → dispatch_days_of_month (1 valor) + dispatch_month_of_year (1-12)
  //   daily     → ignora todo
  dispatch_weekdays: number[] | null;
  dispatch_days_of_month: number[] | null;
  dispatch_month_of_year: number | null;
  email_subject: string | null;
  metrics: string[] | null; // null = set default del módulo
  // Cuando module='combined', lista de roles que se renderizan en
  // secciones separadas en el email. Cada rol mapea a su módulo via
  // ROLE_TO_MODULE.
  combined_roles: string[] | null;
  is_active: boolean;
  last_dispatched_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRecipient {
  id: string;
  schedule_id: string;
  email: string;
  user_id: string | null;
}

export interface ReportScheduleWithRecipients extends ReportSchedule {
  recipients: ReportRecipient[];
}

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech — único tenant hoy

// Lista de roles activos del tenant — para el dropdown del modal.
export interface RoleOption {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

// Permisos del rol — los (module, submodule) accesibles. Usados para
// filtrar el catálogo de métricas en el modal de reportes.
export function useRolePermissions(roleName: string | null | undefined) {
  return useQuery<Array<{ module: string; submodule: string | null }>>({
    queryKey: ["role-permissions-for-reports", roleName],
    enabled: !!roleName,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // role_name → roles_config.id → role_permissions
      const { data: role, error: roleErr } = await (supabase as any)
        .from("roles_config")
        .select("id")
        .eq("name", roleName!)
        .maybeSingle();
      if (roleErr) throw roleErr;
      if (!role?.id) return [];
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("module, submodule")
        .eq("role_id", role.id)
        .eq("can_access", true);
      if (error) throw error;
      return ((data ?? []) as Array<{ module: string; submodule: string | null }>);
    },
  });
}

export function useTenantRoles() {
  return useQuery<RoleOption[]>({
    queryKey: ["tenant-roles-for-reports"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("roles_config")
        .select("id, name, description, is_system, is_active")
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as RoleOption[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useReportSchedules() {
  return useQuery<ReportScheduleWithRecipients[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => {
      const { data: schedules, error } = await (supabase as any)
        .from("report_schedules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!schedules || schedules.length === 0) return [];

      const ids = schedules.map((s: any) => s.id);
      const { data: recipients, error: rErr } = await (supabase as any)
        .from("report_recipients")
        .select("*")
        .in("schedule_id", ids);
      if (rErr) throw rErr;

      const byId: Record<string, ReportRecipient[]> = {};
      for (const r of (recipients ?? []) as ReportRecipient[]) {
        (byId[r.schedule_id] ??= []).push(r);
      }
      return schedules.map((s: any) => ({ ...s, recipients: byId[s.id] ?? [] }));
    },
    staleTime: 30_000,
  });
}

export interface CreateScheduleInput {
  name: string;
  role_name: string | null;
  module: ReportModule;
  period: ReportPeriod;
  dispatch_hour: number;
  dispatch_weekdays: number[] | null;
  dispatch_days_of_month: number[] | null;
  dispatch_month_of_year: number | null;
  email_subject: string | null;
  metrics: string[] | null;
  // Sólo cuando module='combined'. Lista de roles que renderean
  // secciones en el email.
  combined_roles: string[] | null;
  recipients: Array<{ email: string; user_id?: string | null }>;
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateScheduleInput) => {
      const { data: schedule, error } = await (supabase as any)
        .from("report_schedules")
        .insert({
          tenant_id: TENANT_ID,
          name: input.name,
          module: input.module,
          role_name: input.role_name,
          period: input.period,
          dispatch_hour: input.dispatch_hour,
          dispatch_weekdays: input.dispatch_weekdays,
          dispatch_days_of_month: input.dispatch_days_of_month,
          dispatch_month_of_year: input.dispatch_month_of_year,
          email_subject: input.email_subject,
          metrics: input.metrics,
          combined_roles: input.combined_roles,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      if (input.recipients.length > 0) {
        const { error: rErr } = await (supabase as any)
          .from("report_recipients")
          .insert(
            input.recipients.map((r) => ({
              schedule_id: schedule.id,
              email: r.email.trim().toLowerCase(),
              user_id: r.user_id ?? null,
            })),
          );
        if (rErr) throw rErr;
      }
      return schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Partial<ReportSchedule>; recipients?: Array<{ email: string; user_id?: string | null }> }) => {
      const { error } = await (supabase as any)
        .from("report_schedules")
        .update(input.patch)
        .eq("id", input.id);
      if (error) throw error;
      if (input.recipients) {
        // Replace recipients atomically (best-effort): delete then re-insert.
        await (supabase as any).from("report_recipients").delete().eq("schedule_id", input.id);
        if (input.recipients.length > 0) {
          const { error: rErr } = await (supabase as any)
            .from("report_recipients")
            .insert(
              input.recipients.map((r) => ({
                schedule_id: input.id,
                email: r.email.trim().toLowerCase(),
                user_id: r.user_id ?? null,
              })),
            );
          if (rErr) throw rErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}

// Preview del email — invoca send-report con preview_only=true.
// Devuelve { html, subject, from, to, row_count } sin mandar email
// ni tocar last_dispatched_at. Usado por el toggle "Vista previa".
export interface ReportPreview {
  html: string;
  subject: string;
  from: string;
  to: string;
  row_count: number;
}

export function useReportPreview(schedule_id: string | null, enabled: boolean) {
  return useQuery<ReportPreview>({
    queryKey: ["report-preview", schedule_id],
    enabled: !!schedule_id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-report", {
        body: { schedule_id, preview_only: true },
      });
      if (error) throw error;
      return data as ReportPreview;
    },
  });
}

// Envío manual: invoca send-report con el JWT del admin. El backend
// computa el rango del period del schedule (mismo cálculo que usa el
// cron) y manda el email al instante. No modifica el próximo cron.
export function useSendReportNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (schedule_id: string) => {
      const { data, error } = await supabase.functions.invoke("send-report", {
        body: { schedule_id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // ON DELETE CASCADE en report_recipients limpia los hijos.
      const { error } = await (supabase as any)
        .from("report_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-schedules"] });
    },
  });
}
