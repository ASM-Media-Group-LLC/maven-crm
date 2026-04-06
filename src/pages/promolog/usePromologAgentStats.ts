import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight hook: fetches distinct active agent IDs from promolog_entries.
 * Uses two small queries filtered by the known profile IDs to avoid downloading all rows.
 */
export const usePromologActiveAgents = (profileIds: string[]) => {
  return useQuery({
    queryKey: ["promolog-active-agents", profileIds],
    queryFn: async () => {
      if (profileIds.length === 0) return [];

      const agentSet = new Set<string>();

      // Query reviewed_by filtered to known profiles only
      const { data: reviewers } = await supabase
        .from("promolog_entries")
        .select("reviewed_by")
        .in("reviewed_by", profileIds)
        .limit(1000);

      if (reviewers) {
        for (const r of reviewers) {
          if (r.reviewed_by) agentSet.add(r.reviewed_by);
        }
      }

      // Query created_by filtered to known profiles only
      const { data: creators } = await supabase
        .from("promolog_entries")
        .select("created_by")
        .in("created_by", profileIds)
        .limit(1000);

      if (creators) {
        for (const c of creators) {
          if (c.created_by) agentSet.add(c.created_by);
        }
      }

      return Array.from(agentSet);
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
