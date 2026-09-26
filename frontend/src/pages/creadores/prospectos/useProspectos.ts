import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

export interface ProspectRecord {
  id: string;
  name: string;
  instagram: string | null;
  tiktok: string | null;
  platform: string | null;
  category: string | null;
  agency: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// En estas listas `value` es lo que se GUARDA en creator_prospects; `label` es la
// clave del diccionario con la que se muestra.
export const PROSPECT_STATUSES: Array<{ value: string; label: TranslationKey }> = [
  { value: "lead", label: "creadores.pros.stLead" },
  { value: "contactado", label: "creadores.pros.stContacted" },
  { value: "negociando", label: "creadores.pros.stNegotiating" },
  { value: "convertido", label: "creadores.pros.stConverted" },
  { value: "descartado", label: "creadores.pros.stDiscarded" },
];

export const PROSPECT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  lead: { bg: "bg-blue-500/15", text: "text-blue-400" },
  contactado: { bg: "bg-warning/15", text: "text-warning" },
  negociando: { bg: "bg-purple-500/15", text: "text-purple-400" },
  convertido: { bg: "bg-success/15", text: "text-success" },
  descartado: { bg: "bg-muted", text: "text-muted-foreground" },
};

export const PROSPECT_SOURCES: Array<{ value: string; label: TranslationKey }> = [
  { value: "redes", label: "creadores.pros.srcSocials" },
  { value: "referido", label: "creadores.pros.srcReferral" },
  { value: "scouting", label: "creadores.pros.srcScouting" },
  { value: "inbound", label: "creadores.pros.srcInbound" },
  { value: "otro", label: "cr.offCatOther" },
];

// Nombres propios: solo "Otra" tiene etiqueta traducida.
export const PROSPECT_PLATFORMS: Array<{ value: string; label: string; labelKey?: TranslationKey }> = [
  { value: "OnlyFans", label: "OnlyFans" },
  { value: "Instagram", label: "Instagram" },
  { value: "TikTok", label: "TikTok" },
  { value: "Twitter", label: "Twitter/X" },
  { value: "YouTube", label: "YouTube" },
  { value: "Otra", label: "Otra", labelKey: "creadores.socials.other" },
];

export const AGENCY_ORDER = [
  "Atomic Agency", "Elite Models", "Kash Agency",
  "Unlok Platform", "Trafix", "Otra",
];

export function useProspectos() {
  return useQuery({
    queryKey: ["creator_prospects"],
    queryFn: async () => {
      const { data, error } = await supabase
        // vista enmascarada: phone/email reales solo para admin (revocados en la tabla base)
        .from("v_creator_prospects" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProspectRecord[];
    },
  });
}

export function useAddProspect() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<ProspectRecord>) => {
      const { error } = await supabase.from("creator_prospects" as any).insert({
        ...data,
        created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator_prospects"] });
      toast({ title: t("creadores.pros.created") });
    },
    onError: () => toast({ title: t("cr.errCreateProspect"), variant: "destructive" }),
  });
}

export function useUpdateProspect() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProspectRecord> }) => {
      const { error } = await supabase.from("creator_prospects" as any).update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator_prospects"] });
      toast({ title: t("creadores.pros.updated") });
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });
}

export function useDeleteProspect() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_prospects" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["creator_prospects"] });
      toast({ title: t("creadores.pros.deleted") });
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });
}

export function useStartOnboarding() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ prospect, agency }: { prospect: ProspectRecord; agency: string }) => {
      if (!user) throw new Error(t("creadores.pros.noUser"));
      // SERVER-SIDE: el RPC lee phone/email REALES del prospecto (que el cliente ya ve
      // enmascarados) y crea creadora + creator_business + marca convertido en una transacción.
      const { data, error } = await supabase.rpc("start_prospect_onboarding", {
        p_prospect_id: prospect.id,
        p_agency: agency,
      } as never);
      if (error) throw error;
      return (data as unknown as string) || prospect.id;
    },
    onSuccess: (creatorId) => {
      qc.invalidateQueries({ queryKey: ["creator_prospects"] });
      qc.invalidateQueries({ queryKey: ["creators"] });
      toast({ title: t("creadores.pros.onbStarted") });
      navigate(`/creadores/onboarding/${creatorId}`);
    },
    onError: () => toast({ title: t("cr.errStartOnboarding"), variant: "destructive" }),
  });
}
