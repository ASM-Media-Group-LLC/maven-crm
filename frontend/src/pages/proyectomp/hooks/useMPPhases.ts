import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPPhases = () => {
  return useQuery({
    queryKey: ["mp-phases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mp_phases")
        .select("*")
        .order("phase_number");
      if (error) throw error;
      return data;
    },
  });
};
