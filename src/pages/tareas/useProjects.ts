import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useProjectMembers } from "./useProjectMembers";

export interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  company_id: string | null;
  created_by: string;
  status: string;
  share_token: string | null;
  leader_id: string | null;
  folder_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProjectFolder {
  id: string;
  name: string;
  company_id: string | null;
  created_by: string;
  position: number;
  created_at: string;
}

export const useProjects = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();

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

  const { data: rawProjects = [], isLoading } = useQuery({
    queryKey: ["task-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_projects" as any)
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TaskProject[];
    },
    enabled: !!user,
  });

  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["project-folders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ProjectFolder[];
    },
    enabled: !!user,
  });

  const { data: myMemberProjectIds = [] } = useQuery({
    queryKey: ["my-project-memberships", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("project_members" as any)
        .select("project_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data || []).map((r: any) => r.project_id as string);
    },
    enabled: !!user,
  });

  const projects = useMemo(() => {
    if (isAdmin) return rawProjects;
    if (!user) return [];
    const memberSet = new Set(myMemberProjectIds);
    return rawProjects.filter(
      (p) => p.created_by === user.id || p.leader_id === user.id || memberSet.has(p.id)
    );
  }, [rawProjects, myMemberProjectIds, isAdmin, user]);

  const visibleProjectIds = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);

  const { data: rawAllTasks = [], isLoading: isLoadingTasks, isError: isTasksError, error: tasksError } = useQuery({
    queryKey: ["all-tasks-for-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks" as any)
        .select("id, title, description, status, due_at, start_at, completed_at, project_id, priority, created_at, overdue_reason, assigned_to, created_by, company_id, duration_hours, duration_minutes, share_token, updated_at")
        .order("due_at", { ascending: true });
      if (error) {
        console.error("[useProjects] Failed to fetch tasks:", error);
        throw error;
      }
      return (data || []) as unknown as import("./useTareas").Task[];
    },
    enabled: !!user,
  });

  const allTasks = useMemo(() => {
    if (isAdmin) return rawAllTasks;
    return rawAllTasks.filter((t) => t.project_id && visibleProjectIds.has(t.project_id));
  }, [rawAllTasks, visibleProjectIds, isAdmin]);

  const updateGlobalTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const payload: any = { status };
      if (status === "completed") payload.completed_at = new Date().toISOString();
      else payload.completed_at = null;
      const { error } = await supabase.from("tasks" as any).update(payload).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks-for-projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-tasks"] });
    },
  });

  const createProject = useMutation({
    mutationFn: async (project: { name: string; description?: string; memberIds?: string[]; leaderId?: string; folderId?: string }) => {
      if (!user || !profile) throw new Error("Not authenticated");
      const trimmedName = project.name.trim();
      const { data: existing } = await supabase
        .from("task_projects" as any)
        .select("id")
        .ilike("name", trimmedName)
        .limit(1);
      if (existing && existing.length > 0) throw new Error("DUPLICATE");
      const { data, error } = await supabase.from("task_projects" as any).insert({
        name: project.name,
        description: project.description || null,
        created_by: user.id,
        company_id: profile.company_id,
        leader_id: project.leaderId || null,
        folder_id: project.folderId || null,
      } as any).select("id").single();
      if (error) throw error;
      
      if (project.memberIds && project.memberIds.length > 0 && data) {
        const projectId = (data as any).id;
        const rows = project.memberIds.map(uid => ({
          project_id: projectId,
          user_id: uid,
          role: "member",
        }));
        await supabase.from("project_members" as any).insert(rows as any);

        const notifications = project.memberIds.map(uid => ({
          user_id: uid,
          type: "project_assignment",
          title: "Te asignaron a un proyecto",
          message: `Fuiste agregado(a) al proyecto '${project.name}'`,
          reference_id: projectId,
          reference_type: "project",
          module_origin: "tareas",
          priority: "medium",
          deep_link_url: `/tareas/${projectId}`,
          required_permission_module: "Tareas",
        }));
        await supabase.from("notifications").insert(notifications);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
      queryClient.invalidateQueries({ queryKey: ["my-project-memberships"] });
      toast({ title: "Proyecto creado", description: "El proyecto fue creado exitosamente." });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message === "DUPLICATE" ? "Ya existe un proyecto con ese nombre." : "No se pudo crear el proyecto.",
        variant: "destructive",
      });
    },
  });

  const updateProject = useMutation({
    mutationFn: async (project: { id: string; name: string; description?: string; memberIds?: string[]; leaderId?: string; folderId?: string | null }) => {
      const trimmedName = project.name.trim();
      const { data: existing } = await supabase
        .from("task_projects" as any)
        .select("id")
        .ilike("name", trimmedName)
        .neq("id", project.id)
        .limit(1);
      if (existing && existing.length > 0) throw new Error("DUPLICATE");
      const updatePayload: any = { name: project.name, description: project.description || null, leader_id: project.leaderId || null };
      if (project.folderId !== undefined) {
        updatePayload.folder_id = project.folderId || null;
      }
      const { data: updated, error } = await supabase
        .from("task_projects" as any)
        .update(updatePayload)
        .eq("id", project.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) throw new Error("No tienes permisos para editar este proyecto.");

      if (project.memberIds !== undefined) {
        const { data: existingMembers } = await supabase
          .from("project_members" as any)
          .select("user_id")
          .eq("project_id", project.id);
        const existingIds = new Set((existingMembers || []).map((m: any) => m.user_id));

        await supabase.from("project_members" as any).delete().eq("project_id", project.id);
        if (project.memberIds.length > 0) {
          const rows = project.memberIds.map(uid => ({
            project_id: project.id,
            user_id: uid,
            role: "member",
          }));
          await supabase.from("project_members" as any).insert(rows as any);

          const newMemberIds = project.memberIds.filter(uid => !existingIds.has(uid));
          if (newMemberIds.length > 0) {
            const notifications = newMemberIds.map(uid => ({
              user_id: uid,
              type: "project_assignment",
              title: "Te asignaron a un proyecto",
              message: `Fuiste agregado(a) al proyecto '${project.name}'`,
              reference_id: project.id,
              reference_type: "project",
              module_origin: "tareas",
              priority: "medium",
              deep_link_url: `/tareas/${project.id}`,
              required_permission_module: "Tareas",
            }));
            await supabase.from("notifications").insert(notifications);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
      queryClient.invalidateQueries({ queryKey: ["my-project-memberships"] });
      toast({ title: "Proyecto actualizado", description: "El proyecto fue actualizado exitosamente." });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err?.message === "DUPLICATE" ? "Ya existe un proyecto con ese nombre." : "No se pudo actualizar el proyecto.",
        variant: "destructive",
      });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (projectId: string) => {
      const { data: tasks } = await supabase
        .from("tasks" as any)
        .select("id")
        .eq("project_id", projectId);
      const taskIds = (tasks || []).map((t: any) => t.id);

      if (taskIds.length > 0) {
        const { error: subtaskErr } = await supabase
          .from("subtasks" as any)
          .delete()
          .in("task_id", taskIds);
        if (subtaskErr) throw subtaskErr;
      }

      const { error: taskErr } = await supabase
        .from("tasks" as any)
        .delete()
        .eq("project_id", projectId);
      if (taskErr) throw taskErr;

      const { error: memberErr } = await supabase
        .from("project_members" as any)
        .delete()
        .eq("project_id", projectId);
      if (memberErr) throw memberErr;

      const { error } = await supabase
        .from("task_projects" as any)
        .delete()
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      queryClient.invalidateQueries({ queryKey: ["my-project-memberships"] });
      toast({ title: "Proyecto eliminado", description: "El proyecto fue eliminado exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el proyecto.", variant: "destructive" });
    },
  });

  const getProjectTaskCounts = (projectId: string) => {
    const now = Date.now();
    let pending = 0, in_progress = 0, paused = 0, overdue = 0, completed = 0;
    allTasks.forEach((t) => {
      if (t.project_id !== projectId) return;
      if (t.status === "completed") {
        completed++;
      } else if (new Date(t.due_at).getTime() <= now) {
        overdue++;
      } else if (t.status === "in_progress") {
        in_progress++;
      } else if (t.status === "paused") {
        paused++;
      } else {
        pending++;
      }
    });
    return { pending, in_progress, paused, overdue, completed };
  };

  const getProjectProgress = (projectId: string) => {
    const counts = getProjectTaskCounts(projectId);
    const total = counts.pending + counts.in_progress + counts.paused + counts.overdue + counts.completed;
    return total > 0 ? Math.round((counts.completed / total) * 100) : 0;
  };

  const archiveProject = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("task_projects" as any)
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      toast({
        title: vars.status === "archived" ? "Proyecto archivado" : "Proyecto reactivado",
        description: vars.status === "archived" ? "El proyecto fue archivado." : "El proyecto fue reactivado.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el estado.", variant: "destructive" });
    },
  });

  const reorderProjects = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from("task_projects" as any).update({ position: index } as any).eq("id", id)
      );
      const results = await Promise.all(updates);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
    },
  });

  // Folder mutations
  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("project_folders" as any).insert({
        name,
        created_by: user.id,
        company_id: profile?.company_id || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-folders"] });
      toast({ title: "Carpeta creada", description: "La carpeta fue creada exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear la carpeta.", variant: "destructive" });
    },
  });

  const renameFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("project_folders" as any).update({ name } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-folders"] });
      toast({ title: "Carpeta renombrada" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo renombrar la carpeta.", variant: "destructive" });
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_folders" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-folders"] });
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      toast({ title: "Carpeta eliminada", description: "Los proyectos fueron movidos a 'Sin carpeta'." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la carpeta.", variant: "destructive" });
    },
  });

  const moveProjectToFolder = useMutation({
    mutationFn: async ({ projectId, folderId }: { projectId: string; folderId: string | null }) => {
      const { error } = await supabase
        .from("task_projects" as any)
        .update({ folder_id: folderId } as any)
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      toast({ title: "Proyecto movido" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo mover el proyecto.", variant: "destructive" });
    },
  });

  return {
    projects,
    allTasks,
    isLoading,
    isLoadingTasks,
    isTasksError,
    tasksError,
    profile,
    folders,
    foldersLoading,
    createProject,
    updateProject,
    deleteProject,
    archiveProject,
    getProjectTaskCounts,
    getProjectProgress,
    reorderProjects,
    createFolder,
    renameFolder,
    deleteFolder,
    moveProjectToFolder,
    updateGlobalTaskStatus,
  };
};
