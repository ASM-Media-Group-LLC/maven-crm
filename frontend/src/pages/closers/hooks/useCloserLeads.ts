import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaginate";
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
  close_reason_code: string | null;
  confirmed_date: string | null;
  completed_date: string | null;
  last_contact_date: string | null;
  monthly_monetization: number | null;
  main_platform: string | null;
  extras: number | null;
  // Tipo de deal: 'reclutamiento' (comisión % sobre OF) | 'venta_plataforma'
  // (creadora existente que paga una suscripción mensual fija).
  deal_type: string;
  subscription_amount: number | null;
  created_at: string;
  updated_at: string;
  leadgen_entry_id: string | null;
  source_contact_id: string | null;
  // Joined fields
  agent_name: string | null;
  contact_count: number;
  // Resolved WhatsApp phone (with country code)
  resolved_whatsapp_phone: string | null;
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
};

export const TAB_STAGE_MAP: Record<string, string[]> = {
  todas: [],
  ventas: [],
  antiguos: ["Nuevo"],
  nuevo: ["Nuevo"],
  asignadas: ["Asignada"],
  confirmadas: ["Confirmada"],
  completadas: ["Completada"],
  no_interesadas: ["No interesada"],
};

export const PLATFORMS = ["OnlyFans", "Trafix", "Blu", "Piclink", "Content Protector", "ORA", "Let's Shoot", "Otra"] as const;
export const SALE_PLATFORMS = ["Trafix", "Blu", "Piclink", "Content Protector", "ORA", "Let's Shoot"] as const;
export const CHANNELS = ["Instagram", "WhatsApp", "Telegram"] as const;
export const RESULTS = ["Contestó", "No contestó", "Interesada", "No interesada", "Pendiente"] as const;

// Motivo estructurado al cerrar un lead (stage → "No interesada"). El code se
// guarda en closer_creators.close_reason_code; el detalle libre sigue en
// rejection_reason. Alimenta el embudo de reclutamiento (drop-off por motivo).
export const CLOSE_REASONS: { code: string; label: string }[] = [
  { code: "no_factura_of", label: "No factura en OnlyFans" },
  { code: "categoria_baja", label: "No cumple requisitos / categoría baja" },
  { code: "dejo_de_responder", label: "Dejó de responder" },
  { code: "sin_whatsapp", label: "Número sin WhatsApp / inválido" },
  { code: "ya_con_agencia", label: "Ya trabaja con otra agencia" },
  { code: "no_interesada", label: "No le interesa" },
  { code: "otro", label: "Otro (ver detalle)" },
];
export const CLOSE_REASON_LABELS: Record<string, string> = Object.fromEntries(
  CLOSE_REASONS.map((r) => [r.code, r.label]),
);

// Cadencia de contactos: días desde passed_date donde el closer debe
// haber realizado cada contacto. Espejada en SQL en la función
// public.check_closer_contact_alerts() — si cambia, actualizar ambos.
const CONTACT_SEQUENCE = [1, 3, 5, 8, 15, 29];

export const getNextContactDate = (passedDate: string | null, contactCount: number): Date | null => {
  if (!passedDate || contactCount >= 6) return null;
  const base = new Date(passedDate);
  const dayOffset = CONTACT_SEQUENCE[contactCount] || 29;
  const next = new Date(base);
  next.setDate(next.getDate() + dayOffset);
  return next;
};

// Devuelve true si el próximo contacto de la cadencia ya venció.
// Definición: deadline = medianoche al final del día N (passed_date + N).
// Pasada esa medianoche (current_date > passed_date + N), está vencido.
// Mismo cálculo que el SQL cron — ver migration 20260516170000.
export const isContactOverdue = (
  passedDate: string | null,
  contactCount: number,
): boolean => {
  if (!passedDate || contactCount >= 6) return false;
  const next = getNextContactDate(passedDate, contactCount);
  if (!next) return false;
  // current_date > deadline_date (comparación de fechas, ignorando hora)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(next);
  deadline.setHours(0, 0, 0, 0);
  return today > deadline;
};

