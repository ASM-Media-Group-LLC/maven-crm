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

export type FunnelWindow = "7d" | "30d" | "90d" | "all";

export interface FunnelData {
  window: FunnelWindow;
  funnel: {
    discovered: number;     // total leads in window (all statuses)
    contacted: number;      // status ∈ {contacting, confirmed, active}
    confirmed: number;      // status ∈ {confirmed, active}
    active: number;         // status === active
    rejected: number;
    discarded: number;
  };
  rates: {
    contactRate: number;    // contacted / discovered
    confirmRate: number;    // confirmed / contacted
    closeRate: number;      // active / confirmed
    overall: number;        // active / discovered
  };
  topSources: Array<{ source: string; count: number }>;
  perCompany: Array<{ company_id: string; total: number; active: number }>;
}

const windowSinceIso = (w: FunnelWindow): string | null => {
  if (w === "all") return null;
  const days = w === "7d" ? 7 : w === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86400_000).toISOString();
};

export const useScouterFunnel = (window: FunnelWindow = "30d") =>
  useQuery({
    queryKey: ["scouter-funnel", window],
    queryFn: async (): Promise<FunnelData> => {
      const since = windowSinceIso(window);
      const head = (filter: (q: any) => any) =>
        filter(sb.from("scouter_leads").select("*", { count: "exact", head: true }));
      const apply = (q: any) => (since ? q.gte("created_at", since) : q);

      const [
        { count: discovery },
        { count: candidate },
        { count: contacting },
        { count: confirmed },
        { count: active },
        { count: rejected },
        { count: discarded },
        { data: rowsForBreakdown },
      ] = await Promise.all([
        head((q: any) => apply(q.eq("status", "discovery"))),
        head((q: any) => apply(q.eq("status", "candidate"))),
        head((q: any) => apply(q.eq("status", "contacting"))),
        head((q: any) => apply(q.eq("status", "confirmed"))),
        head((q: any) => apply(q.eq("status", "active"))),
        head((q: any) => apply(q.eq("status", "rejected"))),
        head((q: any) => apply(q.eq("status", "discarded"))),
        apply(
          sb
            .from("scouter_leads")
            .select("status, discovery_source, company_id")
            .order("created_at", { ascending: false })
            .limit(5000),
        ),
      ]);

      const cnt = (n: number | null | undefined) => n ?? 0;
      const discovered =
        cnt(discovery) + cnt(candidate) + cnt(contacting) + cnt(confirmed) +
        cnt(active) + cnt(rejected) + cnt(discarded);
      const contacted = cnt(contacting) + cnt(confirmed) + cnt(active);
      const confirmedCum = cnt(confirmed) + cnt(active);
      const activeCum = cnt(active);
      const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

      const sourceMap = new Map<string, number>();
      const companyMap = new Map<string, { total: number; active: number }>();
      for (const r of (rowsForBreakdown ?? []) as Array<{
        status: string;
        discovery_source: string | null;
        company_id: string;
      }>) {
        if (r.discovery_source) {
          sourceMap.set(r.discovery_source, (sourceMap.get(r.discovery_source) ?? 0) + 1);
        }
        const c = companyMap.get(r.company_id) ?? { total: 0, active: 0 };
        c.total++;
        if (r.status === "active") c.active++;
        companyMap.set(r.company_id, c);
      }

      return {
        window,
        funnel: {
          discovered,
          contacted,
          confirmed: confirmedCum,
          active: activeCum,
          rejected: cnt(rejected),
          discarded: cnt(discarded),
        },
        rates: {
          contactRate: ratio(contacted, discovered),
          confirmRate: ratio(confirmedCum, contacted),
          closeRate: ratio(activeCum, confirmedCum),
          overall: ratio(activeCum, discovered),
        },
        topSources: Array.from(sourceMap.entries())
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
        perCompany: Array.from(companyMap.entries())
          .map(([company_id, v]) => ({ company_id, ...v }))
          .sort((a, b) => b.total - a.total),
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

// ─── Worker queue · scouter_jobs ───────────────────────────────────────
// Hooks para enquear / monitorear los jobs que consume el
// scouter-worker (servicios/scouter-worker). Los inserts tienen que
// llevar tenant_id explícito porque la tabla no tiene DEFAULT
// current_tenant_id().

export type JobKind =
  | "discover_seed"
  | "discover_hashtag"
  | "score_lead"
  | "enrich_profile";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface ScouterJob {
  id: string;
  kind: JobKind;
  status: JobStatus;
  company_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  result: unknown;
  priority: number;
  tenant_id: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const useCurrentTenantId = () =>
  useQuery({
    queryKey: ["current-tenant-id"],
    queryFn: async (): Promise<string | null> => {
      // Mismo patrón que en useAgencyQa: la fn pública current_tenant_id()
      // es el source of truth porque mira el JWT y aplica RLS.
      const { data, error } = await (
        supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: unknown }>
      )("current_tenant_id");
      if (error) throw error;
      return (data ?? null) as string | null;
    },
    staleTime: 5 * 60 * 1000,
  });

interface EnqueueJobBase {
  company_id?: string | null;
  priority?: number;
}

export interface EnqueueDiscoverSeedInput extends EnqueueJobBase {
  seeds: string[];
  maxLeads?: number;
}

export const useEnqueueDiscoverySeed = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: EnqueueDiscoverSeedInput): Promise<ScouterJob> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto todavía. Reintentá en un segundo.");
      const cleaned = (input.seeds ?? [])
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean);
      if (cleaned.length === 0) throw new Error("Pasá al menos un @handle.");
      const { data, error } = await sb
        .from("scouter_jobs")
        .insert({
          kind: "discover_seed",
          status: "queued",
          tenant_id: tenantId,
          company_id: input.company_id ?? null,
          payload: { seeds: cleaned, maxLeads: input.maxLeads ?? cleaned.length },
          priority: input.priority ?? 5,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      toast.success("Discovery encolado", {
        description: "El worker lo va a tomar en el próximo tick (~15s).",
      });
    },
    onError: (e) => {
      toast.error("No se pudo encolar el discovery", { description: (e as Error).message });
    },
  });
};

