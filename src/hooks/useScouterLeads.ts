import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Types mirror the scouter_leads / scouter_companies tables. Kept inline
// here (not in the generated Supabase types yet) so the rest of the app
// can import them without a regen step.

export type LeadStatus =
  | "discovery"
  | "candidate"
  | "contacting"
  | "confirmed"
  | "active"
  | "rejected"
  | "discarded";

export type AiStatus = "high_fit" | "medium_fit" | "low_fit" | string | null;

export interface ContactTouch {
  date: string | null;
  channel: "dm1" | "dm2" | "dm3" | "call" | "other";
  note?: string | null;
}

export interface ScouterLead {
  id: string;
  company_id: string;
  instagram_handle: string;
  instagram_url: string | null;
  name: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  status: LeadStatus | string;
  platform: string | null;
  onlyfans_url: string | null;
  followers: number | null;
  bio: string | null;
  verified: boolean;
  photo_data_url: string | null;
  ai_score: number | null;
  ai_status: AiStatus;
  ai_reason: string | null;
  link_in_bio_platform: string | null;
  prefilter_score: number;
  discovery_source: string | null;
  contact_account: string | null;
  target_companies: string[];
  assigned_closer: string | null;
  sub_product: string | null;
  assigned_agency: string | null;
  monetization_usd: number | null;
  split_pct: number | null;
  notes: string | null;
  date_added: string | null;
  date_contacted: string | null;
  date_confirmed: string | null;
  date_active: string | null;
  date_rejected: string | null;
  contact_touches: ContactTouch[];
  created_at: string;
  updated_at: string;
}

export interface ScouterCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface ScouterStats {
  discovered24h: number;
  discovered7d: number;
  discovered30d: number;
  highFit7d: number;
  pendingAi: number;
  byStatus: Record<string, number>;
  total: number;
}

// The `scouter_*` tables aren't in the generated Supabase types yet —
// cast through unknown so the calls don't need full type plumbing.
const sb = supabase as unknown as { from: (table: string) => any };

interface ListParams {
  status?: string | "all";
  limit?: number;
  search?: string;
  favoritesOnly?: boolean;
}

export const useScouterLeads = (params: ListParams = {}) => {
  const { status = "discovery", limit = 60, search = "", favoritesOnly = false } = params;
  return useQuery({
    queryKey: ["scouter-leads", { status, limit, search, favoritesOnly }],
    queryFn: async (): Promise<ScouterLead[]> => {
      // When favoritesOnly is on, fetch the current user's favorite ids
      // first and constrain the leads query with `id IN (...)`. RLS on
      // scouter_lead_favorites already scopes rows to auth.uid(), so
      // this naturally returns only the caller's favorites.
      let favoriteIds: string[] | null = null;
      if (favoritesOnly) {
        const { data: favRows, error: favErr } = await sb
          .from("scouter_lead_favorites")
          .select("lead_id");
        if (favErr) throw favErr;
        favoriteIds = ((favRows ?? []) as { lead_id: string }[]).map((r) => r.lead_id);
        if (favoriteIds.length === 0) return [];
      }

      let q = sb
        .from("scouter_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(
          `instagram_handle.ilike.${term},name.ilike.${term},country.ilike.${term},city.ilike.${term}`,
        );
      }
      if (favoriteIds) q = q.in("id", favoriteIds);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ScouterLead[];
    },
  });
};

/** Set of lead ids the current user has marked as favorite. Used to
 * render the star overlay on cards and to drive favoritesOnly filters. */
export const useLeadFavoriteIds = () =>
  useQuery({
    queryKey: ["scouter-lead-favorite-ids"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await sb
        .from("scouter_lead_favorites")
        .select("lead_id");
      if (error) throw error;
      return new Set(((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
    },
  });

/** Patch any subset of mutable fields on a lead and refresh queries. */
export type LeadPatch = Partial<
  Pick<
    ScouterLead,
    | "status"
    | "category"
    | "notes"
    | "assigned_closer"
    | "assigned_agency"
    | "sub_product"
    | "monetization_usd"
    | "split_pct"
    | "country"
    | "city"
    | "phone"
    | "platform"
    | "onlyfans_url"
    | "name"
  >
>;

export const useUpdateLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadPatch }) => {
      const { data, error } = await sb
        .from("scouter_leads")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterLead;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
      qc.invalidateQueries({ queryKey: ["scouter-stats"] });
    },
    onError: (e) => {
      toast.error("No se pudo guardar", { description: (e as Error).message });
    },
  });
};

/** Toggle favorite for a given lead — inserts a row if none exists for
 * the (lead_id, current_user) pair, deletes it otherwise. */
export const useToggleLeadFavorite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, isFavorite }: { leadId: string; isFavorite: boolean }) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw userErr ?? new Error("No auth user");
      const userId = userData.user.id;
      if (isFavorite) {
        // Remove
        const { error } = await sb
          .from("scouter_lead_favorites")
          .delete()
          .eq("lead_id", leadId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        // Add — onConflict ignore so a double-click doesn't blow up.
        const { error } = await sb
          .from("scouter_lead_favorites")
          .upsert(
            { lead_id: leadId, user_id: userId },
            { onConflict: "lead_id,user_id" },
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-lead-favorite-ids"] });
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
    },
    onError: (e) => {
      toast.error("No se pudo actualizar el favorito", {
        description: (e as Error).message,
      });
    },
  });
};

export const useScouterStats = () =>
  useQuery({
    queryKey: ["scouter-stats"],
    queryFn: async (): Promise<ScouterStats> => {
      const now = Date.now();
      const since24h = new Date(now - 24 * 3600 * 1000).toISOString();
      const since7d = new Date(now - 7 * 24 * 3600 * 1000).toISOString();
      const since30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();

      // Count helpers — Supabase returns count via head + exact.
      const head = (filter: (q: any) => any) =>
        filter(sb.from("scouter_leads").select("*", { count: "exact", head: true }));

      const [
        { count: discovered24h },
        { count: discovered7d },
        { count: discovered30d },
        { count: highFit7d },
        { count: pendingAi },
        { count: total },
        // Per-status counts via lightweight select (status only) so we
        // can derive byStatus without N+1 queries.
        { data: statusRows },
      ] = await Promise.all([
        head((q: any) => q.gte("created_at", since24h)),
        head((q: any) => q.gte("created_at", since7d)),
        head((q: any) => q.gte("created_at", since30d)),
        head((q: any) => q.gte("created_at", since7d).eq("ai_status", "high_fit")),
        head((q: any) => q.is("ai_status", null)),
        head((q: any) => q),
        sb.from("scouter_leads").select("status").limit(2000),
      ]);

      const byStatus: Record<string, number> = {};
      for (const row of (statusRows ?? []) as { status: string }[]) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      }

      return {
        discovered24h: discovered24h ?? 0,
        discovered7d: discovered7d ?? 0,
        discovered30d: discovered30d ?? 0,
        highFit7d: highFit7d ?? 0,
        pendingAi: pendingAi ?? 0,
        byStatus,
        total: total ?? 0,
      };
    },
  });

export const useScouterCompanies = () =>
  useQuery({
    queryKey: ["scouter-companies"],
    queryFn: async (): Promise<ScouterCompany[]> => {
      const { data, error } = await sb
        .from("scouter_companies")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScouterCompany[];
    },
  });
