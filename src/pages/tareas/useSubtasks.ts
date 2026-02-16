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
  parent_subtask_id: string | null;
  assigned_to: string | null;
  priority: string;
  due_at: string | null;
}

export const useSubtasks = (taskId: string, parentSubtaskId?: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ["subtasks", taskId, parentSubtaskId ?? "root"];

  const { data: subtasks = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from("subtasks" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("position", { ascending: true });

      if (parentSubtaskId) {
        query = query.eq("parent_subtask_id", parentSubtaskId);
      } else {
        query = query.is("parent_subtask_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Subtask[];
    },
    enabled: !!user && !!taskId,
  });

  const createSubtask = useMutation({
    mutationFn: async (params: {
      title: string;
      priority?: string;
      due_at?: string | null;
      assigned_to?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const maxPosition = subtasks.length > 0 ? Math.max(...subtasks.map(s => s.position)) + 1 : 0;
      const { error } = await supabase.from("subtasks" as any).insert({
        task_id: taskId,
        title: params.title,
        created_by: user.id,
        position: maxPosition,
        parent_subtask_id: parentSubtaskId || null,
        priority: params.priority || "medium",
        due_at: params.due_at || null,
        assigned_to: params.assigned_to || null,
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

  const updateSubtaskFields = useMutation({
    mutationFn: async (params: { id: string; priority?: string; due_at?: string | null; assigned_to?: string | null }) => {
      const updates: any = {};
      if (params.priority !== undefined) updates.priority = params.priority;
      if (params.due_at !== undefined) updates.due_at = params.due_at;
      if (params.assigned_to !== undefined) updates.assigned_to = params.assigned_to;
      const { error } = await supabase
        .from("subtasks" as any)
        .update(updates)
        .eq("id", params.id);
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
    updateSubtaskFields,
    deleteSubtask,
    reorderSubtasks,
  };
};