export interface EnqueueDiscoverHashtagInput extends EnqueueJobBase {
  hashtag: string;
  maxLeads?: number;
}

export const useEnqueueDiscoveryHashtag = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: EnqueueDiscoverHashtagInput): Promise<ScouterJob> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto todavía. Reintentá en un segundo.");
      const tag = input.hashtag.trim().replace(/^#/, "");
      if (!tag) throw new Error("Pasá un hashtag.");
      const { data, error } = await sb
        .from("scouter_jobs")
        .insert({
          kind: "discover_hashtag",
          status: "queued",
          tenant_id: tenantId,
          company_id: input.company_id ?? null,
          payload: { hashtag: tag, maxLeads: input.maxLeads ?? 30 },
          priority: input.priority ?? 5,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      toast.success("Hashtag discovery encolado", {
        description: "El worker lo va a tomar en el próximo tick (~15s).",
      });
    },
    onError: (e) => {
      toast.error("No se pudo encolar el hashtag", { description: (e as Error).message });
    },
  });
};

export interface EnqueueScoreLeadInput extends EnqueueJobBase {
  leadId: string;
}

/** Encola un score_lead manual (re-scorear un lead específico). El
 *  flow normal es que discovery enqueue auto este job — usar este
 *  hook solo cuando el supervisor quiere forzar un re-scoring (por
 *  ejemplo después de actualizar el prompt del scorer en el worker). */
export const useEnqueueScoreLead = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: EnqueueScoreLeadInput): Promise<ScouterJob> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto todavía.");
      const { data, error } = await sb
        .from("scouter_jobs")
        .insert({
          kind: "score_lead",
          status: "queued",
          tenant_id: tenantId,
          company_id: input.company_id ?? null,
          payload: { leadId: input.leadId },
          priority: input.priority ?? 7, // por encima de discovery, queremos resultado rápido
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
      toast.success("Re-scoring encolado");
    },
    onError: (e) => {
      toast.error("No se pudo encolar el scoring", { description: (e as Error).message });
    },
  });
};

export interface EnqueueEnrichProfileInput extends EnqueueJobBase {
  leadId: string;
}

/** Refresca followers/bio/etc. de un lead existente sin re-scorearlo. */
export const useEnqueueEnrichProfile = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: EnqueueEnrichProfileInput): Promise<ScouterJob> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto todavía.");
      const { data, error } = await sb
        .from("scouter_jobs")
        .insert({
          kind: "enrich_profile",
          status: "queued",
          tenant_id: tenantId,
          company_id: input.company_id ?? null,
          payload: { leadId: input.leadId },
          priority: input.priority ?? 3,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterJob;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
      toast.success("Refresh de perfil encolado");
    },
    onError: (e) => {
      toast.error("No se pudo encolar el refresh", { description: (e as Error).message });
    },
  });
};

interface ScouterJobsParams {
  status?: JobStatus | JobStatus[];
  kind?: JobKind | JobKind[];
  limit?: number;
}

/** Lista jobs para el panel de monitoreo. Default: últimos 50 sin
 *  filtro. Pasar { status: ["queued", "running"] } para ver lo que
 *  está en curso. */
