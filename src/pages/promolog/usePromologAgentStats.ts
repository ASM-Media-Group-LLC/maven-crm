import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PromologAgentStat {
  id: string;
  total: number;
  si: number;
  parcial: number;
  no: number;
  networks: Record<string, number>;
}

/**
 * Fetches all promolog agent IDs with their stats by batching queries.
 * Only returns agents whose IDs exist in the profiles table.
 */
export const usePromologAgentStats = (profileIds: string[]) => {
  return useQuery({
    queryKey: ["promolog-agent-stats-full"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let offset = 0;
      let allEntries: Array<{ reviewed_by: string | null; created_by: string | null; promoted: string | null; network: string | null; creator_id: string | null; date: string | null }> = [];
      let hasMore = true;

      while (hasMore) {
        const { data } = await supabase
          .from("promolog_entries")
          .select("reviewed_by, created_by, promoted, network, creator_id, date")
          .range(offset, offset + PAGE_SIZE - 1);

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allEntries = allEntries.concat(data);
          if (data.length < PAGE_SIZE) hasMore = false;
          offset += PAGE_SIZE;
        }
      }

      // Deduplicate: group by creator_id + day + network + promoted
      const dedupGroups = new Map<string, typeof allEntries[0]>();
      for (const entry of allEntries) {
        const day = entry.date ? entry.date.split("T")[0] : "";
        const key = `${entry.creator_id || ""}|${day}|${(entry.network || "").toLowerCase()}|${entry.promoted}`;
        if (!dedupGroups.has(key)) {
          dedupGroups.set(key, entry);
        } else {
          // Prefer entry with reviewed_by or created_by
          const existing = dedupGroups.get(key)!;
          const existingScore = (existing.reviewed_by ? 1 : 0) + (existing.created_by ? 1 : 0);
          const newScore = (entry.reviewed_by ? 1 : 0) + (entry.created_by ? 1 : 0);
          if (newScore > existingScore) dedupGroups.set(key, entry);
        }
      }

      const dedupedEntries = Array.from(dedupGroups.values());
      const profileSet = new Set(profileIds);
      const agentMap = new Map<string, PromologAgentStat>();

      for (const entry of dedupedEntries) {
        const agentId = entry.reviewed_by || entry.created_by;
        if (!agentId || !profileSet.has(agentId)) continue;

        let stat = agentMap.get(agentId);
        if (!stat) {
          stat = { id: agentId, total: 0, si: 0, parcial: 0, no: 0, networks: {} };
          agentMap.set(agentId, stat);
        }
        stat.total++;
        if (entry.promoted === "true") stat.si++;
        else if (entry.promoted === "partial") stat.parcial++;
        else if (entry.promoted === "false") stat.no++;

        const net = (entry.network || "otro").toLowerCase();
        const netLabel = net === "instagram" ? "IG" : net === "tiktok" ? "TK" : net === "x" ? "X" : net === "telegram" ? "TG" : "Otro";
        stat.networks[netLabel] = (stat.networks[netLabel] || 0) + 1;
      }

      return Array.from(agentMap.values());
    },
    enabled: profileIds.length > 0,
    staleTime: 2 * 60 * 1000,
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
