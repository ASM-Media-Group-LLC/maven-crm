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

export type ReportModule = "llg" | "closers" | "chatters";
export type ReportPeriod = "daily" | "weekly" | "monthly" | "annual";

// Mapeo rol → módulo de reporte. El UI muestra "rol" pero internamente
// las queries se agrupan por uno de los 3 módulos disponibles. Roles
// "estratégicos" (admin/manager/supervisor) caen al LLG por default;
// Fase 2 va a permitir cherry-pick de métricas según permisos del rol.
export const ROLE_TO_MODULE: Record<string, ReportModule> = {
  closer: "closers",
  "Chatter Supervisor": "chatters",
  employee: "llg",
  spammer: "llg",
  agent: "llg",
  admin: "llg",
  manager: "llg",
  supervisor: "llg",
};

export const roleToModule = (roleName: string): ReportModule =>
  ROLE_TO_MODULE[roleName] ?? "llg";

export interface ReportSchedule {
  id: string;
  tenant_id: string;
  name: string;
  module: ReportModule;
  role_name: string | null; // rol elegido en UI (closer, employee, etc)
  period: ReportPeriod;
  dispatch_hour: number; // 0-23, hora Miami
  email_subject: string | null; // null = subject auto-generado
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
  role_name: string;
  module: ReportModule; // derivado de role_name vía roleToModule
  period: ReportPeriod;
  dispatch_hour: number;
  email_subject: string | null;
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
          email_subject: input.email_subject,
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
