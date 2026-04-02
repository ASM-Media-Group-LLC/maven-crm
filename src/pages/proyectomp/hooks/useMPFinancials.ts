import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPFinancials = () =>
  useQuery({
    queryKey: ["mp-financials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_financials").select("*, mp_models(name)").order("month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const useCreateMPFinancial = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await supabase.from("mp_financials").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-financials"] }),
  });
};
