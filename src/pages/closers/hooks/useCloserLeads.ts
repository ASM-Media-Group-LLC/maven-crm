import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { normalizeHandle } from "@/lib/handle-utils";

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
  Nuevo: "Nuevo",
  Asignada: "Asignada",
  Confirmada: "Confirmada",
  Completada: "Completada",
  "No interesada": "No interesada",
  "Pendiente LG": "Pendiente LG",
};

export const TAB_STAGE_MAP: Record<string, string[]> = {
  todas: [],
  nuevo: ["Nuevo"],
  pendiente_lg: [],
  asignadas: ["Asignada"],
  confirmadas: ["Confirmada"],
  completadas: ["Completada"],
  no_interesadas: ["No interesada"],
};

export const PLATFORMS = ["OnlyFans", "Trafix", "Blu", "Piclink", "LeakHunter", "ORA", "Otra"] as const;
export const SALE_PLATFORMS = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"] as const;
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

const PAGE_SIZE = 50;

export const useCloserLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isManager, role } = useUserRole();

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("todas");
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateField, setDateField] = useState<DateFieldType>("passed_date");

  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(0); };
  const handleSetSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleSetAgentFilter = (v: string | null) => { setAgentFilter(v); setPage(0); };
  const handleSetPlatformFilter = (v: string | null) => { setPlatformFilter(v); setPage(0); };
  const handleSetDateFrom = (v: Date | undefined) => { setDateFrom(v); setPage(0); };
  const handleSetDateTo = (v: Date | undefined) => { setDateTo(v); setPage(0); };

  // Normalize search for server-side filtering
  const normalizedSearch = search ? normalizeHandle(search) : "";

  // Main query: closer_creators (all tabs except pendiente_lg) or leadgen_entries (pendiente_lg tab)
  const { data: creatorsData, isLoading } = useQuery({
    queryKey: ["closer-creators-list", activeTab, page, user?.id, role, dateFrom?.toISOString(), dateTo?.toISOString(), dateField],
    queryFn: async () => {
      // ── Pendiente LG tab: closer_creators with stage 'Pendiente LG' ──
      // ── Nuevo tab: closer_creators with stage 'Nuevo' ──
      if (activeTab === "pendiente_lg" || activeTab === "nuevo") {
        const stageValue = activeTab === "nuevo" ? "Nuevo" : "Pendiente LG";
        let query = supabase
          .from("closer_creators")
          .select("*", { count: "exact" })
          .eq("stage", stageValue);

        // For "Nuevo" tab, only show rows originating from closers_contacts (not leadgen)
        if (activeTab === "nuevo") {
          query = query.not("source_contact_id", "is", null);
        }

        query = query.order("created_at", { ascending: false });

        if (dateFrom && dateTo) {
          const fromStr = dateFrom.toISOString().split("T")[0];
          const toStr = dateTo.toISOString().split("T")[0];
          const field = activeTab === "nuevo" ? "created_at" : "passed_date";
          query = query.gte(field, fromStr).lte(field, toStr);
        }

        const from = page * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        const rawRows = (data || []) as any[];

        // Fetch created_by profiles for "nuevo" tab
        let createdByMap: Record<string, string> = {};
        if (activeTab === "nuevo") {
          const createdByIds = [...new Set(rawRows.map((c) => c.created_by).filter(Boolean))] as string[];
          if (createdByIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", createdByIds);
            for (const p of profiles || []) {
              createdByMap[p.id] = p.full_name || "Sin nombre";
            }
          }
        }

        const rows: CloserCreatorRow[] = rawRows.map((c: any) => ({
          ...c,
          leadgen_entry_id: c.leadgen_entry_id ?? null,
          estimated_monetization: c.estimated_monetization ?? 0,
          agency_commission: c.agency_commission ?? 0,
          extras: c.extras ?? 0,
          main_platform: c.main_platform ?? null,
          agent_name: activeTab === "nuevo" && c.created_by ? (createdByMap[c.created_by] || null) : null,
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
      } else {
        // Tab "todas": exclude "Pendiente LG" and "Nuevo" (those have their own tabs)
        query = query.not("stage", "eq", "Pendiente LG");
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

      // Fetch profiles and contact counts in parallel
      const agentIds = [...new Set(closerRows.map((c) => c.assigned_to).filter(Boolean))] as string[];
      const creatorIds = closerRows.map((c) => c.id);

      const [profilesResult, contactsResult] = await Promise.all([
        agentIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", agentIds)
          : Promise.resolve({ data: [] }),
        creatorIds.length > 0
          ? supabase.from("closer_contact_history").select("creator_id").in("creator_id", creatorIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesMap: Record<string, string> = {};
      for (const p of profilesResult.data || []) {
        profilesMap[(p as any).id] = (p as any).full_name || "Sin nombre";
      }

      const contactCountMap: Record<string, number> = {};
      for (const c of contactsResult.data || []) {
        contactCountMap[(c as any).creator_id] = (contactCountMap[(c as any).creator_id] || 0) + 1;
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
    
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  const creators = creatorsData?.creators || [];
  const totalCount = creatorsData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Status counts for KPIs — use server-side RPC
  const { data: statusCounts = {} } = useQuery({
    queryKey: ["closer-creators-counts", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_closer_stage_counts", {
        _user_id: user!.id,
        _is_admin: isAdmin || isManager,
      });
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.stage] = Number(row.cnt);
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

  // OF monetization total (estimated_monetization from completed/confirmed)
  const { data: ofMonetizationTotal = 0 } = useQuery({
    queryKey: ["closer-of-monetization", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_creators")
        .select("estimated_monetization")
        .in("stage", ["Completada", "Confirmada"]);
      if (error) throw error;
      return (data || []).reduce((s, r) => s + Number(r.estimated_monetization || 0), 0);
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Platform sales grouped by creator (for completadas badges)
  const { data: platformSalesByCreator = {} } = useQuery({
    queryKey: ["closer-platform-sales-all", user?.id, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_platform_sales")
        .select("creator_id, platform, price");
      if (error) throw error;
      const map: Record<string, { platform: string; price: number }[]> = {};
      for (const row of data || []) {
        if (!map[row.creator_id]) map[row.creator_id] = [];
        map[row.creator_id].push({ platform: row.platform, price: Number(row.price || 0) });
      }
      return map;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  const agentList = [...new Map(
    creators.filter(c => c.agent_name).map(c => [c.assigned_to!, c.agent_name!])
  )].map(([id, name]) => ({ id, name }));

  // Client-side search + filters
  const filtered = creators.filter((c) => {
    if (search) {
      const normalizedSearch = normalizeHandle(search);
      const handle = c.instagram_handle.toLowerCase();
      if (!handle.includes(normalizedSearch) && !handle.includes(search.toLowerCase())) return false;
    }
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
      const { data: current } = await supabase
        .from("closer_creators")
        .select("stage")
        .eq("id", id)
        .maybeSingle();

      const updates: Record<string, unknown> = { assigned_to };
      if (current?.stage === "Nuevo" || current?.stage === "Pendiente LG") {
        updates.stage = "Asignada";
      }

      const { error } = await supabase.from("closer_creators").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: "Creator asignada" });
    },
    onError: (e: Error) => {
      toast({ title: "Error al asignar", description: e.message, variant: "destructive" });
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
    platformSalesByCreator,
    ofMonetizationTotal,
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
