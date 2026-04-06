import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight hook: fetches distinct active agent IDs via server-side RPC.
 * Returns only agents that exist in the provided profileIds list.
 */
export const usePromologActiveAgents = (profileIds: string[]) => {
  return useQuery({
    queryKey: ["promolog-active-agents", profileIds],
    queryFn: async () => {
      if (profileIds.length === 0) return [];

      const { data, error } = await supabase.rpc("get_distinct_promolog_agents");

      if (error) {
        console.error("Error fetching distinct agents:", error);
        return [];
      }

      if (!data) return [];

      // Filter to only agents that have a profile
      const profileSet = new Set(profileIds);
      return (data as Array<{ agent_id: string }>)
        .map(r => r.agent_id)
        .filter(id => profileSet.has(id));
    },
    enabled: profileIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Fetches all entries for a specific agent (batched, no limit).
 */
export const usePromologAgentEntries = (agentId: string | null) => {
  return useQuery({
    queryKey: ["promolog-agent-entries-full", agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let allEntries: Array<{ id: string; date: string; promoted: string | null; network: string | null; created_at: string }> = [];
      let hasMore = true;

      while (hasMore) {
        const { data } = await supabase
          .from("promolog_entries")
          .select("id, date, promoted, network, created_at")
          .or(`reviewed_by.eq.${agentId},created_by.eq.${agentId}`)
          .order("date", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allEntries = allEntries.concat(data);
          if (data.length < PAGE_SIZE) hasMore = false;
          offset += PAGE_SIZE;
        }
      }

      return allEntries;
    },
    enabled: !!agentId,
    staleTime: 2 * 60 * 1000,
  });
};
