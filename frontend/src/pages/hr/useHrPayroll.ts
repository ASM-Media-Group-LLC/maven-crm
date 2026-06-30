import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Nómina/costo de RRHH. v_hr_payroll = costo vs ingreso atribuido por persona
// (chatters = modelado base+comisión; resto = base_salary_cop del rol / FX).
// hr_role_cost = base por rol, editable (management). management-only (RLS).

export interface PayrollRow {
  profile_id: string;
  name: string;
  role: string;
  in_hubstaff: boolean;
  base_salary_cop: number;
  cost_usd: number | null;
  revenue_usd: number | null;
  margin_usd: number | null;
  roi_x: number | null;
  cost_modelado: boolean;
}

export interface RoleCost {
  role: string;
  base_salary_cop: number;
}

export const useHrPayroll = () =>
  useQuery({
    queryKey: ["hr-payroll"],
    queryFn: async (): Promise<PayrollRow[]> => {
      const { data, error } = await (supabase as any).from("v_hr_payroll").select("*");
      if (error) throw error;
      return ((data ?? []) as PayrollRow[]).sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0));
    },
    staleTime: 60_000,
  });

export const useRoleCosts = () =>
  useQuery({
    queryKey: ["hr-role-cost"],
    queryFn: async (): Promise<RoleCost[]> => {
      const { data, error } = await (supabase as any).from("hr_role_cost").select("role, base_salary_cop");
      if (error) throw error;
      return ((data ?? []) as RoleCost[]).sort((a, b) => a.role.localeCompare(b.role));
    },
    staleTime: 60_000,
  });

export const useSaveRoleCost = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: RoleCost[]) => {
      const payload = rows.map((r) => ({ role: r.role, base_salary_cop: Math.max(0, Math.round(r.base_salary_cop || 0)), updated_at: new Date().toISOString() }));
      const { error } = await (supabase as any).from("hr_role_cost").upsert(payload, { onConflict: "role" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-role-cost"] });
      qc.invalidateQueries({ queryKey: ["hr-payroll"] });
    },
  });
};
