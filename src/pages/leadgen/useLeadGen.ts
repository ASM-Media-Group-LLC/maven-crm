import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  // Joined from profiles
  agent_name?: string | null;
  // Joined from leadgen_qa
  qa_score?: string | null;
  qa_rating?: string | null;
  qa_comment?: string | null;
  qa_supervisor_id?: string | null;
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

/** Paginated fetch for large tables (79K+ rows) — used by Database page */
async function fetchAllEntries(): Promise<LeadGenEntry[]> {
  const PAGE_SIZE = 1000;
  let allData: LeadGenEntry[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("leadgen_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data as unknown as LeadGenEntry[]);
      if (data.length < PAGE_SIZE) hasMore = false;
      else from += PAGE_SIZE;
    }
  }
  return allData;
}

/** Fetch entries for a specific date range — used by main page */
async function fetchEntriesByDateRange(
  dateFrom: string,
  dateTo: string,
  userId?: string
): Promise<LeadGenEntry[]> {
  const PAGE_SIZE = 1000;
  let allData: LeadGenEntry[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("leadgen_entries")
      .select("*")
      .gte("entry_date", dateFrom)
      .lte("entry_date", dateTo)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (userId) {
      query = query.eq("lg_user_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data as unknown as LeadGenEntry[]);
      if (data.length < PAGE_SIZE) hasMore = false;
      else from += PAGE_SIZE;
    }
  }
  return allData;
}

/** Fetch all entries (for database page) */
export const useLeadGenEntries = () =>
  useQuery({
    queryKey: ["leadgen-entries"],
    queryFn: fetchAllEntries,
    staleTime: 2 * 60 * 1000,
  });

/** Fetch entries by date range with optional user filter */
export const useLeadGenByDateRange = (
  dateFrom: string | undefined,
  dateTo: string | undefined,
  userId?: string
) =>
  useQuery({
    queryKey: ["leadgen-entries-range", dateFrom, dateTo, userId],
    queryFn: () => fetchEntriesByDateRange(dateFrom!, dateTo!, userId),
    enabled: !!dateFrom && !!dateTo,
    staleTime: 2 * 60 * 1000,
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
      // Fetch in batches if needed
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
    },
  });
};

export const useUpdateLeadStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
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
      // If quality change was requested, update the entry
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
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
    },
  });
};

// Legacy alias
export const useUpdateLeadCategoria = useUpdateLeadQuality;
