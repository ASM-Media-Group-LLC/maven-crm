import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
};

// Paginated fetch for large tables (79K+ rows)
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

export const useLeadGenEntries = () =>
  useQuery({
    queryKey: ["leadgen-entries"],
    queryFn: fetchAllEntries,
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
    },
  });
};

// Legacy alias
export const useUpdateLeadCategoria = useUpdateLeadQuality;
