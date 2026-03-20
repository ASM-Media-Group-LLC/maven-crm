import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

export interface CloserCreatorRow {
  id: string;
  instagram_handle: string;
  category: string | null;
  passed_date: string | null;
  source_account: string | null;
  phone: string | null;
  notes: string | null;
  onlyfans_url: string | null;
  estimated_monetization: number | null;
  agency_commission: number | null;
  stage: string;
  assigned_to: string | null;
  rejection_reason: string | null;
  confirmed_date: string | null;
  completed_date: string | null;
  last_contact_date: string | null;
  monthly_monetization: number | null;
  main_platform: string | null;
  extras: number | null;
  created_at: string;
  updated_at: string;
  leadgen_entry_id: string | null;
  // Joined fields
  agent_name: string | null;
  contact_count: number;
  // Source indicator
  _source: "closer" | "leadgen";
  _lg_status: string | null;
}

export const CLOSER_STAGES = [
  "Asignada",
  "Confirmada",
  "Completada",
  "No interesada",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  Asignada: "Asignada",
  Confirmada: "Confirmada",
  Completada: "Completada",
  "No interesada": "No interesada",
  "Pendiente LG": "Pendiente LG",
};

export const TAB_STAGE_MAP: Record<string, string[]> = {
  todas: [],
  pendiente_lg: [],
  asignadas: ["Asignada"],
  confirmadas: ["Confirmada"],
  completadas: ["Completada"],
  no_interesadas: ["No interesada"],
};

export const PLATFORMS = ["OnlyFans", "Trafix", "Blu", "Piclink", "LeakHunter", "ORA", "Otra"] as const;
export const CHANNELS = ["Instagram", "WhatsApp", "Telegram"] as const;
export const RESULTS = ["Contestó", "No contestó", "Interesada", "No interesada", "Pendiente"] as const;

// Contact follow-up sequence: days from passed_date
const CONTACT_SEQUENCE = [1, 3, 5, 8, 15, 29];

export const getNextContactDate = (passedDate: string | null, contactCount: number): Date | null => {
  if (!passedDate || contactCount >= 6) return null;
  const base = new Date(passedDate);
  const dayOffset = CONTACT_SEQUENCE[contactCount] || 29;
  const next = new Date(base);
  next.setDate(next.getDate() + dayOffset);
  return next;
};

export const isFollowUpPending = (lastContactDate: string | null): boolean => {
  if (!lastContactDate) return true;
  const diff = Date.now() - new Date(lastContactDate).getTime();
  return diff > 3 * 24 * 60 * 60 * 1000; // >3 days
};

export type DateFieldType = "passed_date" | "lg_entry_date";

const PAGE_SIZE = 100;

