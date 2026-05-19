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

/** Lista de LLGs (lead generators) — profiles que tienen al menos una
 *  entry en leadgen_entries. Se usa en el picker admin "ver como LLG". */
export const useLeadGenLLGs = () =>
  useQuery({
    queryKey: ["leadgen-llgs-list"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("leadgen_entries")
        .select("lg_user_id")
        .not("lg_user_id", "is", null);
      if (error) throw error;
      const ids = Array.from(
        new Set(((rows ?? []) as Array<{ lg_user_id: string | null }>).map((r) => r.lg_user_id).filter(Boolean) as string[]),
      );
      if (ids.length === 0) return [] as Array<{ id: string; full_name: string | null }>;
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (pErr) throw pErr;
      return ((profs ?? []) as Array<{ id: string; full_name: string | null }>).sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? ""),
      );
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

/** Fetch lightweight agent stats across ALL leads in a date range.
 *  Antes traíamos toda la tabla y agregábamos en JS — ahora Postgres
 *  hace el GROUP BY via RPC `leadgen_agent_stats`. ~10-100x más rápido. */
export const useLeadGenAgentStats = (dateFrom?: string, dateTo?: string) =>
  useQuery({
    queryKey: ["leadgen-agent-stats", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leadgen_agent_stats", {
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
      });
      if (error) throw error;
      // Shape: { [user_id]: { total, byQuality, firstLead, phones, nuevos, recuperacion } }
      // phones agregado 2026-05-19 (migration 20260519180000) — cuenta
      // teléfonos registrados por el agente en el rango (closers_contacts
      // con created_by=agente, phone NOT NULL, created_at en rango).
      // nuevos/recuperacion agregados 2026-05-19 (migration 20260519190000):
      // mismo split que el reporte programado (record_type='reactivado' →
      // recuperacion; el resto → nuevos).
      //
      // Backward-compat: si el RPC viejo todavía está deployado (sin las
      // columnas nuevas), defaulteamos a 0 al consumir en el componente.
      return (data ?? {}) as Record<
        string,
        {
          total: number;
          byQuality: Record<string, number>;
          firstLead: string;
          phones?: number;
          nuevos?: number;
          recuperacion?: number;
        }
      >;
    },
    staleTime: 2 * 60 * 1000,
  });

/** Fetch summary stats across ALL leads in a date range. RPC-based
 *  (mismo motivo que useLeadGenAgentStats). */
export const useLeadGenSummaryStats = (dateFrom?: string, dateTo?: string, userId?: string) =>
  useQuery({
    queryKey: ["leadgen-summary-stats", dateFrom, dateTo, userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("leadgen_summary_stats", {
        p_date_from: dateFrom ?? null,
        p_date_to: dateTo ?? null,
        p_user_id: userId ?? null,
      });
      if (error) throw error;
      // Shape preservada: { total, qa, byQuality: { "a+", "a", "b+", "b", "c" } }
      return (data ?? { total: 0, qa: 0, byQuality: { "a+": 0, a: 0, "b+": 0, b: 0, c: 0 } }) as {
        total: number;
        qa: number;
        byQuality: Record<string, number>;
      };
    },
    // Bumped 2min → 10min. El RPC scanea 102k filas (~800ms) y los
    // conteos no cambian de un segundo a otro — staleTime más largo
    // reduce el round-trip al cambiar de filtros.
    staleTime: 10 * 60 * 1000,
    // keepPreviousData: mientras refetcha (cambio de fecha/agente), los
    // números viejos se quedan en los cards en vez de irse a 0.
    placeholderData: keepPreviousData,
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