// Devuelve true si el closer ya hizo los 6 contactos y la lead sigue
// en stage='Asignada' — necesita decidir: seguir o marcar No interesada.
export const needsContactDecision = (
  stage: string | null,
  contactCount: number,
): boolean => {
  return stage === "Asignada" && contactCount >= 6;
};

// DEPRECATED — kept for backward compat. Use isContactOverdue.
// La lógica anterior (`> 3 días desde último contacto`) no respetaba
// la cadencia real y disparaba falsos positivos.
export const isFollowUpPending = (lastContactDate: string | null): boolean => {
  if (!lastContactDate) return true;
  const diff = Date.now() - new Date(lastContactDate).getTime();
  return diff > 3 * 24 * 60 * 60 * 1000;
};

export type DateFieldType = "passed_date" | "lg_entry_date";

/** Resolve a WhatsApp-ready phone number: prefer E.164 from phone field, fallback to source contact */
const resolveWhatsAppPhone = (
  phone: string | null,
  sourceContactId: string | null,
  sourceContactMap: Record<string, { country_code: string | null; phone: string | null }>
): string | null => {
  // If phone already starts with '+', it's international
  if (phone && phone.startsWith("+")) return phone;
  // Try source contact
  if (sourceContactId && sourceContactMap[sourceContactId]) {
    const sc = sourceContactMap[sourceContactId];
    if (sc.country_code && sc.phone) return `${sc.country_code}${sc.phone}`;
    if (sc.phone && sc.phone.startsWith("+")) return sc.phone;
  }
  // Raw phone without '+' — can't guarantee it works for wa.me
  return null;
};

const PAGE_SIZE = 50;

