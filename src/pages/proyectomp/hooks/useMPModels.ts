import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPModels = () => {
  return useQuery({
    queryKey: ["mp-models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mp_models")
        .select("*, mp_candidates(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateMPModel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (model: any) => {
      const { error } = await supabase.from("mp_models").insert(model);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-models"] }),
  });
};
