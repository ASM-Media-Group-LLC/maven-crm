import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useUpdateLeadCategoria = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, categoria }: { id: string; categoria: string }) => {
      const { error } = await supabase.from("leads").update({ categoria }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
};
