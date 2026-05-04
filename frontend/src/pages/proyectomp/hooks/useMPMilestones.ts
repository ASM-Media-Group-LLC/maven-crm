import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPMilestones = () =>
  useQuery({
    queryKey: ["mp-milestones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_milestones").select("*, mp_phases(name, phase_number)").order("position");
      if (error) throw error;
      return data;
    },
  });

export const useUpdateMPMilestone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("mp_milestones").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-milestones"] }),
  });
};
