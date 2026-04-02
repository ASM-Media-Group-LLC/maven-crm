import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPTasks = () => {
  return useQuery({
    queryKey: ["mp-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mp_tasks")
        .select("*, mp_phases(name, phase_number)")
        .order("position");
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateMPTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("mp_tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-tasks"] }),
  });
};

export const useCreateMPTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: any) => {
      const { error } = await supabase.from("mp_tasks").insert(task);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-tasks"] }),
  });
};
