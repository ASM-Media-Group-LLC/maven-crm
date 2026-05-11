import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { checkPreviousLead } from "@/lib/lead-validation";

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
  converted_at: string | null;
  converted_to_contact_id: string | null;
  tenant_id: string;
  // Similitud con el seed más parecido de la misma compañía (0-1).
  // Se computa post-scoring vía edge function scouter-embed-leads.
  lookalike_score: number | null;
  lookalike_seed_handle: string | null;
}

export interface CompanySearchConfig {
  hashtags?: string[];
  seed_accounts?: string[];
  followers_min?: number | null;
  followers_max?: number | null;
  content_type?: "adult" | "fitness" | "lifestyle" | "mixed";
  // profile_tier es texto libre — el admin describe en sus palabras qué
  // perfil de creator busca (e.g. "creators que reciben pagos en EUR",
  // "modelos emergentes LATAM", "fitness premium"). Antes era un enum
  // fijo (micro/mid/macro/mega) que forzaba defaults arbitrarios cuando
  // la compañía no segmentaba por tamaño.
  profile_tier?: string | null;
  geo_targets?: string[];
  // Países específicos que la compañía busca. Más granular que
  // geo_targets (que es region como "LATAM" / "US"). Usar los nombres
  // canónicos de @/lib/countries (CANONICAL_COUNTRIES).
  target_countries?: string[];
  bio_keywords?: string[];
  exclude_keywords?: string[];
  scoring_notes?: string;
  ai_generated_at?: string;
}

export interface ScouterCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  search_config: CompanySearchConfig;
  logo_dark_url: string | null;
  logo_light_url: string | null;
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
  // Métricas de outreach derivadas de scouter_interaction_history.
  // contactedDistinct: leads que recibieron al menos una tarea de
  //   comentario completada por el spammer (interaction_type='comment').
  // interested: leads marcados "Se interesó" (status='confirmed').
  // noResponse: leads con primer comentario hace ≥7 días, sin marcar
  //   "se interesó" todavía (status no es 'confirmed' ni 'active').
  contactedDistinct: number;
  interested: number;
  noResponse: number;
}

// The `scouter_*` tables aren't in the generated Supabase types yet —
// cast through unknown so the calls don't need full type plumbing.
const sb = supabase as unknown as { from: (table: string) => any };

export type AiQualityFilter = "approved" | "high_fit" | "scored" | "all";

interface ListParams {
  status?: string | "all";
  limit?: number;
  search?: string;
  favoritesOnly?: boolean;
  /** UUID de la compañía (FK a scouter_companies.id). El filtro
   *  matchea por company_id (FK del discovery owner) O por
   *  target_companies (slugs del array editable, si companySlug también
   *  viene). Esto permite que un lead que reasignaste manualmente desde
   *  el popup aparezca en el filtro de su nueva compañía. */
  company?: string;
  /** Slug de la misma compañía. Se usa en conjunto con `company` para
   *  el OR filter contra target_companies (que guarda slugs, no UUIDs). */
  companySlug?: string;
  country?: string;
  aiQuality?: AiQualityFilter;
  page?: number;
  pageSize?: number;
  /** When true, restrict the result to leads that are assigned to the
   *  current authenticated user via scouter_daily_assignments (any date).
   *  Use this for spammer-role views so they only see "their" models
   *  in Home. Admins/managers leave this off to see the full pool. */
  onlyAssignedToMe?: boolean;
}

export interface ScouterLeadsResult {
  leads: ScouterLead[];
  total: number;
}

