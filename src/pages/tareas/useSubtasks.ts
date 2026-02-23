import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
  start_at: string | null;
  assignees: string[];
}

export const useSubtasks = (taskId: string, parentSubtaskId?: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ["subtasks", taskId, parentSubtaskId ?? "root"];

  const { data: rawSubtasks = [], isLoading } = useQuery({
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
      return (data || []) as unknown as Omit<Subtask, "assignees">[];
    },
    enabled: !!user && !!taskId,
  });

  const { data: allSubtaskAssignees = [] } = useQuery({
    queryKey: ["subtask-assignees", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subtask_assignees" as any)
        .select("subtask_id, user_id");
      return (data || []) as unknown as { subtask_id: string; user_id: string }[];
    },
    enabled: !!user && !!taskId,
  });

  const subtasks: Subtask[] = useMemo(() => {
    const map = new Map<string, string[]>();
    allSubtaskAssignees.forEach((a) => {
      const list = map.get(a.subtask_id) || [];
      list.push(a.user_id);
      map.set(a.subtask_id, list);
    });
    return rawSubtasks.map((s) => ({
      ...s,
      assignees: map.get(s.id) || (s.assigned_to ? [s.assigned_to] : []),
    }));
  }, [rawSubtasks, allSubtaskAssignees]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    queryClient.invalidateQueries({ queryKey: ["subtask-assignees", taskId] });
  };

  const createSubtask = useMutation({
    mutationFn: async (params: {
      title: string;
      priority?: string;
      due_at?: string | null;
      assignee_ids?: string[];
      start_at?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const maxPosition = subtasks.length > 0 ? Math.max(...subtasks.map((s) => s.position)) + 1 : 0;
      const primaryAssignee = params.assignee_ids?.[0] || null;

      const { data: newSubtask, error } = await supabase
        .from("subtasks" as any)
        .insert({
          task_id: taskId,
          title: params.title,
          created_by: user.id,
          position: maxPosition,
          parent_subtask_id: parentSubtaskId || null,
          priority: params.priority || "medium",
          due_at: params.due_at || null,
          assigned_to: primaryAssignee,
          start_at: params.start_at || null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      const subtaskId = (newSubtask as any).id;
      if (params.assignee_ids && params.assignee_ids.length > 0) {
        const rows = params.assignee_ids.map((uid) => ({
          subtask_id: subtaskId,
          user_id: uid,
        }));
        await supabase.from("subtask_assignees" as any).insert(rows as any);
      }
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la subtarea.", variant: "destructive" });
    },
  });

  const updateSubtaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "in_progress" && !subtasks.find((s) => s.id === id)?.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from("subtasks" as any)
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la subtarea.", variant: "destructive" });
    },
  });

  const updateSubtaskFields = useMutation({
    mutationFn: async (params: {
      id: string;
      title?: string;
      priority?: string;
      due_at?: string | null;
      assignee_ids?: string[];
      start_at?: string | null;
      status?: string;
    }) => {
      const updates: any = {};
      if (params.title !== undefined) updates.title = params.title;
      if (params.priority !== undefined) updates.priority = params.priority;
      if (params.due_at !== undefined) updates.due_at = params.due_at;
      if (params.start_at !== undefined) updates.start_at = params.start_at;
      if (params.status !== undefined) updates.status = params.status;

      // Update primary assignee
      if (params.assignee_ids !== undefined) {
        updates.assigned_to = params.assignee_ids[0] || null;
      }

      const { error } = await supabase
        .from("subtasks" as any)
        .update(updates)
        .eq("id", params.id);
      if (error) throw error;

      // Sync assignees
      if (params.assignee_ids !== undefined) {
        await supabase.from("subtask_assignees" as any).delete().eq("subtask_id", params.id);
        if (params.assignee_ids.length > 0) {
          const rows = params.assignee_ids.map((uid) => ({
            subtask_id: params.id,
            user_id: uid,
          }));
          await supabase.from("subtask_assignees" as any).insert(rows as any);
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
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
      invalidateAll();
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
      invalidateAll();
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
