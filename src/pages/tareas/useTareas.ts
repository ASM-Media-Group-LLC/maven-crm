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
  status: string;
  duration_hours: number;
  duration_minutes: number;
  due_at: string;
  completed_at: string | null;
  overdue_reason: string | null;
  share_token: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const useTareas = () => {
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
    queryKey: ["tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks" as any)
        .select("*")
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Task[];
    },
    enabled: !!user,
  });

  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles", profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("company_id", profile.company_id);
      return data || [];
    },
    enabled: !!profile?.company_id,
  });

  const createTask = useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      assigned_to: string;
      duration_hours: number;
      duration_minutes: number;
    }) => {
      if (!user || !profile) throw new Error("Not authenticated");
      const dueAt = new Date(
        Date.now() + task.duration_hours * 3600000 + task.duration_minutes * 60000
      ).toISOString();

      const { error } = await supabase.from("tasks" as any).insert({
        title: task.title,
        description: task.description || null,
        assigned_to: task.assigned_to,
        created_by: user.id,
        company_id: profile.company_id,
        duration_hours: task.duration_hours,
        duration_minutes: task.duration_minutes,
        due_at: dueAt,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
      toast({ title: "Tarea completada", description: "La tarea fue marcada como completada." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo completar la tarea.", variant: "destructive" });
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

  return {
    tasks,
    isLoading,
    profile,
    companyProfiles,
    createTask,
    completeTask,
    submitOverdueReason,
  };
};
