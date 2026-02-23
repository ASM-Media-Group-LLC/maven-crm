import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string;
  company_id: string | null;
  project_id: string | null;
  status: string;
  priority: string;
  duration_hours: number;
  duration_minutes: number;
  start_at: string | null;
  due_at: string;
  completed_at: string | null;
  overdue_reason: string | null;
  share_token: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const useTareas = (projectId?: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, company_id, full_name")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", user?.id, projectId],
    queryFn: async () => {
      let query = supabase
        .from("tasks" as any)
        .select("*")
        .order("position", { ascending: true })
        .order("due_at", { ascending: true });
      if (projectId) {
        query = query.eq("project_id", projectId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Task[];
    },
    enabled: !!user,
  });

  const { data: projectData } = useQuery({
    queryKey: ["task-project-detail", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data } = await supabase
        .from("task_projects" as any)
        .select("name")
        .eq("id", projectId)
        .single();
      return data as unknown as { name: string } | null;
    },
    enabled: !!projectId,
  });

  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles", profile?.company_id, profile?.id],
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, full_name");
      if (profile?.company_id) {
        query = query.eq("company_id", profile.company_id);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!profile,
  });

  const createTask = useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      assigned_to: string;
      due_at: string;
      duration_hours: number;
      duration_minutes: number;
      project_id?: string;
      priority?: string;
      start_at?: string;
    }) => {
      if (!user || !profile) throw new Error("Not authenticated");

      const { error } = await supabase.from("tasks" as any).insert({
        title: task.title,
        description: task.description || null,
        assigned_to: task.assigned_to,
        created_by: user.id,
        company_id: profile.company_id,
        project_id: task.project_id || null,
        duration_hours: task.duration_hours,
        duration_minutes: task.duration_minutes,
        due_at: task.due_at,
        priority: task.priority || 'medium',
        start_at: task.start_at || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      toast({ title: "Tarea creada", description: "La tarea fue creada exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la tarea.", variant: "destructive" });
    },
  });

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks" as any)
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      toast({ title: "Tarea completada", description: "La tarea fue marcada como completada." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo completar la tarea.", variant: "destructive" });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const updates: Record<string, any> = { status };
      if (status === "in_progress") {
        // Only set started timestamp if not already started
        const task = tasks.find(t => t.id === taskId);
        if (!task?.completed_at) {
          // We don't have started_at in tasks table, just update status
        }
      }
      if (status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from("tasks" as any)
        .update(updates as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      const labels: Record<string, string> = {
        in_progress: "Tarea iniciada",
        paused: "Tarea pausada",
        active: "Tarea pendiente",
        completed: "Tarea completada",
      };
      toast({ title: labels[status] || "Estado actualizado", description: "El estado fue actualizado." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el estado.", variant: "destructive" });
    },
  });

  const submitOverdueReason = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      const { error } = await supabase
        .from("tasks" as any)
        .update({ overdue_reason: reason, status: "overdue" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Justificación enviada", description: "La razón fue registrada." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo enviar la justificación.", variant: "destructive" });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (task: {
      id: string;
      title: string;
      description?: string;
      assigned_to: string;
      due_at: string;
      duration_hours: number;
      duration_minutes: number;
      priority?: string;
      start_at?: string;
      status?: string;
    }) => {
      const updates: Record<string, any> = {
        title: task.title,
        description: task.description || null,
        assigned_to: task.assigned_to,
        due_at: task.due_at,
        duration_hours: task.duration_hours,
        duration_minutes: task.duration_minutes,
        priority: task.priority || 'medium',
        start_at: task.start_at || null,
      };
      if (task.status) {
        updates.status = task.status;
        if (task.status === "completed") {
          updates.completed_at = new Date().toISOString();
        }
      }
      const { error } = await supabase
        .from("tasks" as any)
        .update(updates as any)
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      toast({ title: "Tarea actualizada", description: "La tarea fue actualizada exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la tarea.", variant: "destructive" });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks" as any)
        .delete()
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      toast({ title: "Tarea eliminada", description: "La tarea fue eliminada exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la tarea.", variant: "destructive" });
    },
  });

  const reorderTasks = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from("tasks" as any).update({ position: index } as any).eq("id", id)
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
    },
  });

  return {
    tasks,
    isLoading,
    profile,
    projectName: projectData?.name || null,
    companyProfiles,
    createTask,
    completeTask,
    updateTaskStatus,
    submitOverdueReason,
    updateTask,
    deleteTask,
    reorderTasks,
  };
};
