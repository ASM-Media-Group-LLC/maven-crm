import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Only the columns we actually use
const ENTRY_COLUMNS = "id,lg_user_id,model_handle,platform,status,quality,notes,source_link,created_at,updated_at,phone_raw,phone_e164,country_code,created_creator_id,entry_date,ticket_number,state,city,company,onlyfans_url";

// Shared type matching leadgen_entries schema
export type LeadGenEntry = {
  id: string;
  lg_user_id: string;
  model_handle: string;
  platform: string;
  status: string;
  quality: string;
  notes: string | null;
  source_link: string | null;
  created_at: string;
  updated_at: string;
  phone_raw: string | null;
  phone_e164: string | null;
  country_code: string | null;
  created_creator_id: string | null;
  entry_date: string;
  ticket_number: string | null;
  state: string | null;
  city: string | null;
  company: string | null;
  onlyfans_url: string | null;
  // Joined from profiles
  agent_name?: string | null;
  // Joined from leadgen_qa
  qa_score?: string | null;
  qa_rating?: string | null;
  qa_comment?: string | null;
  qa_supervisor_id?: string | null;
  record_type?: string | null;
};

export type LeadGenQA = {
  id: string;
  entry_id: string;
  supervisor_id: string;
  score: string | null;
  rating: string | null;
  comment: string | null;
  created_at: string;
  supervisor_name?: string;
};

export type LeadGenNote = {
  id: string;
  entry_id: string;
  user_id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
};

type PaginatedResult = { data: LeadGenEntry[]; total: number };

const PAGE_SIZE = 100;

/** Server-side paginated fetch for Base de Datos page */
async function fetchEntriesPaginated(page: number): Promise<PaginatedResult> {
  const from = page * PAGE_SIZE;
  const { data, error, count } = await supabase
    .from("leadgen_entries")
    .select(ENTRY_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { data: (data || []) as unknown as LeadGenEntry[], total: count || 0 };
}

/** Server-side paginated fetch by date range — used by main page */
async function fetchEntriesByDateRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  userId: string | undefined,
  page: number
): Promise<PaginatedResult> {
  const from = page * PAGE_SIZE;
  let query = supabase
    .from("leadgen_entries")
    .select(ENTRY_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (dateFrom && dateTo) {
    query = query.gte("entry_date", dateFrom).lte("entry_date", dateTo);
  }

  if (userId) {
    query = query.eq("lg_user_id", userId);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data || []) as unknown as LeadGenEntry[], total: count || 0 };
}

/** Fetch all entries with server-side pagination (for database page) */
export const useLeadGenEntries = (page: number) =>
  useQuery({
    queryKey: ["leadgen-entries", page],
    queryFn: () => fetchEntriesPaginated(page),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

/** Fetch entries by date range with server-side pagination */
export const useLeadGenByDateRange = (
  dateFrom: string | undefined,
  dateTo: string | undefined,
  userId?: string,
  page: number = 0
) =>
  useQuery({
    queryKey: ["leadgen-entries-range", dateFrom, dateTo, userId, page],
    queryFn: () => fetchEntriesByDateRange(dateFrom, dateTo, userId, page),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

/** Fetch profiles for agent names */
export const useLeadGenProfiles = () =>
  useQuery({
    queryKey: ["leadgen-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; full_name: string | null }>;
    },
    staleTime: 5 * 60 * 1000,
  });

/** Fetch QA reviews for entries */
export const useLeadGenQA = (entryIds: string[]) =>
  useQuery({
    queryKey: ["leadgen-qa", entryIds.slice(0, 5)],
    queryFn: async () => {
      if (entryIds.length === 0) return [];
      const PAGE_SIZE = 500;
      let allData: any[] = [];
      for (let i = 0; i < entryIds.length; i += PAGE_SIZE) {
        const batch = entryIds.slice(i, i + PAGE_SIZE);
        const { data, error } = await supabase
          .from("leadgen_qa" as any)
          .select("*")
          .in("entry_id", batch)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (data) allData = allData.concat(data);
      }
      return allData as unknown as LeadGenQA[];
    },
    enabled: entryIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

// Helper to optimistically update cached entries
function optimisticEntryUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<LeadGenEntry>
) {
  // Update paginated range queries
  queryClient.setQueriesData<PaginatedResult>(
    { queryKey: ["leadgen-entries-range"] },
    (old) => old ? { ...old, data: old.data.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : old
  );
  // Update paginated database queries
  queryClient.setQueriesData<PaginatedResult>(
    { queryKey: ["leadgen-entries"] },
    (old) => old ? { ...old, data: old.data.map((e) => (e.id === id ? { ...e, ...patch } : e)) } : old
  );
}

export const useUpdateLeadQuality = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quality }: { id: string; quality: string }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ quality } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, quality }) => {
      optimisticEntryUpdate(queryClient, id, { quality });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
    },
  });
};

