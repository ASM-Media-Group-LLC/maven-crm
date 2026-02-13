import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface TaskProject {
  id: string;
  name: string;
  description: string | null;
  company_id: string | null;
  created_by: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export const useProjects = () => {
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

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["task-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_projects" as any)
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TaskProject[];
    },
    enabled: !!user,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["all-tasks-for-projects", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks" as any)
        .select("id, status, due_at, project_id")
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as { id: string; status: string; due_at: string; project_id: string | null }[];
    },
    enabled: !!user,
  });

  const createProject = useMutation({
    mutationFn: async (project: { name: string; description?: string }) => {
      if (!user || !profile) throw new Error("Not authenticated");
      const { error } = await supabase.from("task_projects" as any).insert({
        name: project.name,
        description: project.description || null,
        created_by: user.id,
        company_id: profile.company_id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-projects"] });
      toast({ title: "Proyecto creado", description: "El proyecto fue creado exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear el proyecto.", variant: "destructive" });
    },
  });

  const getProjectTaskCounts = (projectId: string) => {
    const now = Date.now();
    let active = 0, overdue = 0, completed = 0;
    allTasks.forEach((t) => {
      if (t.project_id !== projectId) return;
      if (t.status === "completed") completed++;
      else if (new Date(t.due_at).getTime() <= now) overdue++;
      else active++;
    });
    return { active, overdue, completed };
  };

  return {
    projects,
    isLoading,
    profile,
    createProject,
    getProjectTaskCounts,
  };
};