export const useScouterJobs = (params: ScouterJobsParams = {}) => {
  const { status, kind, limit = 50 } = params;
  return useQuery({
    queryKey: ["scouter-jobs", { status, kind, limit }],
    queryFn: async (): Promise<ScouterJob[]> => {
      let q = sb
        .from("scouter_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (status) {
        q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
      }
      if (kind) {
        q = Array.isArray(kind) ? q.in("kind", kind) : q.eq("kind", kind);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ScouterJob[];
    },
    // Refetch cada 10s mientras la pestaña esté visible — la queue
    // tiene movimiento real cada ~15s del worker poll.
    refetchInterval: 10_000,
  });
};

/** Re-encola un job que quedó en failed. Resetea attempts a 0 para
 *  darle ciclos frescos, mantiene el payload. */
export const useRetryScouterJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string): Promise<void> => {
      const { error } = await sb
        .from("scouter_jobs")
        .update({
          status: "queued",
          attempts: 0,
          last_error: null,
          started_at: null,
          completed_at: null,
        })
        .eq("id", jobId)
        .eq("status", "failed");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      toast.success("Job re-encolado");
    },
    onError: (e) => {
      toast.error("No se pudo re-encolar", { description: (e as Error).message });
    },
  });
};

/** Cancela un job queued (o running zombi). Lo marca como failed con
 *  un last_error explícito para que quede claro que fue cancelado, no
 *  que el worker tiró error. */
export const useCancelScouterJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string): Promise<void> => {
      const { error } = await sb
        .from("scouter_jobs")
        .update({
          status: "failed",
          last_error: "Cancelado por el usuario.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .in("status", ["queued", "running"]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-jobs"] });
      toast.success("Job cancelado");
    },
    onError: (e) => {
      toast.error("No se pudo cancelar", { description: (e as Error).message });
    },
  });
};

// ─── Apify budget · scouter_apify_budget ──────────────────────────────

export interface ScouterApifyBudgetRow {
  day: string;
  est_spend_usd: number;
  runs_count: number;
  items_processed: number;
  tenant_id: string;
  updated_at: string;
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Trae la row del día (default) o de un día específico. Útil para
 *  mostrar un widget "Apify gastado hoy: $X / $10". */
export const useScouterApifyBudget = (day?: string) => {
  const targetDay = day ?? todayIso();
  return useQuery({
    queryKey: ["scouter-apify-budget", targetDay],
    queryFn: async (): Promise<ScouterApifyBudgetRow | null> => {
      const { data, error } = await sb
        .from("scouter_apify_budget")
        .select("*")
        .eq("day", targetDay)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ScouterApifyBudgetRow | null;
    },
    refetchInterval: 30_000,
  });
};

// ─── Notifications · scouter_notifications ────────────────────────────

export interface ScouterNotification {
  id: string;
  kind: "lead_high_fit" | string;
  payload: {
    lead_id?: string;
    instagram_handle?: string;
    score?: number;
    reason?: string;
    [k: string]: unknown;
  };
  tenant_id: string;
  created_at: string;
  /** Computed-side: true si el current user ya marcó como leída. */
  read?: boolean;
}

/** Lee las últimas N notificaciones del tenant + cruza con
 *  scouter_notification_reads para saber cuáles están unread para
 *  el current user. */
export const useScouterNotifications = (limit = 30) =>
  useQuery({
    queryKey: ["scouter-notifications", limit],
    queryFn: async (): Promise<ScouterNotification[]> => {
      const { data: notifs, error } = await sb
        .from("scouter_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const list = (notifs ?? []) as ScouterNotification[];
      if (list.length === 0) return [];

      // Cruzamos con reads del current user. RLS en
      // scouter_notification_reads filtra por user_id = auth.uid()
      // así que solo recibimos las del current user.
      const ids = list.map((n) => n.id);
      const { data: reads, error: readsErr } = await sb
        .from("scouter_notification_reads")
        .select("notification_id")
        .in("notification_id", ids);
      if (readsErr) throw readsErr;
      const readSet = new Set(
        (reads ?? []).map((r) => (r as { notification_id: string }).notification_id),
      );
      return list.map((n) => ({ ...n, read: readSet.has(n.id) }));
    },
    refetchInterval: 20_000,
  });

/** Marca una notificación como leída por el current user. Insert
 *  idempotente — la PK (notification_id, user_id) garantiza un row
 *  por user-notif. */
export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string): Promise<void> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user?.id;
      if (!userId) throw new Error("No hay sesión activa.");
      // tenant_id se autocompletea con el DEFAULT current_tenant_id()
      // en la tabla. user_id explícito porque hace falta para la PK.
      const { error } = await sb
        .from("scouter_notification_reads")
        .upsert(
          { notification_id: notificationId, user_id: userId },
          { onConflict: "notification_id,user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-notifications"] });
    },
  });
};
