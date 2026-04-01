import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSidebarBadges() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["sidebar-badges", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const [promoResult, leadgen, closers] = await Promise.all([
        supabase.from("promolog_entries").select("id, creator_id, date, network, platform, promoted").is("reviewed_by", null).gte("date", new Date().toISOString().split("T")[0]),
        supabase.from("leadgen_entries").select("id", { count: "exact", head: true }).eq("quality", "pending").gte("created_at", today),
        supabase.from("closer_creators").select("id", { count: "exact", head: true }).eq("stage", "Nuevo").gte("created_at", today),
      ]);

      const promoDeduped = new Set(
        (promoResult.data ?? []).map(e => {
          const dayKey = e.date?.split("T")[0] ?? e.date;
          return `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
        })
      );

      return {
        promologCount: promoDeduped.size,
        leadgenCount: leadgen.count ?? 0,
        closersCount: closers.count ?? 0,
      };
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return {
    promologCount: data?.promologCount || 0,
    leadgenCount: data?.leadgenCount || 0,
    closersCount: data?.closersCount || 0,
  };
}