export const useCloserLeads = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isManager, isSupervisor, role } = useUserRole();

  const [search, setSearch] = useState("");
  // Valor "debounced" del buscador: la query solo se dispara cuando el
  // usuario deja de escribir (~350ms). Sin esto, cada tecla cambiaba el
  // queryKey → un fetch por pulsación + el prefetch ×7 de las otras tabs.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState("todas");
  const [page, setPage] = useState(0);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateField, setDateField] = useState<DateFieldType>("passed_date");
  // viewAsCloserId — feature admin: ver el módulo "como" otro closer.
  // Cuando está seteado, las queries filtran assigned_to = viewAsCloserId
  // y desactivan los privilegios de admin/manager para que el resultado
  // sea exactamente lo que ese closer ve.
  const [viewAsCloserId, setViewAsCloserId] = useState<string | null>(null);
  const [viewAsCloserName, setViewAsCloserName] = useState<string | null>(null);

  // Cuando el admin está impersonando a un closer, los filtros server-side
  // deben tratarlo como NO-admin y forzar el assigned_to a su id.
  const effectiveIsAdmin = viewAsCloserId ? false : isAdmin;
  const effectiveIsManager = viewAsCloserId ? false : isManager;
  const effectiveIsSupervisor = viewAsCloserId ? false : isSupervisor;
  const effectiveUserId = viewAsCloserId ?? user?.id;
  // "Ve TODO el pipeline" = admin/manager/supervisor (incluye Team Leader, que es
  // supervisor_or_above). Espeja la RLS "Supervisors+ view all closer_creators".
  // Cuando impersona (viewAsCloserId) queda false → ve exactamente lo del closer.
  const canSeeAll = effectiveIsAdmin || effectiveIsManager || effectiveIsSupervisor;

  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(0); };
  const handleSetSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleSetAgentFilter = (v: string | null) => { setAgentFilter(v); setPage(0); };
  const handleSetPlatformFilter = (v: string | null) => { setPlatformFilter(v); setPage(0); };
  const handleSetDateFrom = (v: Date | undefined) => { setDateFrom(v); setPage(0); };
  const handleSetDateTo = (v: Date | undefined) => { setDateTo(v); setPage(0); };

  // Debounce del término de búsqueda (~350ms) antes de tocar la red.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(t);
  }, [search]);

  // Normalize search for server-side filtering (sobre el valor debounced)
  const normalizedSearch = debouncedSearch ? normalizeHandle(debouncedSearch) : "";

  // Extraído como función con `tab` + `pageNum` parametrizados para poder
  // prefetchear las otras tabs cuando se monta el componente — así al
  // cambiar de tab los datos ya están en caché y no se ve el skeleton.
  const fetchCreatorsForTab = async (tab: string, pageNum: number) => {
      // ── Nuevo / Antiguos: pool de leads SIN asignar (stage 'Nuevo') ──
      // Partido por antigüedad: "Nuevo" = creados en los últimos 30 días;
      // "Antiguos" = hace más de 30 días sin que nadie los asigne. Ambos
      // exigen assigned_to NULL (el pool). Los closers ahora pueden leer
      // este pool (policy RLS "Closers can view unassigned pool"); antes
      // RLS lo ocultaba y la pestaña salía vacía.
      if (tab === "nuevo" || tab === "antiguos") {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        let query = supabase
          .from("closer_creators")
          .select("*", { count: "exact" })
          .eq("stage", "Nuevo")
          .is("assigned_to", null);

        // Antigüedad: Nuevo = recientes (≤30d), Antiguos = viejos (>30d)
        query = tab === "nuevo"
          ? query.gte("created_at", cutoff)
          : query.lt("created_at", cutoff);

        // Server-side search filter
        if (normalizedSearch) {
          query = query.ilike("instagram_handle", `%${normalizedSearch}%`);
        }

        query = query.order("created_at", { ascending: false });

        if (dateFrom && dateTo) {
          const fromStr = dateFrom.toISOString().split("T")[0];
          const toStr = dateTo.toISOString().split("T")[0];
          query = query.gte("created_at", fromStr).lte("created_at", toStr);
        }

        const from = pageNum * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        const rawRows = (data || []) as any[];

        // Fetch created_by profiles and source contacts in parallel
        const createdByIds = [...new Set(rawRows.map((c) => c.created_by).filter(Boolean))] as string[];
        const sourceContactIds = [...new Set(rawRows.map((c: any) => c.source_contact_id).filter(Boolean))] as string[];

        const [profilesRes, sourceContactsRes] = await Promise.all([
          createdByIds.length > 0
            ? supabase.from("profiles").select("id, full_name").in("id", createdByIds)
            : Promise.resolve({ data: [] }),
          sourceContactIds.length > 0
            ? supabase.from("v_closers_contacts").select("id, country_code, phone").in("id", sourceContactIds)
            : Promise.resolve({ data: [] }),
        ]);

        let createdByMap: Record<string, string> = {};
        for (const p of profilesRes.data || []) {
          createdByMap[(p as any).id] = (p as any).full_name || "Sin nombre";
        }

        const sourceContactMap: Record<string, { country_code: string | null; phone: string | null }> = {};
        for (const sc of sourceContactsRes.data || []) {
          sourceContactMap[(sc as any).id] = { country_code: (sc as any).country_code, phone: (sc as any).phone };
        }

        const rows: CloserCreatorRow[] = rawRows.map((c: any) => ({
          ...c,
          leadgen_entry_id: c.leadgen_entry_id ?? null,
          estimated_monetization: c.estimated_monetization ?? 0,
          agency_commission: c.agency_commission ?? 0,
          extras: c.extras ?? 0,
          main_platform: c.main_platform ?? null,
          agent_name: c.created_by ? (createdByMap[c.created_by] || null) : null,
          contact_count: 0,
          source_contact_id: c.source_contact_id ?? null,
          resolved_whatsapp_phone: resolveWhatsAppPhone(c.phone, c.source_contact_id, sourceContactMap),
          _source: "closer" as const,
          _lg_status: null,
        }));

        return { creators: rows, total: count || 0 };
      }

      // ── All other tabs: fetch from closer_creators ──
      const stageFilter = TAB_STAGE_MAP[tab] || [];

      let query = supabase
        .from("closer_creators")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (stageFilter.length === 1) {
        query = query.eq("stage", stageFilter[0]);
      } else if (stageFilter.length > 1) {
        query = query.in("stage", stageFilter);
      }

      // Tab "Ventas": deals de venta de plataforma a creadoras (cross-stage).
      if (tab === "ventas") {
        query = query.eq("deal_type", "venta_plataforma");
      }

      // Server-side search filter
      if (normalizedSearch) {
        query = query.ilike("instagram_handle", `%${normalizedSearch}%`);
      }

      // Server-side agent filter
      if (agentFilter) {
        query = query.eq("assigned_to", agentFilter);
      }

      // Server-side platform filter
      if (platformFilter) {
        query = query.eq("main_platform", platformFilter);
      }

      // Role-based filter: closers only see assigned. Si el admin está
      // viendo "como" un closer (viewAsCloserId), también restringimos.
      if (!canSeeAll && effectiveUserId) {
        query = query.eq("assigned_to", effectiveUserId);
      }

      // Date filter server-side for passed_date
      if (dateFrom && dateTo && dateField === "passed_date") {
        const fromStr = dateFrom.toISOString().split("T")[0];
        const toStr = dateTo.toISOString().split("T")[0];
        query = query.gte("passed_date", fromStr).lte("passed_date", toStr);
      }

      const from = pageNum * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const closerRows = (data || []) as any[];

      // Fetch profiles, contact counts, and source contacts in parallel
      const agentIds = [...new Set(closerRows.map((c) => c.assigned_to).filter(Boolean))] as string[];
      const creatorIds = closerRows.map((c) => c.id);
      const sourceContactIds = [...new Set(closerRows.map((c: any) => c.source_contact_id).filter(Boolean))] as string[];

      const [profilesResult, contactsResult, sourceContactsResult] = await Promise.all([
        agentIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", agentIds)
          : Promise.resolve({ data: [] }),
        creatorIds.length > 0
          ? supabase.from("closer_contact_history").select("creator_id").in("creator_id", creatorIds)
          : Promise.resolve({ data: [] }),
        sourceContactIds.length > 0
          ? supabase.from("v_closers_contacts").select("id, country_code, phone").in("id", sourceContactIds)
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

      const sourceContactMap: Record<string, { country_code: string | null; phone: string | null }> = {};
      for (const sc of sourceContactsResult.data || []) {
        sourceContactMap[(sc as any).id] = { country_code: (sc as any).country_code, phone: (sc as any).phone };
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
        source_contact_id: c.source_contact_id ?? null,
        resolved_whatsapp_phone: resolveWhatsAppPhone(c.phone, c.source_contact_id, sourceContactMap),
        _source: "closer" as const,
        _lg_status: null,
      }));

      return { creators: enriched, total: count || 0 };
  };

  const buildCreatorsListKey = (tab: string, pageNum: number) =>
    ["closer-creators-list", tab, pageNum, user?.id, role, dateFrom?.toISOString(), dateTo?.toISOString(), dateField, normalizedSearch, agentFilter, platformFilter, viewAsCloserId] as const;

  const { data: creatorsData, isLoading } = useQuery({
    queryKey: buildCreatorsListKey(activeTab, page),
    queryFn: () => fetchCreatorsForTab(activeTab, page),
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  // Prefetch las demás tabs en segundo plano para que al cambiar
  // de tab los datos ya estén en caché — elimina el flash de loading
  // en el primer ingreso a cada tab. Se reactiva cuando cambian filtros.
  useEffect(() => {
    if (!user?.id || !role) return;
    // No prefetchear las otras tabs mientras hay búsqueda activa: cada tab
    // repetiría el ilike + count exact sobre toda la tabla en cada tecla.
    // El prefetch solo tiene sentido para navegar entre tabs sin filtro.
    if (normalizedSearch) return;
    const otherTabs = Object.keys(TAB_STAGE_MAP).filter((t) => t !== activeTab);
    for (const t of otherTabs) {
      queryClient.prefetchQuery({
        queryKey: buildCreatorsListKey(t, 0),
        queryFn: () => fetchCreatorsForTab(t, 0),
        staleTime: 30_000,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, activeTab, dateFrom, dateTo, dateField, normalizedSearch, agentFilter, platformFilter, viewAsCloserId]);

  const creators = creatorsData?.creators || [];
  const totalCount = creatorsData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Los 4 queries de KPI respetan dateFrom/dateTo cuando dateField =
  // "passed_date" — match con lo que hace el listado de Operaciones.
  // Para closer_creators filtramos por passed_date (la fecha de paso).
  // Para closer_platform_sales filtramos por created_at (la única
  // columna de fecha que tiene la tabla de ventas).
  const dateFromStr = dateFrom?.toISOString();
  const dateToStr = dateTo?.toISOString();
  const applyCreatorDate = dateField === "passed_date" && !!dateFrom && !!dateTo;
  const applySalesDate = !!dateFrom && !!dateTo;

  // Conteo de alertas en Asignaciones: cuántas leads están vencidas
  // (contacto programado pasó la fecha) y cuántas en decisión pendiente
  // (6 contactos hechos, stage='Asignada'). Filtrado por closer si el
  // user no es admin/manager. Se usa para el dot rojo en el tab.
  const { data: alertCounts = { overdue: 0, decision: 0 } } = useQuery({
    queryKey: ["closer-alert-counts", user?.id, role, viewAsCloserId],
    queryFn: async () => {
      const targetUserId = effectiveUserId;
      let creatorsQ = supabase
        .from("closer_creators")
        .select("id, passed_date, assigned_to")
        .eq("stage", "Asignada")
        .not("passed_date", "is", null);
      if (!canSeeAll && targetUserId) {
        creatorsQ = creatorsQ.eq("assigned_to", targetUserId);
      } else if (viewAsCloserId) {
        // Admin viendo como un closer específico
        creatorsQ = creatorsQ.eq("assigned_to", viewAsCloserId);
      }
      const { data: asignadas, error } = await creatorsQ;
      if (error) throw error;
      const ids = (asignadas || []).map((r) => (r as any).id as string);
      if (ids.length === 0) return { overdue: 0, decision: 0 };

      const { data: history } = await supabase
        .from("closer_contact_history")
        .select("creator_id")
        .in("creator_id", ids);
      const contactCountByLead: Record<string, number> = {};
      for (const h of (history || []) as Array<{ creator_id: string }>) {
        contactCountByLead[h.creator_id] = (contactCountByLead[h.creator_id] || 0) + 1;
      }

      let overdue = 0;
      let decision = 0;
      for (const r of (asignadas || []) as Array<{ id: string; passed_date: string | null }>) {
        const count = contactCountByLead[r.id] || 0;
        if (needsContactDecision("Asignada", count)) {
          decision++;
        } else if (isContactOverdue(r.passed_date, count)) {
          overdue++;
        }
      }
      return { overdue, decision };
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
    refetchInterval: 60_000, // refresh cada minuto — el cron crea
    // notificaciones cada 3h pero el visual local se actualiza más rápido
  });

  // Status counts for KPIs — client-side count para soportar date filter.
  // La RPC get_closer_stage_counts no acepta fechas, así que contamos
  // acá, PAGINADO (closer_creators ya pasa las 1000 filas del cap PostgREST).
  const { data: statusCounts = {} } = useQuery({
    queryKey: ["closer-creators-counts", "v2", user?.id, role, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      // (A) Conteos por stage "real" — respeta el rol (closer = solo sus
      // asignadas) y el rango de fecha sobre passed_date, igual que el
      // listado de Operaciones.
      // Paginado: PostgREST corta en 1000 filas. closer_creators ya supera ese
      // techo (>2500), así que sin paginar los conteos por stage (No interesada,
      // etc.) quedaban truncados a ~1000. fetchAllRows trae TODAS con .range().
      const rows = await fetchAllRows((from, to) => {
        let q = supabase.from("closer_creators").select("stage, deal_type");
        if (!canSeeAll && effectiveUserId) {
          q = q.eq("assigned_to", effectiveUserId);
        }
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        return q.order("id", { ascending: true }).range(from, to);
      });
      const counts: Record<string, number> = {};
      for (const row of rows as Array<{ stage: string | null; deal_type: string | null }>) {
        const s = row.stage || "Sin stage";
        counts[s] = (counts[s] || 0) + 1;
        if (row.deal_type === "venta_plataforma") counts["ventas"] = (counts["ventas"] || 0) + 1;
      }
      // (B) Pool SIN asignar partido por antigüedad (Nuevo ≤30d / Antiguos
      // >30d). Va aparte de (A) porque NO se filtra por assigned_to (todos
      // ven el pool, incluido el closer tras la policy RLS) ni por el rango
      // de passed_date (los 'Nuevo' no tienen passed_date). head:true =
      // solo cuenta, no transfiere filas. Sobrescribe Nuevo/Antiguos de (A).
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [recentRes, oldRes] = await Promise.all([
        supabase.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("stage", "Nuevo").is("assigned_to", null).gte("created_at", cutoff),
        supabase.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("stage", "Nuevo").is("assigned_to", null).lt("created_at", cutoff),
      ]);
      counts["Nuevo"] = recentRes.count || 0;
      counts["Antiguos"] = oldRes.count || 0;
      return counts;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Revenue by platform
  const { data: platformRevenue = {} } = useQuery({
    queryKey: ["closer-platform-revenue", user?.id, role, applySalesDate ? dateFromStr : null, applySalesDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      // Si estamos viendo "como" un closer, embebemos la FK a
      // closer_creators y filtramos por assigned_to. Sino, query simple.
      let q = viewAsCloserId
        ? supabase
            .from("closer_platform_sales")
            .select("platform, price, created_at, closer_creators!inner(assigned_to)")
            .eq("closer_creators.assigned_to", viewAsCloserId)
        : supabase.from("closer_platform_sales").select("platform, price, created_at");
      if (applySalesDate) {
        q = q.gte("created_at", dateFrom!.toISOString()).lte("created_at", dateTo!.toISOString());
      }
      const { data, error } = await q;
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
    queryKey: ["closer-of-monetization", user?.id, role, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = supabase
        .from("closer_creators")
        .select("estimated_monetization, passed_date")
        .in("stage", ["Completada", "Confirmada"]);
      if (!canSeeAll && effectiveUserId) {
        q = q.eq("assigned_to", effectiveUserId);
      }
      if (applyCreatorDate) {
        const fromStr = dateFrom!.toISOString().split("T")[0];
        const toStr = dateTo!.toISOString().split("T")[0];
        q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).reduce((s, r) => s + Number(r.estimated_monetization || 0), 0);
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Ingreso por SUSCRIPCIÓN — deals de venta de plataforma a creadoras
  // existentes (deal_type='venta_plataforma'): monto MENSUAL fijo, sin
  // comisión %. Bucket separado del revenue de reclutamiento (OF × %).
  const { data: subscriptionRevenueTotal = 0 } = useQuery({
    queryKey: ["closer-subscription-revenue", user?.id, role, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = supabase
        .from("closer_creators")
        .select("subscription_amount, passed_date")
        .eq("deal_type", "venta_plataforma")
        .in("stage", ["Completada", "Confirmada"]);
      if (!canSeeAll && effectiveUserId) {
        q = q.eq("assigned_to", effectiveUserId);
      }
      if (applyCreatorDate) {
        const fromStr = dateFrom!.toISOString().split("T")[0];
        const toStr = dateTo!.toISOString().split("T")[0];
        q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).reduce((s, r) => s + Number((r as any).subscription_amount || 0), 0);
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Platform sales grouped by creator (for completadas badges)
  const { data: platformSalesByCreator = {} } = useQuery({
    queryKey: ["closer-platform-sales-all", user?.id, role, applySalesDate ? dateFromStr : null, applySalesDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = viewAsCloserId
        ? supabase
            .from("closer_platform_sales")
            .select("creator_id, platform, price, created_at, closer_creators!inner(assigned_to)")
            .eq("closer_creators.assigned_to", viewAsCloserId)
        : supabase.from("closer_platform_sales").select("creator_id, platform, price, created_at");
      if (applySalesDate) {
        q = q.gte("created_at", dateFrom!.toISOString()).lte("created_at", dateTo!.toISOString());
      }
      const { data, error } = await q;
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

  // Optimistic update
  const optimisticUpdate = (id: string, updates: Partial<CloserCreatorRow>) => {
    queryClient.setQueryData(
      buildCreatorsListKey(activeTab, page),
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
      // BUG-FIX 2026-05-16: passed_date no se estaba seteando cuando una
      // lead pasaba a "Asignada", entonces el reporte de closers contaba
      // 0 asignadas en cualquier rango. Ahora se setea igual que
      // confirmed_date/completed_date al cambiar de stage.
      if (stage === "Asignada") {
        updates.passed_date = new Date().toISOString().slice(0, 10);
        // Reactivación: limpiar las marcas del stage cerrado (No interesada) para que el
        // lead vuelva "limpio" y no cuente como evento de cierre en reportes ni arrastre
        // el motivo viejo. (En Confirmada/Completada estos campos ya son null → no afecta.)
        updates.no_interesada_date = null;
        updates.close_reason_code = null;
        updates.rejection_reason = null;
      }
      if (stage === "Confirmada") updates.confirmed_date = new Date().toISOString();
      if (stage === "Completada") updates.completed_date = new Date().toISOString();
      // No interesada también es transición — necesitamos la fecha para
      // que el reporte de closers la cuente como evento del período.
      // Columna `no_interesada_date` agregada en migration 20260520010000.
      if (stage === "No interesada") updates.no_interesada_date = new Date().toISOString();
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
      if (current?.stage === "Nuevo") {
        updates.stage = "Asignada";
        // Setear passed_date al pasar de Nuevo → Asignada para que el
        // reporte de closers cuente correctamente las asignaciones en
        // el rango (mismo patrón que confirmed_date/completed_date).
        updates.passed_date = new Date().toISOString().slice(0, 10);
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

  // Tomar (auto-asignarse) un lead del pool sin asignar. Claim atómico: el
  // filtro .is("assigned_to", null) + la policy RLS "Closers can claim
  // unassigned pool" garantizan que solo se tome lo que sigue sin dueño; si
  // otro la tomó primero, el UPDATE matchea 0 filas → avisamos.
  const claimLead = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!user?.id) throw new Error("No hay usuario autenticado");
      const { data, error } = await supabase
        .from("closer_creators")
        .update({
          assigned_to: user.id,
          stage: "Asignada",
          passed_date: new Date().toISOString().slice(0, 10),
        })
        .eq("id", id)
        .is("assigned_to", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Esta lead ya fue tomada por otra persona.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: "Lead tomada", description: "Quedó asignada a vos, en Asignaciones." });
    },
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: "No se pudo tomar", description: e.message, variant: "destructive" });
    },
  });

  return {
    creators,
    isLoading,
    statusCounts,
    alertCounts,
    platformRevenue,
    platformSalesByCreator,
    ofMonetizationTotal,
    subscriptionRevenueTotal,
    totalCount,
    totalPages,
    page, setPage,
    search, setSearch: handleSetSearch,
    activeTab, setActiveTab: handleTabChange,
    agentFilter, setAgentFilter: handleSetAgentFilter,
    platformFilter, setPlatformFilter: handleSetPlatformFilter,
    agentList,
    dateFrom, setDateFrom: handleSetDateFrom,
    dateTo, setDateTo: handleSetDateTo,
    dateField, setDateField,
    updateField,
    updateStage,
    assignCreator,
    claimLead,
    isAdmin,
    isManager,
    isSupervisor,
    viewAsCloserId,
    viewAsCloserName,
    setViewAsCloser: (id: string | null, name: string | null) => {
      setViewAsCloserId(id);
      setViewAsCloserName(name);
      setPage(0);
    },
  };
};
