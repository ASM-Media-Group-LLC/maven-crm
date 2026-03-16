import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CloserLead {
  id: string;
  model_handle: string;
  platform: string;
  quality: string;
  company: string | null;
  phone_raw: string | null;
  source_link: string | null;
  entry_date: string;
  country_code: string | null;
  status: string | null;
  notes: string | null;
  ticket_number: string | null;
}

export const LEAD_STATUSES = [
  "no_response",
  "contactado",
  "replied",
  "interested",
  "meeting_set",
  "confirmed",
  "completed",
  "not_interested",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  no_response: "Sin contactar",
  contactado: "Contactado",
  replied: "Contactado",
  interested: "Interesada",
  meeting_set: "En negociación",
  confirmed: "Confirmada",
  completed: "Completada",
  not_interested: "No interesada",
};

export const TAB_STATUS_MAP: Record<string, string[]> = {
  todos: [],
  sin_contactar: ["no_response"],
  contactados: ["contactado", "replied"],
  interesadas: ["interested"],
  negociacion: ["meeting_set"],
  confirmadas: ["confirmed"],
  completadas: ["completed"],
  no_interesadas: ["not_interested"],
};

const PAGE_SIZE = 100;

export const useCloserLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [activeTab, setActiveTab] = useState("todos");
  const [page, setPage] = useState(0);

  // Reset page when filters change
  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(0); };

  // Fetch leads with pagination
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ["closer-leads", activeTab, dateFrom?.toISOString(), dateTo?.toISOString(), qualityFilter, page],
    queryFn: async () => {
      const statusFilter = TAB_STATUS_MAP[activeTab] || [];

      let query = supabase
        .from("leadgen_entries")
        .select("id, model_handle, platform, quality, company, phone_raw, source_link, entry_date, country_code, status, notes, ticket_number", { count: "exact" })
        .order("entry_date", { ascending: false });

      if (statusFilter.length === 1) {
        query = query.eq("status", statusFilter[0]);
      } else if (statusFilter.length > 1) {
        query = query.in("status", statusFilter);
      }

      if (dateFrom) query = query.gte("entry_date", dateFrom.toISOString().slice(0, 10));
      if (dateTo) query = query.lte("entry_date", dateTo.toISOString().slice(0, 10));
      if (qualityFilter) query = query.eq("quality", qualityFilter);

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { leads: (data || []) as CloserLead[], total: count || 0 };
    },
    placeholderData: keepPreviousData,
  });

  const leads = leadsData?.leads || [];
  const totalCount = leadsData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Single query for all status counts
  const { data: statusCounts = {} } = useQuery({
    queryKey: ["closer-leads-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leadgen_entries")
        .select("status");

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        const s = row.status || "no_response";
        counts[s] = (counts[s] || 0) + 1;
      }
      return counts;
    },
    staleTime: 30_000,
  });

  // Client-side search filter
  const filtered = search
    ? leads.filter((l) => l.model_handle.toLowerCase().includes(search.toLowerCase()))
    : leads;

  // Optimistic update helper
  const optimisticUpdate = (id: string, updates: Partial<CloserLead>) => {
    queryClient.setQueryData(
      ["closer-leads", activeTab, dateFrom?.toISOString(), dateTo?.toISOString(), qualityFilter, page],
      (old: { leads: CloserLead[]; total: number } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          leads: old.leads.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        };
      }
    );
  };

  const updateField = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: string | null }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ [field]: value } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, field, value }) => {
      optimisticUpdate(id, { [field]: value } as Partial<CloserLead>);
    },
    onSuccess: () => {
      // Only refresh counts, not the full list (already optimistically updated)
      queryClient.invalidateQueries({ queryKey: ["closer-leads-counts"] });
    },
    onError: (e: Error) => {
      // Revert on error
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, status }) => {
      optimisticUpdate(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-leads-counts"] });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return {
    leads: filtered,
    isLoading,
    statusCounts,
    totalCount,
    totalPages,
    page, setPage,
    search, setSearch,
    qualityFilter, setQualityFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    activeTab, setActiveTab: handleTabChange,
    updateStatus,
    updateField,
  };
};