export const useCreateQAReview = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (review: { entry_id: string; supervisor_id: string; score: string; rating: string; comment?: string; quality?: string }) => {
      const { error } = await supabase
        .from("leadgen_qa" as any)
        .insert({
          entry_id: review.entry_id,
          supervisor_id: review.supervisor_id,
          score: review.score,
          rating: review.rating,
          comment: review.comment || null,
        });
      if (error) throw error;
      if (review.quality) {
        const { error: updateErr } = await supabase
          .from("leadgen_entries")
          .update({ quality: review.quality } as any)
          .eq("id", review.entry_id);
        if (updateErr) throw updateErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-qa"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
    },
  });
};

/** Generic field update for leadgen_entries */
export const useUpdateLeadField = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | null }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ [field]: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, field, value }) => {
      optimisticEntryUpdate(queryClient, id, { [field]: value } as any);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
    },
  });
};

/** Fetch lightweight agent stats across ALL leads in a date range (no pagination limit) */
export const useLeadGenAgentStats = (dateFrom?: string, dateTo?: string) =>
  useQuery({
    queryKey: ["leadgen-agent-stats", dateFrom, dateTo],
    queryFn: async () => {
      const baseQuery = () => {
        let q = supabase
          .from("leadgen_entries")
          .select("lg_user_id, quality, created_at");
        if (dateFrom && dateTo) {
          q = q.gte("entry_date", dateFrom).lte("entry_date", dateTo);
        }
        return q;
      };

      let all: Array<{ lg_user_id: string; quality: string; created_at: string }> = [];
      let page = 0;
      while (true) {
        const { data, error } = await baseQuery()
          .order("created_at", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        all = all.concat((data || []) as any);
        if (!data || data.length < 1000) break;
        page++;
      }

      const byAgent: Record<string, { total: number; byQuality: Record<string, number>; firstLead: string }> = {};
      all.forEach((r) => {
        if (!byAgent[r.lg_user_id]) {
          byAgent[r.lg_user_id] = { total: 0, byQuality: {}, firstLead: r.created_at };
        }
        byAgent[r.lg_user_id].total++;
        const q = r.quality?.toLowerCase() || "c";
        byAgent[r.lg_user_id].byQuality[q] = (byAgent[r.lg_user_id].byQuality[q] || 0) + 1;
        if (r.created_at < byAgent[r.lg_user_id].firstLead) {
          byAgent[r.lg_user_id].firstLead = r.created_at;
        }
      });
      return byAgent;
    },
    staleTime: 2 * 60 * 1000,
  });

/** Fetch summary stats across ALL leads in a date range (no pagination limit) */
export const useLeadGenSummaryStats = (dateFrom?: string, dateTo?: string, userId?: string) =>
  useQuery({
    queryKey: ["leadgen-summary-stats", dateFrom, dateTo, userId],
    queryFn: async () => {
      const baseQuery = () => {
        let q = supabase
          .from("leadgen_entries")
          .select("quality, phone_raw, phone_e164");
        if (dateFrom && dateTo) {
          q = q.gte("entry_date", dateFrom).lte("entry_date", dateTo);
        }
        if (userId) {
          q = q.eq("lg_user_id", userId);
        }
        return q;
      };

      let all: Array<{ quality: string; phone_raw: string | null; phone_e164: string | null }> = [];
      let page = 0;
      while (true) {
        const { data, error } = await baseQuery()
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        all = all.concat((data || []) as any);
        if (!data || data.length < 1000) break;
        page++;
      }

      const byQuality: Record<string, number> = { "a+": 0, a: 0, "b+": 0, b: 0, c: 0 };
      let qa = 0;
      all.forEach(r => {
        const q = r.quality?.toLowerCase() || "c";
        if (q in byQuality) byQuality[q]++;
        if (r.phone_raw || r.phone_e164) qa++;
      });

      return { total: all.length, qa, byQuality };
    },
    staleTime: 2 * 60 * 1000,
  });

/** Fetch ALL leads for a specific agent in a date range (for performance charts) */
export const useLeadGenAgentLeads = (agentId: string | null, dateFrom?: string, dateTo?: string) =>
  useQuery({
    queryKey: ["leadgen-agent-leads", agentId, dateFrom, dateTo],
    queryFn: async () => {
      if (!agentId) return [];
      const baseQuery = () => {
        let q = supabase
          .from("leadgen_entries")
          .select(ENTRY_COLUMNS);
        q = q.eq("lg_user_id", agentId);
        if (dateFrom && dateTo) {
          q = q.gte("entry_date", dateFrom).lte("entry_date", dateTo);
        }
        return q;
      };

      let all: any[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await baseQuery()
          .order("created_at", { ascending: false })
          .range(page * 1000, (page + 1) * 1000 - 1);
        if (error) throw error;
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        page++;
      }
      return all as LeadGenEntry[];
    },
    enabled: !!agentId,
    staleTime: 2 * 60 * 1000,
  });

// Legacy alias
export const useUpdateLeadCategoria = useUpdateLeadQuality;
