import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// ─── Interfaces ───────────────────────────────────────────────

export interface QBMapping {
  category: string;
  type: "ingreso" | "egreso";
  code: string;
  account_name: string;
}

export interface PaymentMethod {
  name: string;
  commission_pct: number;
  active: boolean;
}

export interface CostCenter {
  name: string;
  code: string;
  monthly_budget: number;
}

export interface CommissionDefaults {
  creator_pct: number;
  partner_pct: number;
  exceptions: { creator_id: string; creator_name?: string; pct: number }[];
}

export interface PayrollParams {
  deductions: { health_pct: number; pension_pct: number; tax_pct: number };
  overtime_multipliers: { daytime: number; nighttime: number; holiday: number };
  hour_bank: { validity_months: number; hour_value: number };
}

// ─── Generic hook ─────────────────────────────────────────────

export function useFinancialConfig(configKey?: string) {
  return useQuery({
    queryKey: ["financial-config", configKey],
    queryFn: async () => {
      let q = supabase.from("financial_config").select("*");
      if (configKey) q = q.eq("config_key", configKey);
      const { data, error } = await q.order("config_key");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateFinancialConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ configKey, value }: { configKey: string; value: any }) => {
      const { error } = await supabase
        .from("financial_config")
        .update({ config_value: value })
        .eq("config_key", configKey);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-config"] });
      toast({ title: "Configuración guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });
}

// ─── Specialized hooks ────────────────────────────────────────

export function usePayrollParams() {
  const { data, ...rest } = useFinancialConfig("payroll_params");
  const params: PayrollParams | null = data?.[0]?.config_value as any ?? null;
  return { params, ...rest };
}

export function usePaymentMethods() {
  const { data, ...rest } = useFinancialConfig("payment_methods");
  const methods: PaymentMethod[] = (data?.[0]?.config_value as any)?.methods ?? [];
  return { methods, ...rest };
}

export function useCostCenters() {
  const { data, ...rest } = useFinancialConfig("cost_centers");
  const centers: CostCenter[] = (data?.[0]?.config_value as any)?.centers ?? [];
  return { centers, ...rest };
}

export function useCommissionDefaults() {
  const { data, ...rest } = useFinancialConfig("commission_defaults");
  const defaults: CommissionDefaults | null = data?.[0]?.config_value as any ?? null;
  return { defaults, ...rest };
}

export function useQuickBooksTemplates() {
  const { data, ...rest } = useFinancialConfig("quickbooks_templates");
  const mappings: QBMapping[] = (data?.[0]?.config_value as any)?.mappings ?? [];
  return { mappings, ...rest };
}
