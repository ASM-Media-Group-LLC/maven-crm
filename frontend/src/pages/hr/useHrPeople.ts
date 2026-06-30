import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Roster de RRHH (v_hr_roster: 64 personas con rol) + ficha por persona (RPC get_hr_person_card).
// La ficha se apoya en profile_id (NO en employees, vacío). management-only.

export interface HrRosterRow {
  profile_id: string;
  name: string;
  role: string;
  in_hubstaff: boolean;
  hubstaff_user_id: string | null;
}

export const HR_ROLE_LABEL: Record<string, string> = {
  Chatter: "Chatter", closer: "Closer", manager: "Manager", LLG: "LLG",
  admin: "Admin", owner: "Owner", "Team Leader": "Team Leader",
  "Chatter Supervisor": "Supervisor", spammer: "Spammer", employee: "Empleado",
  coordinator_beta: "Coordinador",
};

export const useHrRoster = () =>
  useQuery({
    queryKey: ["hr-roster"],
    queryFn: async (): Promise<HrRosterRow[]> => {
      const { data, error } = await (supabase as any).from("v_hr_roster").select("*");
      if (error) throw error;
      return ((data ?? []) as HrRosterRow[]).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 60_000,
  });

// ── Ficha de una persona ──
export interface HrPersonCard {
  identity: { profile_id: string; name: string; role: string; hubstaff_user_id: string | null; in_hubstaff: boolean };
  attendance: {
    period: string; turno: string | null; shift_start: number; dias: number;
    checkin_prom_min: number; tardanzas: number; pct_a_tiempo: number;
    min_tarde_prom: number | null; horario_cargado: boolean;
  } | null;
  effort: { period: string; dias: number; total_hours: number; avg_activity_pct: number } | null;
  chatter: {
    period: string; days_tracked: number; total_hours: number; avg_activity_pct: number;
    sales: number; sales_per_hour: number | null; avg_response_min: number | null; unlock_rate: number | null;
    sold_messages: number; fans_chatted: number; online_improductivo: number | null;
    cost_usd: number; agency_revenue_usd: number; margin_usd: number; roi_x: number | null;
    no_rentable: boolean; sin_venta_blu: boolean;
  } | null;
  scorecard: {
    total_sales: number; fan_conversion_rate: number | null; unlock_rate: number | null;
    avg_response_seconds: number | null; scheduled_hours: number | null; clocked_hours: number | null;
    creators_count: number | null; sold_messages: number | null; fans_chatted: number | null;
    snapshot_from: string | null; snapshot_to: string | null;
  } | null;
  closer: {
    period: string; dias: number; total_hours: number; avg_activity_pct: number;
    leads: number; cerradas: number; monetizacion_usd: number | null; usd_por_hora: number | null;
    qa_calls: number; avg_qa_score: number | null; sin_cierres: boolean;
  } | null;
  llg: {
    period: string; dias: number; total_hours: number; avg_activity_pct: number;
    leads: number; leads_por_hora: number | null;
  } | null;
}

export const useHrPersonCard = (profileId: string | null) =>
  useQuery({
    queryKey: ["hr-person-card", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<HrPersonCard | null> => {
      const { data, error } = await (supabase as any).rpc("get_hr_person_card", { p_profile_id: profileId });
      if (error) throw error;
      return (data ?? null) as HrPersonCard | null;
    },
    staleTime: 60_000,
  });
