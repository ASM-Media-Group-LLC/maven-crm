import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export const useProjectMembers = (projectId?: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("project_members" as any)
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data || []) as unknown as ProjectMember[];
    },
    enabled: !!user && !!projectId,
  });

  const addMembers = useMutation({
    mutationFn: async ({ projectId, userIds }: { projectId: string; userIds: string[] }) => {
      if (userIds.length === 0) return;
      const rows = userIds.map(uid => ({
        project_id: projectId,
        user_id: uid,
        role: "member",
      }));
      const { error } = await supabase
        .from("project_members" as any)
        .upsert(rows as any, { onConflict: "project_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudieron agregar miembros.", variant: "destructive" });
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from("project_members" as any)
        .delete()
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo remover el miembro.", variant: "destructive" });
    },
  });

  const setProjectMembers = useMutation({
    mutationFn: async ({ projectId, userIds }: { projectId: string; userIds: string[] }) => {
      // Delete existing members
      await supabase
        .from("project_members" as any)
        .delete()
        .eq("project_id", projectId);
      
      // Insert new ones
      if (userIds.length > 0) {
        const rows = userIds.map(uid => ({
          project_id: projectId,
          user_id: uid,
          role: "member",
        }));
        const { error } = await supabase
          .from("project_members" as any)
          .insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudieron actualizar los miembros.", variant: "destructive" });
    },
  });

  return { members, isLoading, addMembers, removeMember, setProjectMembers };
};