export const useCloserLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isManager, role } = useUserRole();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("asignadas");
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateField, setDateField] = useState<DateFieldType>("passed_date");

  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(0); };

  // Main query: closer_creators (all tabs except pendiente_lg) or leadgen_entries (pendiente_lg tab)
  const { data: creatorsData, isLoading } = useQuery({
    queryKey: ["closer-creators-list", activeTab, page, user?.id, role, dateFrom?.toISOString(), dateTo?.toISOString(), dateField],
    queryFn: async () => {
      // ── Pendiente LG tab: now uses closer_creators with stage 'Pendiente LG' (auto-synced by trigger) ──
      if (activeTab === "pendiente_lg") {
        let query = supabase
          .from("closer_creators")
          .select("*", { count: "exact" })
          .eq("stage", "Pendiente LG")
          .order("created_at", { ascending: false });

        if (dateFrom && dateTo) {
          const fromStr = dateFrom.toISOString().split("T")[0];
          const toStr = dateTo.toISOString().split("T")[0];
          query = query.gte("passed_date", fromStr).lte("passed_date", toStr);
        }

        const from = page * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        const rows: CloserCreatorRow[] = (data || []).map((c: any) => ({
          ...c,
          leadgen_entry_id: c.leadgen_entry_id ?? null,
          estimated_monetization: c.estimated_monetization ?? 0,
          agency_commission: c.agency_commission ?? 0,
          extras: c.extras ?? 0,
          main_platform: c.main_platform ?? null,
          agent_name: null,
          contact_count: 0,
          _source: "closer" as const,
          _lg_status: null,
        }));

        return { creators: rows, total: count || 0 };
      }

      // ── All other tabs: fetch from closer_creators ──
      const stageFilter = TAB_STAGE_MAP[activeTab] || [];

      let query = supabase
        .from("closer_creators")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (stageFilter.length === 1) {
        query = query.eq("stage", stageFilter[0]);
      } else if (stageFilter.length > 1) {
        query = query.in("stage", stageFilter);
      }

      // Role-based filter: closers only see assigned
      if (!isAdmin && !isManager && user?.id) {
        query = query.eq("assigned_to", user.id);
      }

      // Date filter server-side for passed_date
      if (dateFrom && dateTo && dateField === "passed_date") {
        const fromStr = dateFrom.toISOString().split("T")[0];
        const toStr = dateTo.toISOString().split("T")[0];
        query = query.gte("passed_date", fromStr).lte("passed_date", toStr);
      }

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const closerRows = (data || []) as any[];

      // Collect agent IDs for profiles
      const agentIds = [...new Set(closerRows.map((c) => c.assigned_to).filter(Boolean))] as string[];

      let profilesMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", agentIds);
        for (const p of profiles || []) {
          profilesMap[p.id] = p.full_name || "Sin nombre";
        }
      }

      // Fetch contact counts per creator
      const creatorIds = closerRows.map((c) => c.id);
      let contactCountMap: Record<string, number> = {};
      if (creatorIds.length > 0) {
        const { data: contacts } = await supabase
          .from("closer_contact_history")
          .select("creator_id")
          .in("creator_id", creatorIds);
        for (const c of contacts || []) {
          contactCountMap[c.creator_id] = (contactCountMap[c.creator_id] || 0) + 1;
        }
      }

      const enriched: CloserCreatorRow[] = closerRows.map((c) => ({
        ...c,
        leadgen_entry_id: c.leadgen_entry_id ?? null,
        estimated_monetization: c.estimated_monetization ?? 0,
        agency_commission: c.agency_commission ?? 0,
        extras: c.extras ?? 0,
        main_platform: c.main_platform ?? null,
        agent_name: c.assigned_to ? (profilesMap[c.assigned_to] || null) : null,
        contact_count: contactCountMap[c.id] || 0,
        _source: "closer" as const,
        _lg_status: null,
      }));

      return { creators: enriched, total: count || 0 };
    },
    placeholderData: keepPreviousData,
    enabled: !!user?.id && !!role,
  });

  const creators = creatorsData?.creators || [];
  const totalCount = creatorsData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Status counts for KPIs
  const { data: statusCounts = {} } = useQuery({
    queryKey: ["closer-creators-counts", user?.id, role],
    queryFn: async () => {
      let query = supabase.from("closer_creators").select("stage");
      if (!isAdmin && !isManager && user?.id) {
        query = query.eq("assigned_to", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const s = row.stage || "Asignada";
        counts[s] = (counts[s] || 0) + 1;
      }
      return counts;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Revenue by platform
  const { data: platformRevenue = {} } = useQuery({
    queryKey: ["closer-platform-revenue", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_platform_sales")
        .select("platform, price");
      if (error) throw error;
      const rev: Record<string, number> = {};
      for (const row of data || []) {
        rev[row.platform] = (rev[row.platform] || 0) + Number(row.price || 0);
      }
      return rev;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Unique agents for filter select
  const agentList = [...new Map(
    creators.filter(c => c.agent_name).map(c => [c.assigned_to!, c.agent_name!])
  )].map(([id, name]) => ({ id, name }));

  // Client-side search + filters
  const filtered = creators.filter((c) => {
    if (search && !c.instagram_handle.toLowerCase().includes(search.toLowerCase())) return false;
    if (agentFilter && c.assigned_to !== agentFilter) return false;
    if (platformFilter && c.main_platform !== platformFilter) return false;
    return true;
  });

  // Optimistic update
  const optimisticUpdate = (id: string, updates: Partial<CloserCreatorRow>) => {
    queryClient.setQueryData(
      ["closer-creators-list", activeTab, page, user?.id, role, dateFrom?.toISOString(), dateTo?.toISOString(), dateField],
      (old: { creators: CloserCreatorRow[]; total: number } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          creators: old.creators.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        };
      }
    );
  };

  const updateField = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const { error } = await supabase
        .from("closer_creators")
        .update({ [field]: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, field, value }) => {
      optimisticUpdate(id, { [field]: value } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const updates: Record<string, unknown> = { stage };
      if (stage === "Confirmada") updates.confirmed_date = new Date().toISOString();
      if (stage === "Completada") updates.completed_date = new Date().toISOString();
      const { error } = await supabase.from("closer_creators").update(updates).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, stage }) => {
      optimisticUpdate(id, { stage } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const assignCreator = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string }) => {
      const { error } = await supabase.from("closer_creators").update({ assigned_to }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      toast({ title: "Creator asignada" });
    },
  });

  // Convert a leadgen entry into a closer_creators row
  const convertLeadgenEntry = useMutation({
    mutationFn: async ({ leadgenEntryId, stage, assigned_to }: { leadgenEntryId: string; stage?: string; assigned_to?: string }) => {
      // Fetch the leadgen entry data
      const { data: lg, error: lgErr } = await supabase
        .from("leadgen_entries")
        .select("model_handle, quality, company, phone_e164, notes, source_link, platform, entry_date")
        .eq("id", leadgenEntryId)
        .single();
      if (lgErr || !lg) throw lgErr || new Error("Leadgen entry not found");

      const insertData: Record<string, unknown> = {
        instagram_handle: lg.model_handle || "—",
        category: lg.quality || null,
        source_account: lg.company || null,
        phone: lg.phone_e164 || null,
        notes: lg.notes || null,
        onlyfans_url: lg.source_link || null,
        main_platform: lg.platform || null,
        passed_date: lg.entry_date || new Date().toISOString().split("T")[0],
        leadgen_entry_id: leadgenEntryId,
        stage: stage || "Asignada",
        created_by: user?.id || null,
      };
      if (assigned_to) insertData.assigned_to = assigned_to;

      const { error } = await supabase.from("closer_creators").insert(insertData as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: "Lead convertido a Closers" });
    },
    onError: (e: Error) => {
      toast({ title: "Error al convertir", description: e.message, variant: "destructive" });
    },
  });

  return {
    creators: filtered,
    isLoading,
    statusCounts,
    platformRevenue,
    totalCount,
    totalPages,
    page, setPage,
    search, setSearch,
    activeTab, setActiveTab: handleTabChange,
    agentFilter, setAgentFilter,
    platformFilter, setPlatformFilter,
    agentList,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateField, setDateField,
    updateField,
    updateStage,
    assignCreator,
    convertLeadgenEntry,
    isAdmin,
    isManager,
  };
};
