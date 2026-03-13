import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface LeadDisponible {
  id: string;
  model_handle: string;
  platform: string;
  quality: string;
  company: string | null;
  phone_raw: string | null;
  source_link: string | null;
  entry_date: string;
  country_code: string | null;
  status: string;
  ticket_number: string | null;
}

export const useLeadsDisponibles = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Get IDs of already-converted leads
  const { data: convertedIds = [] } = useQuery({
    queryKey: ["closer-creators-leadgen-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_creators")
        .select("leadgen_entry_id")
        .not("leadgen_entry_id", "is", null);
      if (error) throw error;
      return (data || []).map((r) => r.leadgen_entry_id as string);
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-disponibles", dateFrom?.toISOString(), dateTo?.toISOString(), qualityFilter],
    queryFn: async () => {
      let query = supabase
        .from("leadgen_entries")
        .select("id, model_handle, platform, quality, company, phone_raw, source_link, entry_date, country_code, status, ticket_number")
        .order("entry_date", { ascending: false })
        .limit(500);

      if (dateFrom) {
        query = query.gte("entry_date", dateFrom.toISOString().slice(0, 10));
      }
      if (dateTo) {
        query = query.lte("entry_date", dateTo.toISOString().slice(0, 10));
      }
      if (qualityFilter) {
        query = query.eq("quality", qualityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LeadDisponible[];
    },
  });

  // Filter out already converted + search filter
  const filtered = leads.filter((l) => {
    if (convertedIds.includes(l.id)) return false;
    if (search && !l.model_handle.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const availableCount = leads.filter((l) => !convertedIds.includes(l.id)).length;

  const reclamarLead = useMutation({
    mutationFn: async (lead: LeadDisponible) => {
      if (!user) throw new Error("No autenticado");

      const { error: insertError } = await supabase.from("closer_creators").insert({
        instagram_handle: lead.model_handle,
        source_account: lead.company || null,
        category: lead.quality || null,
        phone: lead.phone_raw || null,
        onlyfans_url: lead.source_link || null,
        passed_date: lead.entry_date || new Date().toISOString().slice(0, 10),
        stage: "Asignada",
        estimated_monetization: 0,
        agency_commission: 0,
        created_by: user.id,
        assigned_to: user.id,
        leadgen_entry_id: lead.id,
      } as any);
      if (insertError) throw insertError;

      await supabase
        .from("leadgen_entries")
        .update({ status: "contactado" } as any)
        .eq("id", lead.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads-disponibles"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-leadgen-ids"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      toast({ title: "Lead reclamado", description: "El lead fue agregado a tu pipeline." });
    },
    onError: (e: Error) => {
      toast({ title: "Error al reclamar", description: e.message, variant: "destructive" });
    },
  });

  return {
    leads: filtered,
    availableCount,
    isLoading,
    search, setSearch,
    qualityFilter, setQualityFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    reclamarLead,
  };
};
