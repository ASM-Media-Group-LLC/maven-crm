import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSidebarBadges() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["sidebar-badges", user?.id],
    queryFn: async () => {
      const [promolog, leadgen, closers] = await Promise.all([
        supabase.from("promolog_entries").select("id", { count: "exact", head: true }).is("reviewed_by", null),
        supabase.from("leadgen_entries").select("id", { count: "exact", head: true }).eq("quality", "pending"),
        supabase.from("closer_creators").select("id", { count: "exact", head: true }).eq("stage", "Nuevo"),
      ]);

      return {
        promologCount: promolog.count ?? 0,
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
