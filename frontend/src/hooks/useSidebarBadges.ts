import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export function useSidebarBadges() {
  const { user } = useAuth();
  const { canAccess, dataScope, isLoading: permsLoading } = usePermissions();

  const { data } = useQuery({
    queryKey: ["sidebar-badges", user?.id, permsLoading],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const userId = user!.id;

      // --- Promolog ---
      let promologCount = 0;
      if (canAccess("Promolog")) {
        const scope = dataScope("Promolog");
        let promoQuery = supabase
          .from("promolog_entries")
          .select("id, creator_id, date, network, platform, promoted")
          .is("reviewed_by", null)
          .gte("date", today);

        if (scope === "self") {
          promoQuery = promoQuery.or(`reviewed_by.eq.${userId},created_by.eq.${userId}`);
        }

        const { data: promoData } = await promoQuery;
        const promoDeduped = new Set(
          (promoData ?? []).map(e => {
            const dayKey = e.date?.split("T")[0] ?? e.date;
            return `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
          })
        );
        promologCount = promoDeduped.size;
      }

      // --- LeadGen ---
      let leadgenCount = 0;
      if (canAccess("LeadGen")) {
        const scope = dataScope("LeadGen");
        let leadQuery = supabase
          .from("leadgen_entries")
          .select("id", { count: "exact", head: true })
          .eq("quality", "pending")
          .gte("created_at", today);

        if (scope === "self") {
          leadQuery = leadQuery.eq("lg_user_id", userId);
        }

        const { count } = await leadQuery;
        leadgenCount = count ?? 0;
      }

      // --- Closers ---
      let closersCount = 0;
      if (canAccess("CRM")) {
        const scope = dataScope("CRM");
        let closerQuery = supabase
          .from("closer_creators")
          .select("id", { count: "exact", head: true })
          .eq("stage", "Nuevo")
          .gte("created_at", today);

        if (scope === "self") {
          closerQuery = closerQuery.eq("assigned_to", userId);
        }

        const { count } = await closerQuery;
        closersCount = count ?? 0;
      }

      // --- WhatsApp (inbox): total de mensajes NO leídos en las conversaciones
      //     que el usuario ve (la RLS filtra a sus canales / las asignadas).
      let waInboxCount = 0;
      if (canAccess("WhatsApp", "Bandeja")) {
        const { data: waData } = await (supabase as unknown as { from: (t: string) => any })
          .from("wa_conversations")
          .select("unread_count")
          .gt("unread_count", 0);
        waInboxCount = (waData ?? []).reduce(
          (sum: number, c: { unread_count: number | null }) => sum + (c.unread_count || 0), 0);
      }

      // --- Telegram (bandeja): mismo criterio que WhatsApp (RLS filtra lo visible).
      let tgInboxCount = 0;
      if (canAccess("Telegram", "Bandeja")) {
        const { data: tgData } = await (supabase as unknown as { from: (t: string) => any })
          .from("tg_conversations")
          .select("unread_count")
          .gt("unread_count", 0);
        tgInboxCount = (tgData ?? []).reduce(
          (sum: number, c: { unread_count: number | null }) => sum + (c.unread_count || 0), 0);
      }

      return { promologCount, leadgenCount, closersCount, waInboxCount, tgInboxCount };
    },
    enabled: !!user && !permsLoading,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  return {
    promologCount: data?.promologCount || 0,
    leadgenCount: data?.leadgenCount || 0,
    closersCount: data?.closersCount || 0,
    waInboxCount: data?.waInboxCount || 0,
    tgInboxCount: data?.tgInboxCount || 0,
  };
}