export const useScouterLeads = (params: ListParams = {}) => {
  const {
    status = "discovery",
    search = "",
    favoritesOnly = false,
    company,
    companySlug,
    country,
    aiQuality = "approved",
    page = 1,
    pageSize = 60,
    onlyAssignedToMe = false,
  } = params;
  return useQuery({
    queryKey: ["scouter-leads", { status, search, favoritesOnly, company, companySlug, country, aiQuality, page, pageSize, onlyAssignedToMe }],
    queryFn: async (): Promise<ScouterLeadsResult> => {
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
        if (favoriteIds.length === 0) return { leads: [], total: 0 };
      }

      // Spammer view: pre-fetch the lead_ids assigned to me and use them
      // as a narrower id-IN constraint. RLS on scouter_daily_assignments
      // already scopes rows to spammer_id = auth.uid() for spammer users
      // (or shows all to admins), so this is naturally per-user.
      let assignedIds: string[] | null = null;
      if (onlyAssignedToMe) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return { leads: [], total: 0 };
        const { data: assignRows, error: assignErr } = await sb
          .from("scouter_daily_assignments")
          .select("lead_id")
          .eq("spammer_id", user.id);
        if (assignErr) throw assignErr;
        assignedIds = [
          ...new Set(((assignRows ?? []) as { lead_id: string }[]).map((r) => r.lead_id)),
        ];
        if (assignedIds.length === 0) return { leads: [], total: 0 };
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let q = sb
        .from("scouter_leads")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (status !== "all") q = q.eq("status", status);
      // Filtro de compañía: matchea company_id (discovery owner) O
      // target_companies (asignaciones manuales del popup). Si solo
      // viene company sin slug, hacemos eq simple por compat.
      if (company && companySlug) {
        q = q.or(`company_id.eq.${company},target_companies.cs.["${companySlug}"]`);
      } else if (company) {
        q = q.eq("company_id", company);
      }
      // "Sin país" es el bucket sintético para NULL — lo traduce a IS NULL.
      if (country === "Sin país") q = q.is("country", null);
      else if (country) q = q.eq("country", country);

      // AI quality filter
      if (aiQuality === "approved") {
        q = q.in("ai_status", ["high_fit", "medium_fit", "maybe", "approved"]);
      } else if (aiQuality === "high_fit") {
        q = q.eq("ai_status", "high_fit");
      } else if (aiQuality === "scored") {
        q = q.not("ai_status", "is", null);
      }
      // "all" -> no filter

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(
          `instagram_handle.ilike.${term},name.ilike.${term},country.ilike.${term},city.ilike.${term}`,
        );
      }
      if (favoriteIds) q = q.in("id", favoriteIds);
      if (assignedIds) q = q.in("id", assignedIds);

      const { data, error, count } = await q;
      if (error) throw error;
      return { leads: (data ?? []) as ScouterLead[], total: count ?? 0 };
    },
  });
};

/** Returns unique countries with counts for the country filter dropdown.
 *  Pagina en chunks de 1000 para abarcar todos los leads. Incluye una
 *  fila "Sin país" para los NULL.
 *
 *  IMPORTANTE: aplica los mismos filtros que useScouterLeads (status,
 *  aiQuality) — de otro modo el dropdown decía "853 México" pero la
 *  lista solo mostraba 321 porque la lista filtra status=discovery +
 *  AI aprobado por default y el contador no lo hacía.
 */
