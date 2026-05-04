import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPCandidates = () => {
  return useQuery({
    queryKey: ["mp-candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mp_candidates")
        .select("*")
        .order("position");
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateMPCandidate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("mp_candidates").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-candidates"] }),
  });
};

export const useCreateMPCandidate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidate: any) => {
      const { error } = await supabase.from("mp_candidates").insert(candidate);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-candidates"] }),
  });
};
