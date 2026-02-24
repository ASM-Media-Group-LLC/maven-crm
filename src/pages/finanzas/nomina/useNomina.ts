import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useNomina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: periods = [], isLoading: loadingPeriods } = useQuery({
    queryKey: ["payroll-periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["employees-for-payroll"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employee_code, base_salary, department_id, status")
        .eq("status", "activo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: details = [], isLoading: loadingDetails } = useQuery({
    queryKey: ["payroll-details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_details")
        .select("*, employees(first_name, last_name, employee_code)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createPeriod = useMutation({
    mutationFn: async (payload: {
      period_name: string;
      start_date: string;
      end_date: string;
      total_employees: number;
      gross_total: number;
      net_total: number;
      status: string;
      cost_center?: string;
      notes?: string;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("payroll_periods").insert({
        ...payload,
        created_by: user.user?.id,
        responsible_id: user.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Periodo de nómina creado" });
    },
    onError: () => toast({ title: "Error al crear periodo", variant: "destructive" }),
  });

  const batchClose = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("payroll_periods")
        .update({ status: "cerrado", notes: reason, responsible_id: user.user?.id })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Batch cerrado exitosamente" });
    },
    onError: () => toast({ title: "Error al cerrar batch", variant: "destructive" }),
  });

  const deletePeriod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Periodo eliminado" });
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  return {
    periods,
    employees,
    details,
    loadingPeriods,
    loadingEmployees,
    loadingDetails,
    createPeriod,
    batchClose,
    deletePeriod,
  };
}
