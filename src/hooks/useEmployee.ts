import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ["employee", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select(`
          *,
          departments(id, name, code),
          positions(id, name, code)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeAbsences(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-absences", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeIncidents(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-incidents", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_incidents")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeDocuments(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-documents", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_documents")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeTraining(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-training", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_training_assignments")
        .select(`*, training_programs(*)`)
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeePerformance(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-performance", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_evaluations")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("evaluation_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from("employees").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Empleado actualizado correctamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar el empleado", variant: "destructive" });
    },
  });
}
