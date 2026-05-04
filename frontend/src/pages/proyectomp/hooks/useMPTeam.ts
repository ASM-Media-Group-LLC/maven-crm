import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useMPTeam = () =>
  useQuery({
    queryKey: ["mp-team"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mp_team_members").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

export const useCreateMPTeamMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: any) => {
      const { error } = await supabase.from("mp_team_members").insert(member);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-team"] }),
  });
};

export const useUpdateMPTeamMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("mp_team_members").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mp-team"] }),
  });
};
