import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPContent = () => {
  return useQuery({
    queryKey: ["mp-content"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mp_content_entries")
        .select("*, mp_models(name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateMPContent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: any) => {
      const { error } = await supabase.from("mp_content_entries").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-content"] }),
  });
};
