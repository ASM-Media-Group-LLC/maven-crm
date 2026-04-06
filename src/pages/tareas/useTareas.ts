import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
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
  assignees: string[];
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

  const { data: rawTasks = [], isLoading } = useQuery({
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
      return (data || []) as unknown as Omit<Task, "assignees">[];
    },
    enabled: !!user,
  });

  const { data: allTaskAssignees = [] } = useQuery({
    queryKey: ["task-assignees", projectId || "all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_assignees" as any)
        .select("task_id, user_id");
      return (data || []) as unknown as { task_id: string; user_id: string }[];
    },
    enabled: !!user,
  });

  const tasks: Task[] = useMemo(() => {
    const map = new Map<string, string[]>();
    allTaskAssignees.forEach((a) => {
      const list = map.get(a.task_id) || [];
      list.push(a.user_id);
      map.set(a.task_id, list);
    });
    return rawTasks.map((t) => ({
      ...t,
      assignees: map.get(t.id) || (t.assigned_to ? [t.assigned_to] : []),
    }));
  }, [rawTasks, allTaskAssignees]);

  const { data: projectData } = useQuery({
    queryKey: ["task-project-detail", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const { data } = await supabase
        .from("task_projects" as any)
        .select("name, description, leader_id")
        .eq("id", projectId)
        .single();
      return data as unknown as { name: string; description: string | null; leader_id: string | null } | null;
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["task-assignees"] });
    queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
    queryClient.invalidateQueries({ queryKey: ["task-project-detail"] });
    queryClient.invalidateQueries({ queryKey: ["task-projects"] });
  };

  const updateProjectInline = useMutation({
    mutationFn: async (fields: { name?: string; description?: string | null; leader_id?: string | null }) => {
      if (!projectId) throw new Error("No project ID");
      if (fields.name) {
        const trimmedName = fields.name.trim();
        const { data: existing } = await supabase
          .from("task_projects" as any)
          .select("id")
          .ilike("name", trimmedName)
          .neq("id", projectId)
          .limit(1);
        if (existing && existing.length > 0) throw new Error("DUPLICATE");
      }
      const { error } = await supabase
        .from("task_projects" as any)
        .update(fields as any)
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Proyecto actualizado", description: "Los cambios fueron guardados." });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message === "DUPLICATE" ? "Ya existe un proyecto con ese nombre." : "No se pudo actualizar el proyecto.",
        variant: "destructive",
      });
    },
  });

  const createTask = useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      assignee_ids: string[];
      due_at: string;
      duration_hours: number;
      duration_minutes: number;
      project_id?: string;
      priority?: string;
      start_at?: string;
      status?: string;
    }) => {
      if (!user || !profile) throw new Error("Not authenticated");
      const primaryAssignee = task.assignee_ids[0] || user.id;

      const { data: newTask, error } = await supabase
        .from("tasks" as any)
        .insert({
          title: task.title,
          description: task.description || null,
          assigned_to: primaryAssignee,
          created_by: user.id,
          company_id: profile.company_id,
          project_id: task.project_id || null,
          duration_hours: task.duration_hours,
          duration_minutes: task.duration_minutes,
          due_at: task.due_at,
          priority: task.priority || "medium",
          start_at: task.start_at || null,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      const taskId = (newTask as any).id;

      // Insert all assignees into junction table
      if (task.assignee_ids.length > 0) {
        const rows = task.assignee_ids.map((uid) => ({
          task_id: taskId,
          user_id: uid,
        }));
        await supabase.from("task_assignees" as any).insert(rows as any);
      }

      // Notifications for assigned users
      for (const uid of task.assignee_ids) {
        if (uid !== user.id) {
          await supabase.from("notifications").insert({
            user_id: uid,
            type: "task_assignment",
            title: "Te asignaron una tarea",
            message: `Fuiste asignado(a) a la tarea '${task.title}'`,
            reference_id: taskId,
            reference_type: "task",
            module_origin: "tareas",
            priority: "medium",
            deep_link_url: `/tareas?taskId=${taskId}`,
            required_permission_module: "Tareas",
          });
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
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
      invalidateAll();
      toast({ title: "Tarea completada", description: "La tarea fue marcada como completada." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo completar la tarea.", variant: "destructive" });
    },
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const updates: Record<string, any> = { status };
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
      invalidateAll();
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
      invalidateAll();
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
      assignee_ids: string[];
      due_at: string;
      duration_hours: number;
      duration_minutes: number;
      priority?: string;
      start_at?: string;
      status?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const primaryAssignee = task.assignee_ids[0] || user.id;

      const updates: Record<string, any> = {
        title: task.title,
        description: task.description || null,
        assigned_to: primaryAssignee,
        due_at: task.due_at,
        duration_hours: task.duration_hours,
        duration_minutes: task.duration_minutes,
        priority: task.priority || "medium",
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

      // Sync assignees: delete old, insert new
      await supabase.from("task_assignees" as any).delete().eq("task_id", task.id);
      if (task.assignee_ids.length > 0) {
        const rows = task.assignee_ids.map((uid) => ({
          task_id: task.id,
          user_id: uid,
        }));
        await supabase.from("task_assignees" as any).insert(rows as any);
      }

      // Get previous assignees to determine who's new
      const existingTask = tasks.find((t) => t.id === task.id);
      const prevAssignees = existingTask?.assignees || [];
      const newAssignees = task.assignee_ids.filter((uid) => !prevAssignees.includes(uid));
      for (const uid of newAssignees) {
        if (uid !== user.id) {
          await supabase.from("notifications").insert({
            user_id: uid,
            type: "task_assignment",
            title: "Te asignaron una tarea",
            message: `Fuiste asignado(a) a la tarea '${task.title}'`,
            reference_id: task.id,
            reference_type: "task",
            module_origin: "tareas",
            priority: "medium",
            deep_link_url: `/tareas?taskId=${task.id}`,
            required_permission_module: "Tareas",
          });
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
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
      invalidateAll();
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
      invalidateAll();
    },
  });

  const patchTask = useMutation({
    mutationFn: async ({ taskId, fields }: { taskId: string; fields: Record<string, any> }) => {
      const { error } = await supabase
        .from("tasks" as any)
        .update(fields as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar la tarea.", variant: "destructive" });
    },
  });

  const updateTaskAssignees = useMutation({
    mutationFn: async ({ taskId, assigneeIds }: { taskId: string; assigneeIds: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const primaryAssignee = assigneeIds[0] || user.id;

      // Update primary assignee
      await supabase.from("tasks" as any).update({ assigned_to: primaryAssignee } as any).eq("id", taskId);

      // Sync junction table
      await supabase.from("task_assignees" as any).delete().eq("task_id", taskId);
      if (assigneeIds.length > 0) {
        const rows = assigneeIds.map((uid) => ({ task_id: taskId, user_id: uid }));
        await supabase.from("task_assignees" as any).insert(rows as any);
      }

      // Notify new assignees
      const existingTask = tasks.find((t) => t.id === taskId);
      const prevAssignees = existingTask?.assignees || [];
      const newAssignees = assigneeIds.filter((uid) => !prevAssignees.includes(uid));
      for (const uid of newAssignees) {
        if (uid !== user.id) {
          await supabase.from("notifications").insert({
            user_id: uid,
            type: "task_assignment",
            title: "Te asignaron una tarea",
            message: `Fuiste asignado(a) a la tarea '${existingTask?.title || ""}'`,
            reference_id: taskId,
            reference_type: "task",
            module_origin: "tareas",
            priority: "medium",
            deep_link_url: `/tareas?taskId=${taskId}`,
            required_permission_module: "Tareas",
          });
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar los asignados.", variant: "destructive" });
    },
  });

  return {
    tasks,
    isLoading,
    profile,
    projectName: projectData?.name || null,
    projectDescription: projectData?.description || null,
    projectLeaderId: projectData?.leader_id || null,
    companyProfiles,
    createTask,
    completeTask,
    updateTaskStatus,
    submitOverdueReason,
    updateTask,
    deleteTask,
    reorderTasks,
    patchTask,
    updateTaskAssignees,
    updateProjectInline,
  };
};
