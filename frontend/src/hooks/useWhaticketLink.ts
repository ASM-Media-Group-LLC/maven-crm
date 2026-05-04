import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhaticketLink(creatorId: string | undefined) {
  return useQuery({
    queryKey: ["whaticket_link", creatorId],
    queryFn: async () => {
      if (!creatorId) return null;
      const { data, error } = await supabase
        .from("whaticket_links")
        .select("whaticket_url")
        .eq("creator_id", creatorId)
        .maybeSingle();
      if (error) throw error;
      return data?.whaticket_url ?? null;
    },
    enabled: !!creatorId,
  });
}