export const useScouterCountries = (filters: {
  status?: string | "all";
  aiQuality?: AiQualityFilter;
} = {}) => {
  const { status = "discovery", aiQuality = "approved" } = filters;
  return useQuery({
    queryKey: ["scouter-countries", { status, aiQuality }],
    queryFn: async (): Promise<Array<{ country: string; count: number }>> => {
      const CHUNK = 1000;
      const map = new Map<string, number>();
      let nullCount = 0;
      let from = 0;
      // Loop hasta que un chunk vuelva con menos de CHUNK filas → fin.
      // Hard cap a 100 chunks (100k rows) por seguridad.
      for (let i = 0; i < 100; i++) {
        const to = from + CHUNK - 1;
        let q = sb.from("scouter_leads").select("country").range(from, to);
        if (status !== "all") q = q.eq("status", status);
        if (aiQuality === "approved") {
          q = q.in("ai_status", ["high_fit", "medium_fit", "maybe", "approved"]);
        } else if (aiQuality === "high_fit") {
          q = q.eq("ai_status", "high_fit");
        } else if (aiQuality === "scored") {
          q = q.not("ai_status", "is", null);
        }
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as { country: string | null }[];
        for (const row of rows) {
          if (row.country) {
            map.set(row.country, (map.get(row.country) ?? 0) + 1);
          } else {
            nullCount += 1;
          }
        }
        if (rows.length < CHUNK) break;
        from += CHUNK;
      }
      const out = Array.from(map.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count);
      if (nullCount > 0) {
        out.push({ country: "Sin país", count: nullCount });
      }
      return out;
    },
    staleTime: 60_000,
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
    | "bio"
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
    | "target_companies"
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

/** Descartar un lead = mover su handle a scouter_discarded_handles
 *  (blocklist tenant-global) y BORRAR el row de scouter_leads. La idea
 *  es que el discovery del worker chequee la blocklist y no vuelva a
 *  agregar perfiles que el user ya rechazó.
 *
 *  Antes el descarte solo seteaba status='discarded' y dejaba el row
 *  en la tabla, lo cual:
 *    1. Hinchaba el conteo de leads.
 *    2. Dejaba al worker reintentando el upsert (no insert nuevo, pero
 *       igualmente refrescando bio/followers periodicamente).
 *    3. El handle podía aparecer en otra compañía si el user no lo
 *       descartaba ahí también.
 */
export const useDiscardLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      handle,
      tenantId,
    }: {
      id: string;
      handle: string;
      tenantId: string;
    }) => {
      const cleaned = handle.replace(/^@+/, "").toLowerCase().trim();
      if (!cleaned) throw new Error("Handle vacío");
      const { data: { user } } = await supabase.auth.getUser();

      // 1) INSERT en blocklist. ON CONFLICT do nothing — si ya estaba
      //    bloqueado el handle, igual procedemos con el delete.
      const { error: insErr } = await sb
        .from("scouter_discarded_handles")
        .upsert(
          {
            handle: cleaned,
            tenant_id: tenantId,
            discarded_by: user?.id ?? null,
            reason: "user-discard",
          },
          { onConflict: "handle,tenant_id", ignoreDuplicates: true },
        );
      if (insErr) throw insErr;

      // 2) DELETE del lead activo.
      const { error: delErr } = await sb
        .from("scouter_leads")
        .delete()
        .eq("id", id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
      qc.invalidateQueries({ queryKey: ["scouter-stats"] });
      qc.invalidateQueries({ queryKey: ["scouter-countries"] });
    },
    onError: (e) => {
      toast.error("No se pudo descartar", { description: (e as Error).message });
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
        // Para byStatus + cross-reference con interactions traemos id y
        // status de cada lead. 5k cubre el pool actual; si crece sube.
        { data: leadRows },
        // Cada fila = una tarea de comentario completada por un spammer.
        // Agregamos client-side para sacar contactedDistinct +
        // first_comment_at por lead.
        { data: commentInteractions },
      ] = await Promise.all([
        head((q: any) => q.gte("created_at", since24h)),
        head((q: any) => q.gte("created_at", since7d)),
        head((q: any) => q.gte("created_at", since30d)),
        head((q: any) => q.gte("created_at", since7d).eq("ai_status", "high_fit")),
        head((q: any) => q.is("ai_status", null)),
        head((q: any) => q),
        sb.from("scouter_leads").select("id, status").limit(5000),
        sb
          .from("scouter_interaction_history")
          .select("lead_id, created_at")
          .eq("interaction_type", "comment")
          .order("created_at", { ascending: true })
          .limit(10000),
      ]);

      const byStatus: Record<string, number> = {};
      const statusByLead = new Map<string, string>();
      for (const row of (leadRows ?? []) as { id: string; status: string }[]) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        statusByLead.set(row.id, row.status);
      }

      // Primer comentario por lead — order asc + map sólo guarda el primero.
      const firstCommentByLead = new Map<string, string>();
      for (const row of (commentInteractions ?? []) as {
        lead_id: string;
        created_at: string;
      }[]) {
        if (!firstCommentByLead.has(row.lead_id)) {
          firstCommentByLead.set(row.lead_id, row.created_at);
        }
      }

      const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
      let noResponseCount = 0;
      for (const [leadId, firstAt] of firstCommentByLead) {
        const firstAtMs = Date.parse(firstAt);
        if (Number.isNaN(firstAtMs) || firstAtMs > sevenDaysAgo) continue;
        const status = statusByLead.get(leadId);
        // No responde = contactado hace ≥7 días y nunca marcado como
        // "se interesó" (confirmed) ni convertido a active.
        if (status !== "confirmed" && status !== "active") {
          noResponseCount += 1;
        }
      }

      return {
        discovered24h: discovered24h ?? 0,
        discovered7d: discovered7d ?? 0,
        discovered30d: discovered30d ?? 0,
        highFit7d: highFit7d ?? 0,
        pendingAi: pendingAi ?? 0,
        byStatus,
        total: total ?? 0,
        contactedDistinct: firstCommentByLead.size,
        interested: byStatus["confirmed"] ?? 0,
        noResponse: noResponseCount,
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

/** Fetch ALL companies (including inactive) for the settings panel. */
export const useScouterCompaniesAll = () =>
  useQuery({
    queryKey: ["scouter-companies-all"],
    queryFn: async (): Promise<ScouterCompany[]> => {
      const { data, error } = await sb
        .from("scouter_companies")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScouterCompany[];
    },
  });

export type CompanyInput = {
  slug: string;
  name: string;
  description?: string | null;
  active?: boolean;
  search_config?: CompanySearchConfig;
  logo_dark_url?: string | null;
  logo_light_url?: string | null;
};

export const useCreateCompany = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: CompanyInput): Promise<ScouterCompany> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto.");
      const { data, error } = await sb
        .from("scouter_companies")
        .insert({
          slug: input.slug,
          name: input.name,
          description: input.description ?? null,
          active: input.active ?? true,
          search_config: input.search_config ?? {},
          logo_dark_url: input.logo_dark_url ?? null,
          logo_light_url: input.logo_light_url ?? null,
          tenant_id: tenantId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterCompany;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-companies"] });
      qc.invalidateQueries({ queryKey: ["scouter-companies-all"] });
      toast.success("Compañía creada");
    },
    onError: (e) => toast.error("Error al crear compañía", { description: (e as Error).message }),
  });
};

