import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const useSubtasks = (taskId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subtasks = [], isLoading } = useQuery({
    queryKey: ["subtasks", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtasks" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Subtask[];
    },
    enabled: !!user && !!taskId,
  });

  const createSubtask = useMutation({
    mutationFn: async (title: string) => {
      if (!user) throw new Error("Not authenticated");
      const maxPosition = subtasks.length > 0 ? Math.max(...subtasks.map(s => s.position)) + 1 : 0;
      const { error } = await supabase.from("subtasks" as any).insert({
        task_id: taskId,
        title,
        created_by: user.id,
        position: maxPosition,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la subtarea.", variant: "destructive" });
    },
  });

  const updateSubtaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "in_progress") updates.started_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from("subtasks" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la subtarea.", variant: "destructive" });
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subtasks" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la subtarea.", variant: "destructive" });
    },
  });

  const reorderSubtasks = useMutation({
    mutationFn: async (reorderedIds: string[]) => {
      const updates = reorderedIds.map((id, index) =>
        supabase.from("subtasks" as any).update({ position: index } as any).eq("id", id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    },
  });

  return {
    subtasks,
    isLoading,
    createSubtask,
    updateSubtaskStatus,
    deleteSubtask,
    reorderSubtasks,
  };
};
