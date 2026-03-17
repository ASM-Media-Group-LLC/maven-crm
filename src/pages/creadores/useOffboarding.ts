import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Offboarding {
  id: string;
  creator_id: string;
  status: string;
  exit_date: string | null;
  motivo_operativo: string | null;
  motivo_comercial: string | null;
  motivo_final: string | null;
  categoria: string | null;
  comentarios: string | null;
  check_pagos: boolean;
  check_material: boolean;
  check_campanas: boolean;
  check_accesos: boolean;
  check_documentacion: boolean;
  last_revenue: number | null;
  avg_monthly_revenue: number | null;
  estimated_lost_revenue: number | null;
  comunicado_generado: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OffboardingApproval {
  id: string;
  offboarding_id: string;
  approver_id: string;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
}

export interface OffboardingListItem extends Offboarding {
  creator_name: string | null;
  artistic_name: string | null;
  instagram_handle: string | null;
  approval_count: number;
}

// Hook for creator profile (by creator_id)
export function useOffboarding(creatorId: string) {
  const queryClient = useQueryClient();

  const offboardingQuery = useQuery({
    queryKey: ["creator_offboarding", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_offboardings")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Offboarding | null;
    },
    enabled: !!creatorId,
  });

  const approvalsQuery = useQuery({
    queryKey: ["creator_offboarding_approvals", offboardingQuery.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_offboarding_approvals")
        .select("*")
        .eq("offboarding_id", offboardingQuery.data!.id);
      if (error) throw error;
      return (data ?? []) as OffboardingApproval[];
    },
    enabled: !!offboardingQuery.data?.id,
  });

  const monetizationQuery = useQuery({
    queryKey: ["creator_monetization_impact", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_monetization")
        .select("amount, month_year")
        .eq("creator_id", creatorId)
        .order("month_year", { ascending: false })
        .limit(12);
      if (error) throw error;
      const amounts = (data ?? []).map((d) => d.amount ?? 0);
      const lastRevenue = amounts[0] ?? 0;
      const avgMonthly = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
      const estimatedLost = avgMonthly * 12;
      return { lastRevenue, avgMonthly, estimatedLost };
    },
    enabled: !!creatorId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["creator_offboarding", creatorId] });
    queryClient.invalidateQueries({ queryKey: ["creator_offboarding_approvals"] });
  };

  const updateOffboarding = useMutation({
    mutationFn: async (updates: Partial<Offboarding>) => {
      if (!offboardingQuery.data?.id) throw new Error("No offboarding record");
      const { error } = await supabase
        .from("creator_offboardings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", offboardingQuery.data.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (approverId: string) => {
      if (!offboardingQuery.data?.id) throw new Error("No offboarding record");
      const { error } = await supabase
        .from("creator_offboarding_approvals")
        .upsert(
          {
            offboarding_id: offboardingQuery.data.id,
            approver_id: approverId,
            approved: true,
            approved_at: new Date().toISOString(),
          },
          { onConflict: "offboarding_id,approver_id" }
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    offboarding: offboardingQuery.data,
    approvals: approvalsQuery.data ?? [],
    financialImpact: monetizationQuery.data,
    isLoading: offboardingQuery.isLoading,
    updateOffboarding,
    approve,
    refetch: invalidate,
  };
}

// Hook for detail page (by offboarding_id)
export function useOffboardingById(offboardingId: string) {
  const queryClient = useQueryClient();

  const offboardingQuery = useQuery({
    queryKey: ["offboarding_by_id", offboardingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_offboardings")
        .select("*")
        .eq("id", offboardingId)
        .maybeSingle();
      if (error) throw error;
      return data as Offboarding | null;
    },
    enabled: !!offboardingId,
  });

  const creatorId = offboardingQuery.data?.creator_id;

  const creatorInfoQuery = useQuery({
    queryKey: ["offboarding_creator_info", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("name, artistic_name, instagram_handle")
        .eq("id", creatorId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!creatorId,
  });

  const approvalsQuery = useQuery({
    queryKey: ["creator_offboarding_approvals", offboardingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_offboarding_approvals")
        .select("*")
        .eq("offboarding_id", offboardingId);
      if (error) throw error;
      return (data ?? []) as OffboardingApproval[];
    },
    enabled: !!offboardingId,
  });

  const monetizationQuery = useQuery({
    queryKey: ["creator_monetization_impact", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_monetization")
        .select("amount, month_year")
        .eq("creator_id", creatorId!)
        .order("month_year", { ascending: false })
        .limit(12);
      if (error) throw error;
      const amounts = (data ?? []).map((d) => d.amount ?? 0);
      const lastRevenue = amounts[0] ?? 0;
      const avgMonthly = amounts.length > 0 ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
      const estimatedLost = avgMonthly * 12;
      return { lastRevenue, avgMonthly, estimatedLost };
    },
    enabled: !!creatorId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["offboarding_by_id", offboardingId] });
    queryClient.invalidateQueries({ queryKey: ["creator_offboarding_approvals", offboardingId] });
  };

  const updateOffboarding = useMutation({
    mutationFn: async (updates: Partial<Offboarding>) => {
      const { error } = await supabase
        .from("creator_offboardings")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", offboardingId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: async (approverId: string) => {
      const { error } = await supabase
        .from("creator_offboarding_approvals")
        .upsert(
          {
            offboarding_id: offboardingId,
            approver_id: approverId,
            approved: true,
            approved_at: new Date().toISOString(),
          },
          { onConflict: "offboarding_id,approver_id" }
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    offboarding: offboardingQuery.data,
    creatorInfo: creatorInfoQuery.data,
    approvals: approvalsQuery.data ?? [],
    financialImpact: monetizationQuery.data,
    isLoading: offboardingQuery.isLoading,
    updateOffboarding,
    approve,
    refetch: invalidate,
  };
}

// Hook for list page — all offboardings with creator info
export function useAllOffboardings() {
  return useQuery({
    queryKey: ["all_offboardings"],
    queryFn: async () => {
      // Fetch offboardings
      const { data: offboardings, error } = await supabase
        .from("creator_offboardings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      if (!offboardings || offboardings.length === 0) return [] as OffboardingListItem[];

      // Fetch creator info for all
      const creatorIds = [...new Set(offboardings.map((o) => o.creator_id))];
      const { data: creators } = await supabase
        .from("creators")
        .select("id, name, artistic_name, instagram_handle")
        .in("id", creatorIds);

      const creatorMap = new Map((creators ?? []).map((c) => [c.id, c]));

      // Fetch approval counts
      const offIds = offboardings.map((o) => o.id);
      const { data: approvals } = await supabase
        .from("creator_offboarding_approvals")
        .select("offboarding_id, approved")
        .in("offboarding_id", offIds)
        .eq("approved", true);

      const approvalCounts = new Map<string, number>();
      (approvals ?? []).forEach((a) => {
        approvalCounts.set(a.offboarding_id, (approvalCounts.get(a.offboarding_id) ?? 0) + 1);
      });

      return offboardings.map((o) => {
        const c = creatorMap.get(o.creator_id);
        return {
          ...o,
          creator_name: c?.name ?? null,
          artistic_name: c?.artistic_name ?? null,
          instagram_handle: c?.instagram_handle ?? null,
          approval_count: approvalCounts.get(o.id) ?? 0,
        } as OffboardingListItem;
      });
    },
  });
}

export async function createOffboardingRecord(creatorId: string, createdBy: string): Promise<string> {
  const { data, error } = await supabase.from("creator_offboardings").insert({
    creator_id: creatorId,
    status: "en_proceso",
    exit_date: new Date().toISOString().split("T")[0],
    created_by: createdBy,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}
