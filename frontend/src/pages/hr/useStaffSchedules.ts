import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Horario del personal por persona × día (whatsapp_user_schedules). Lo consume el editor de RRHH
// y la puntualidad (v_qa_attendance). weekday = isodow (1=Lun..7=Dom). Tablas/vistas nuevas → (as any).

export interface QaStaff {
  profile_id: string;
  name: string;
  role: string;
  in_hubstaff?: boolean;   // si está trackeado en Hubstaff → su puntualidad se puede medir
  hasSchedule: boolean;
}

export interface DayRow {
  weekday: number;          // 1=Lun..7=Dom
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
}

// Lista de personas (Hubstaff + rol QA) + flag de si ya tienen horario cargado.
export const useQaStaff = () =>
  useQuery({
    queryKey: ["qa-staff"],
    queryFn: async (): Promise<QaStaff[]> => {
      const { data: staff, error } = await (supabase as any).from("v_qa_staff").select("*");
      if (error) throw error;
      const { data: sched } = await (supabase as any).from("whatsapp_user_schedules").select("user_id");
      const withSched = new Set((sched ?? []).map((r: any) => r.user_id as string));
      return ((staff ?? []) as Omit<QaStaff, "hasSchedule">[])
        .map((s) => ({ ...s, hasSchedule: withSched.has(s.profile_id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 30_000,
  });

// Horario actual de una persona (filas por weekday).
export const useUserSchedule = (profileId: string | null) =>
  useQuery({
    queryKey: ["user-schedule", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<DayRow[]> => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_user_schedules")
        .select("weekday, start_time, end_time")
        .eq("user_id", profileId);
      if (error) throw error;
      return (data ?? []) as DayRow[];
    },
  });

// Maven role → role_kind que usa el bot/coverage.
export const roleKindOf = (role: string): string =>
  ({ Chatter: "chatter", closer: "closer", manager: "manager", LLG: "llg" } as Record<string, string>)[role] ?? "other";

// Guarda el horario semanal: upsert de los días que trabaja + borra los días libres.
export async function saveUserSchedule(
  profileId: string,
  roleKind: string,
  week: { weekday: number; works: boolean; start: string; end: string }[],
) {
  const working = week.filter((d) => d.works && d.start && d.end);
  const offDays = week.filter((d) => !d.works).map((d) => d.weekday);

  if (working.length) {
    const rows = working.map((d) => ({
      user_id: profileId,
      weekday: d.weekday,
      start_time: d.start.length === 5 ? d.start + ":00" : d.start,
      end_time: d.end.length === 5 ? d.end + ":00" : d.end,
      role_kind: roleKind,
    }));
    const { error } = await (supabase as any)
      .from("whatsapp_user_schedules")
      .upsert(rows, { onConflict: "user_id,weekday" });
    if (error) throw error;
  }
  if (offDays.length) {
    const { error } = await (supabase as any)
      .from("whatsapp_user_schedules")
      .delete()
      .eq("user_id", profileId)
      .in("weekday", offDays);
    if (error) throw error;
  }
}