export const useUpdateCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CompanyInput> & { id: string }): Promise<ScouterCompany> => {
      const { data, error } = await sb
        .from("scouter_companies")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterCompany;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-companies"] });
      qc.invalidateQueries({ queryKey: ["scouter-companies-all"] });
      toast.success("Compañía actualizada");
    },
    onError: (e) => toast.error("Error al actualizar", { description: (e as Error).message }),
  });
};

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

// Manual lead creation — bypassa el discovery scrape pipeline para casos
// donde el supervisor ya conoce el handle y quiere meterlo directo a la
// tabla. El lead queda con status='discovery' y ai_status=null para que
// el worker (cuando esté corriendo) lo levante con un score_lead job y
// le asigne ai_score / ai_status. Si el worker no está corriendo, el lead
// igual aparece en Leads tab con prefilter_score=0 y se puede aprobar
// manualmente desde el drawer.
export interface ManualLeadInput {
  instagram_handle: string;
  full_name?: string | null;
  bio?: string | null;
  country?: string | null;
  followers?: number | null;
  company_id: string;
  notes?: string | null;
}

export const useCreateLeadManual = () => {
  const qc = useQueryClient();
  const tenantQ = useCurrentTenantId();
  return useMutation({
    mutationFn: async (input: ManualLeadInput): Promise<ScouterLead> => {
      const tenantId = tenantQ.data;
      if (!tenantId) throw new Error("Tenant no resuelto. Reintentá en un segundo.");
      const handle = input.instagram_handle.trim().replace(/^@/, "").toLowerCase();
      if (!handle) throw new Error("Pasá un @handle.");
      if (!input.company_id) throw new Error("Seleccioná una compañía.");

      // Cross-system dedup contra Lead Gen. (No bloqueamos cross-company
      // dentro de Scouter — un mismo modelo puede calificar legítimamente
      // para varias compañías porque son productos distintos. La UNIQUE
      // per-company en DB ya cubre el caso mismo-handle + misma-compañía
      // con un mensaje friendly más abajo.)
      const leadgenCheck = await checkPreviousLead(handle);
      if (leadgenCheck.existed) {
        const date = leadgenCheck.lastEntryDate?.slice(0, 10) ?? "?";
        const agent = leadgenCheck.lastAgentName ? ` por ${leadgenCheck.lastAgentName}` : "";
        throw new Error(
          `Ya existe @${handle} en Lead Gen (cargado el ${date}${agent}). No se puede duplicar.`,
        );
      }

      const { data, error } = await sb
        .from("scouter_leads")
        .insert({
          tenant_id: tenantId,
          company_id: input.company_id,
          instagram_handle: handle,
          full_name: input.full_name?.trim() || null,
          bio: input.bio?.trim() || null,
          country: input.country?.trim() || null,
          followers: input.followers ?? null,
          notes: input.notes?.trim() || null,
          status: "discovery",
          discovery_source: "manual",
          ai_status: null, // queda pendiente — el worker lo scoreará
          prefilter_score: 0,
        })
        .select("*")
        .single();
      if (error) {
        // Friendly mensaje cuando hay duplicado (UNIQUE company_id+handle).
        if ((error.code === "23505") || /duplicate|unique/i.test(error.message)) {
          throw new Error(`Ya existe un lead @${handle} para esta compañía.`);
        }
        throw error;
      }
      return data as ScouterLead;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-leads"] });
      qc.invalidateQueries({ queryKey: ["scouter-stats"] });
      toast.success("Lead agregado", {
        description: "Pendiente de score IA — quedará en Leads → Discovery.",
      });
    },
    onError: (e) => {
      toast.error("No se pudo agregar el lead", { description: (e as Error).message });
    },
  });
};

interface ScouterJobsParams {
  status?: JobStatus | JobStatus[];
  kind?: JobKind | JobKind[];
  limit?: number;
  /** Override refetch interval (ms). Default 10_000. */
  refetchInterval?: number;
}

/** Lista jobs para el panel de monitoreo. Default: últimos 50 sin
 *  filtro. Pasar { status: ["queued", "running"] } para ver lo que
 *  está en curso. */
export const useScouterJobs = (params: ScouterJobsParams = {}) => {
  const { status, kind, limit = 50, refetchInterval: customInterval } = params;
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
    refetchInterval: customInterval ?? 10_000,
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
