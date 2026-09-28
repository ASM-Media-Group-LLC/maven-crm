import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { traducir } from "@/lib/i18n";

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
      toast({ title: traducir("hrg.emp.updated") });
    },
    onError: () => {
      toast({ title: traducir("hrg.emp.updateError"), variant: "destructive" });
    },
  });
}

/* ── Employee History ── */

export function useEmployeeHistory(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-history", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_history")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEmployeeHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (entry: {
      employee_id: string;
      change_type: string;
      field_changed: string;
      old_value?: string | null;
      new_value?: string | null;
      effective_date?: string;
      reason?: string | null;
      notes?: string | null;
      created_by?: string | null;
    }) => {
      const { error } = await supabase.from("employee_history").insert(entry);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["employee-history", vars.employee_id] });
      toast({ title: traducir("hrg.emp.historySaved") });
    },
    onError: () => {
      toast({ title: traducir("hrg.emp.historyError"), variant: "destructive" });
    },
  });
}

/* ── Cross-module summary hooks (read-only) ── */

export function useEmployeeAttendanceSummary(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-attendance-summary", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data, error } = await supabase
        .from("attendance")
        .select("status")
        .eq("employee_id", employeeId!)
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0]);
      if (error) throw error;
      const present = data.filter((a) => a.status === "presente").length;
      const late = data.filter((a) => a.status === "tardanza").length;
      const absent = data.filter((a) => a.status === "ausente").length;
      return { present, late, absent, total: data.length };
    },
  });
}

export function useEmployeeHourBankBalance(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-hourbank-balance", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hour_bank")
        .select("hours, movement_type")
        .eq("employee_id", employeeId!);
      if (error) throw error;
      const balance = data.reduce((acc, r) => {
        return acc + (r.movement_type === "deposit" ? Number(r.hours) : -Number(r.hours));
      }, 0);
      return { balance, movements: data.length };
    },
  });
}

export function useEmployeeVacationBalance(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-vacation-balance", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const currentYear = new Date().getFullYear();
      const { data, error } = await supabase
        .from("absences")
        .select("total_days")
        .eq("employee_id", employeeId!)
        .eq("absence_type", "vacaciones")
        .eq("status", "approved")
        .gte("start_date", `${currentYear}-01-01`);
      if (error) throw error;
      const taken = data.reduce((acc, r) => acc + (r.total_days ?? 0), 0);
      return { taken, available: 15, total: 15 };
    },
  });
}

/* ── Finance integration hooks ── */

export function useEmployeePayrollHistory(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-payroll-history", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_details")
        .select("*, payroll_periods(id, period_name, status, created_at)")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeCommissions(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-commissions", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeDeductions(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["employee-deductions", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_deductions")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}
