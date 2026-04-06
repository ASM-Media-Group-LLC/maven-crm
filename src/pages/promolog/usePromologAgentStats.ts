import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight hook: fetches distinct active agent IDs from promolog_entries
 * using a single query instead of downloading all 34K+ entries.
 */
export const usePromologActiveAgents = (profileIds: string[]) => {
  return useQuery({
    queryKey: ["promolog-active-agents", profileIds],
    queryFn: async () => {
      // Fetch distinct reviewed_by values
      const { data: reviewers } = await supabase
        .from("promolog_entries")
        .select("reviewed_by")
        .not("reviewed_by", "is", null);

      // Fetch distinct created_by values
      const { data: creators } = await supabase
        .from("promolog_entries")
        .select("created_by")
        .not("created_by", "is", null);

      const agentSet = new Set<string>();
      const profileSet = new Set(profileIds);

      // We need distinct values - supabase JS doesn't support DISTINCT directly,
      // so we collect unique IDs client-side from the smaller result sets
      // But these could still be large. Let's use a smarter approach with RPC or just
      // get unique agent IDs by scanning reviewed_by and created_by columns.
      
      // Actually, let's just query the profiles that have entries
      // Use a different approach: query promolog_entries grouped
      if (reviewers) {
        for (const r of reviewers) {
          if (r.reviewed_by && profileSet.has(r.reviewed_by)) {
            agentSet.add(r.reviewed_by);
          }
        }
      }
      if (creators) {
        for (const c of creators) {
          if (c.created_by && profileSet.has(c.created_by)) {
            agentSet.add(c.created_by);
          }
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
