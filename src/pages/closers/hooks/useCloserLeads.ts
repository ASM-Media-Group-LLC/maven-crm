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

export const useCloserLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [activeTab, setActiveTab] = useState("todos");

  // Fetch leads with pagination (up to 5000 for the active filter)
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["closer-leads", activeTab, dateFrom?.toISOString(), dateTo?.toISOString(), qualityFilter],
    queryFn: async () => {
      const statusFilter = TAB_STATUS_MAP[activeTab] || [];

      let query = supabase
        .from("leadgen_entries")
        .select("id, model_handle, platform, quality, company, phone_raw, source_link, entry_date, country_code, status, notes, ticket_number")
        .order("entry_date", { ascending: false });

      if (statusFilter.length === 1) {
        query = query.eq("status", statusFilter[0]);
      } else if (statusFilter.length > 1) {
        query = query.in("status", statusFilter);
      }

      if (dateFrom) query = query.gte("entry_date", dateFrom.toISOString().slice(0, 10));
      if (dateTo) query = query.lte("entry_date", dateTo.toISOString().slice(0, 10));
      if (qualityFilter) query = query.eq("quality", qualityFilter);

      query = query.limit(500);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CloserLead[];
    },
    placeholderData: keepPreviousData,
  });

  // Counts per status for KPIs
  const { data: statusCounts = {} } = useQuery({
    queryKey: ["closer-leads-counts"],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      
      // Fetch counts for each relevant status
      const statuses = ["no_response", "contactado", "replied", "interested", "meeting_set", "confirmed", "completed", "not_interested"];
      
      await Promise.all(
        statuses.map(async (status) => {
          const { count } = await supabase
            .from("leadgen_entries")
            .select("id", { count: "exact", head: true })
            .eq("status", status);
          counts[status] = count || 0;
        })
      );

      return counts;
    },
    staleTime: 30_000,
  });

  // Client-side search filter
  const filtered = search
    ? leads.filter((l) => l.model_handle.toLowerCase().includes(search.toLowerCase()))
    : leads;

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ status } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
      queryClient.invalidateQueries({ queryKey: ["closer-leads-counts"] });
      toast({ title: "Estado actualizado" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const updateNotes = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("leadgen_entries")
        .update({ notes } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-leads"] });
      toast({ title: "Notas actualizadas" });
    },
  });

  return {
    leads: filtered,
    isLoading,
    statusCounts,
    search, setSearch,
    qualityFilter, setQualityFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    activeTab, setActiveTab,
    updateStatus,
    updateNotes,
  };
};
