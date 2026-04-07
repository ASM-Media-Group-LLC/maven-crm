import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HubstaffAgent {
  id: string;
  name: string;
  role: string;
  department: string;
  departmentCode: string;
  status: "activo" | "inactivo" | "desconectado" | "en_pausa";
  mouseActivity: number;
  keyboardActivity: number;
  hoursToday: number;
  lastActivity: string;
  alerts: number;
  avatarInitials: string;
  memberId: string;
  profileId: string;
}

export interface HubstaffConfig {
  id: string;
  api_token_set: boolean;
  org_id: string | null;
  sync_enabled: boolean;
  last_sync_at: string | null;
  sync_interval_minutes: number;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function getRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Ahora";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return `Hace ${diffH}h ${diffMin % 60}min`;
}

function computeStatus(lastActivityAt: Date | null): HubstaffAgent["status"] {
  if (!lastActivityAt) return "desconectado";
  const diffMin = (Date.now() - lastActivityAt.getTime()) / 60000;
  if (diffMin < 10) return "activo";
  if (diffMin < 30) return "inactivo";
  return "desconectado";
}

export function useHubstaffData() {
  // Fetch config
  const configQuery = useQuery({
    queryKey: ["hubstaff-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hubstaff_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as HubstaffConfig | null;
    },
  });

  // Fetch members with profiles and today's activities
  const agentsQuery = useQuery({
    queryKey: ["hubstaff-agents"],
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("hubstaff_members")
        .select("id, profile_id, hubstaff_user_id, is_active")
        .eq("is_active", true);
      if (error) throw error;
      if (!members || members.length === 0) return [];

      // Get profile info
      const profileIds = members.map(m => m.profile_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", profileIds);

      // Get today's activities
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: activities } = await supabase
        .from("hubstaff_activities")
        .select("member_id, starts_at, tracked_seconds, mouse_activity, keyboard_activity, overall_activity")
        .in("member_id", members.map(m => m.id))
        .gte("starts_at", todayStart.toISOString())
        .order("starts_at", { ascending: false });

      const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
      const actByMember = new Map<string, typeof activities>();
      (activities ?? []).forEach(a => {
        const arr = actByMember.get(a.member_id) ?? [];
        arr.push(a);
        actByMember.set(a.member_id, arr);
      });

      const agents: HubstaffAgent[] = members.map(m => {
        const profile = profileMap.get(m.profile_id);
        const name = profile?.full_name ?? "Sin nombre";
        const memberActs = actByMember.get(m.id) ?? [];

        const totalSeconds = memberActs.reduce((s, a) => s + (a.tracked_seconds ?? 0), 0);
        const avgMouse = memberActs.length > 0
          ? Math.round(memberActs.reduce((s, a) => s + (a.mouse_activity ?? 0), 0) / memberActs.length)
          : 0;
        const avgKeyboard = memberActs.length > 0
          ? Math.round(memberActs.reduce((s, a) => s + (a.keyboard_activity ?? 0), 0) / memberActs.length)
          : 0;

        const lastAct = memberActs.length > 0 ? new Date(memberActs[0].starts_at) : null;

        return {
          id: m.id,
          memberId: m.id,
          profileId: m.profile_id,
          name,
          role: "",
          department: "",
          departmentCode: "",
          status: computeStatus(lastAct),
          mouseActivity: avgMouse,
          keyboardActivity: avgKeyboard,
          hoursToday: parseFloat((totalSeconds / 3600).toFixed(1)),
          lastActivity: lastAct ? getRelativeTime(lastAct) : "Sin actividad",
          alerts: 0,
          avatarInitials: getInitials(name),
        };
      });

      return agents;
    },
  });

  return {
    agents: agentsQuery.data ?? [],
    isLoading: agentsQuery.isLoading,
    config: configQuery.data ?? null,
    configLoading: configQuery.isLoading,
    refetch: agentsQuery.refetch,
    isEmpty: !agentsQuery.isLoading && (agentsQuery.data ?? []).length === 0,
  };
}
