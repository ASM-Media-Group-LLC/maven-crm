import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { normalizeHandle } from "@/lib/handle-utils";
import { celebrateClose } from "@/lib/celebrateClose";

export interface ContactNote {
  contact_date: string;
  channel: string | null;
  notes: string | null;
}

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
  // De qué base viene el lead: 'maven' (LeadGen/Contactos, default) |
  // 'ex_creadora' (base EX MODELOS KASH) | 'agencia' (base B2B de agencias).
  lead_source: string | null;
  subscription_amount: number | null;
  created_at: string;
  updated_at: string;
  leadgen_entry_id: string | null;
  source_contact_id: string | null;
  // Joined fields
  agent_name: string | null;
  contact_count: number;
  // Notas por contacto (de closer_contact_history), ordenadas por fecha.
  contact_notes: ContactNote[];
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
  // Bases propias: cruzan todos los stages, filtran por lead_source.
  ex_creadores: [],
  agencias: [],
};

// Tabs que son una BASE de leads (vista por origen) en vez de un stage.
export const SOURCE_TABS: Record<string, string> = {
  ex_creadores: "ex_creadora",
  agencias: "agencia",
};

// Las agencias son otra LÍNEA DE NEGOCIO (B2B: se les vende producto, no se
// recluta a una modelo). Se excluyen de los tabs del embudo de modelos para no
// ensuciar sus conteos ni el pool; viven sólo en su propio tab.
// Las ex-creadoras SÍ quedan en los tabs de modelos: son reclutamiento para Kash
// (mismo embudo), y su tab es un agrupador extra — así el closer las sigue viendo
// en "Asignaciones" donde trabaja todos los días.
const B2B_SOURCE = "agencia";

// Las TRES líneas de negocio del pipeline. Cada una tiene su propio embudo y su
// propia forma de facturar, así que se cuentan y se miden por separado:
//   kash        → reclutar modelos para la agencia (comisión % sobre su OF).
//                 Incluye las ex-creadoras: es el mismo embudo.
//   plataformas → venderle un producto del portfolio a una creadora propia
//                 (suscripción mensual).
//   agencias    → B2B: venderle producto a una agencia externa (suscripción).
export type BusinessLine = "kash" | "plataformas" | "agencias";
export const BUSINESS_LINES: { value: BusinessLine | "todo"; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "kash", label: "Kash" },
  { value: "plataformas", label: "Plataformas" },
  { value: "agencias", label: "Agencias" },
];

export const businessLineOf = (leadSource: string | null, dealType: string | null): BusinessLine => {
  if ((leadSource || "maven") === B2B_SOURCE) return "agencias";
  return dealType === "venta_plataforma" ? "plataformas" : "kash";
};

// PLATFORMS = plataforma principal del lead (filtro). Mantiene Trafix porque
// hay leads históricos con ese valor y sin la opción no se pueden filtrar.
export const PLATFORMS = ["OnlyFans", "Trafix", "Blu", "Piclink", "Content Protector", "ORA", "Let's Shoot", "Otra"] as const;
// SALE_PLATFORMS = lo que se VENDE hoy (catálogo Unlimited). Trafix salió del
// catálogo → ya no se ofrece al registrar una venta nueva, pero las ventas
// históricas siguen contando en el desglose (que se arma desde los datos).
export const SALE_PLATFORMS = ["Blu", "Piclink", "Content Protector", "ORA", "Let's Shoot"] as const;

// El mismo producto está escrito distinto según de dónde venga la fila:
// "Piclink" en el pipeline vs "PicLink" en el catálogo, "Blu" vs "BLU". Sin
// normalizar, el desglose por plataforma parte una misma plataforma en dos
// barras y ninguna matchea el color asignado.
const PLATFORM_CANON = new Map<string, string>(
  [...SALE_PLATFORMS, "Trafix", "Unlok", "Kash", "OnlyFans"].map((p) => [p.toLowerCase(), p]),
);
// Default a nivel de módulo (no inline): si fuera un objeto nuevo por render,
// el useMemo que arma platformRevenue se recalcularía siempre.
const EMPTY_SUBSCRIPTION_REVENUE: { total: number; byPlatform: Record<string, number> } = {
  total: 0,
  byPlatform: {},
};

export const canonicalPlatform = (raw?: string | null): string => {
  const name = (raw || "").trim();
  if (!name) return "Sin plataforma";
  return PLATFORM_CANON.get(name.toLowerCase()) ?? name;
};
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

// Cadencia de contactos (días acumulados): el 1er contacto se espera 1 día
// después de la asignación, el 2º a los 3, etc. Espejada en SQL en la función
// public.check_closer_contact_alerts() — si cambia, actualizar AMBOS.
const CONTACT_SEQUENCE = [1, 3, 5, 8, 15, 29];

// Próxima fecha en que el closer debe contactar.
//  - Sin contactos aún → passed_date + CONTACT_SEQUENCE[0] (1 día).
//  - Con ≥1 contacto → se RE-ANCLA al último contacto: el próximo vence según
//    el gap de la cadencia contado desde que contactó por última vez. Así,
//    contactar "pone al día" el lead (antes se anclaba a passed_date fijo, por
//    lo que un lead viejo seguía "Vencido" aunque lo contactaras hoy).
export const getNextContactDate = (
  passedDate: string | null,
  contactCount: number,
  lastContactDate?: string | null,
): Date | null => {
  if (!passedDate || contactCount >= 6) return null;
  if (contactCount === 0) {
    const next = new Date(passedDate);
    next.setDate(next.getDate() + CONTACT_SEQUENCE[0]);
    return next;
  }
  const gap = (CONTACT_SEQUENCE[contactCount] ?? 29) - (CONTACT_SEQUENCE[contactCount - 1] ?? 0);
  const base = lastContactDate ? new Date(lastContactDate) : new Date(passedDate);
  const next = new Date(base);
  next.setDate(next.getDate() + gap);
  return next;
};

// Devuelve true si el próximo contacto ya venció (current_date > deadline,
// comparando fechas a medianoche). Mismo cálculo que el SQL cron (20260516170000).
// La cadencia solo aplica a leads EN GESTIÓN: si se pasa `stage` y no es
// 'Asignada' (Completada/No interesada/Rechazada/etc.), nunca está vencido —
// una venta Completada con 0/6 contactos mostraba el badge "Vencido" en la UI.
export const isContactOverdue = (
  passedDate: string | null,
  contactCount: number,
  lastContactDate?: string | null,
  stage?: string | null,
): boolean => {
  if (stage !== undefined && stage !== "Asignada") return false;
  if (!passedDate || contactCount >= 6) return false;
  const next = getNextContactDate(passedDate, contactCount, lastContactDate);
  if (!next) return false;
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

  // Un CLOSER SUPERVISOR ve todo el pipeline por `canSeeAll`, pero no debe ver las
  // asignadas de sus PARES: sólo lo suyo y lo de los closers rasos (regla del owner).
  // La lista de agentes visibles la resuelve la BD (closer_scope_agent_ids) para no
  // enumerar roles en el front; null = sin restricción.
  const { data: scopeAgentIds = null } = useQuery({
    queryKey: ["closer-scope-agents", user?.id, role],
    enabled: !!user?.id && role === "Closer Supervisor" && !viewAsCloserId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("closer_scope_agent_ids");
      if (error) throw error;
      return (data as string[] | null) ?? null;
    },
  });

  /** Aplica el alcance por agente a una query sobre closer_creators.
   *  - closer raso → sólo sus filas (comportamiento previo).
   *  - closer supervisor → él + closers rasos + el POOL sin asignar (cualquiera puede tomarlo).
   *  - resto → sin restricción. */
  const scopeByAgent = (q: any) => {
    if (!canSeeAll && effectiveUserId) return q.eq("assigned_to", effectiveUserId);
    if (scopeAgentIds && scopeAgentIds.length > 0) {
      return q.or(`assigned_to.in.(${scopeAgentIds.join(",")}),assigned_to.is.null`);
    }
    return q;
  };

  // Token de alcance para las queryKeys de TODAS las queries que pasan por
  // scopeByAgent. `scopeAgentIds` se resuelve async en una query aparte: si una
  // lista corre ANTES de que resuelva, se ejecuta SIN alcance (el supervisor ve
  // todo el pipeline) y —como su key no incluía el alcance— nunca se refetcheaba
  // al resolver. Resultado: el count era del set completo (varias páginas) pero
  // el fetch de la página 2 ya venía scoped → página 1 con datos de más y
  // página 2 vacía (bug reportado por Miguel en Asignaciones). Incluir el token
  // fuerza el refetch en la transición pending→resuelto. Para no-supervisores el
  // token es constante (la query de alcance está deshabilitada) → sin refetch de más.
  const scopeKey =
    role === "Closer Supervisor" && !viewAsCloserId
      ? (scopeAgentIds ? `sc:${scopeAgentIds.join(",")}` : "sc:pending")
      : "sc:none";

  const handleTabChange = (tab: string) => { setActiveTab(tab); setPage(0); };
  const handleSetSearch = (v: string) => { setSearch(v); setPage(0); };
  const handleSetAgentFilter = (v: string | null) => { setAgentFilter(v); setPage(0); };
  const handleSetPlatformFilter = (v: string | null) => { setPlatformFilter(v); setPage(0); };
  const handleSetDateFrom = (v: Date | undefined) => { setDateFrom(v); setPage(0); };
  const handleSetDateTo = (v: Date | undefined) => { setDateTo(v); setPage(0); };

  // Debounce del término de búsqueda (~350ms) antes de tocar la red.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 90);
    return () => clearTimeout(t);
  }, [search]);

  // Normalize search for server-side filtering (sobre el valor debounced)
  // Sólo filtramos con ≥3 caracteres: es el mínimo que usa el índice trigram
  // (pg_trgm) y evita que, al borrar+reescribir un nombre, los estados
  // intermedios de 1-2 letras disparen queries anchas (cientos de matches,
  // poco útiles) que multiplican los round-trips y hacen sentir "frozen" el
  // filtro. Con <3 chars mostramos la lista completa (sin filtro).
  const rawNormalizedSearch = debouncedSearch ? normalizeHandle(debouncedSearch) : "";
  const normalizedSearch = rawNormalizedSearch.length >= 3 ? rawNormalizedSearch : "";

  // Extraído como función con `tab` + `pageNum` parametrizados para poder
  // prefetchear las otras tabs cuando se monta el componente — así al
  // cambiar de tab los datos ya están en caché y no se ve el skeleton.
  const fetchCreatorsForTab = async (tab: string, pageNum: number) => {
      // ── Ex-creadores / Agencias: BASES DEL DIRECTORIO ──
      // Muestran los CONTACTOS disponibles para trabajar (closers_contacts).
      // Se excluyen los convertidos: al tomar uno, assign_closer_to_contact pone
      // status='converted' → sale de la base. `__isContact` marca que el id es de
      // closers_contacts, así "Tomar" y "registrar seguimiento" llaman al RPC de
      // asignación (que promueve el contacto a lead) en vez de tocar closer_creators
      // con un id que no existe ahí.
      if (SOURCE_TABS[tab]) {
        // Query del directorio (contactos disponibles), parametrizada por página.
        const mapContactRow = (c: any) => ({
          id: c.id,
          __isContact: true,
          instagram_handle: c.handle || c.name || "sin_handle",
          phone: c.phone ?? null,
          category: c.physical_appearance ?? null,
          city: c.city ?? null,
          notes: c.notes ?? null,
          stage: "Nuevo",
          assigned_to: null,
          passed_date: null,
          last_contact_date: null,
          contact_count: 0,
          estimated_monetization: 0,
          agency_commission: 0,
          subscription_amount: null,
          deal_type: tab === "agencias" ? "venta_plataforma" : "reclutamiento",
          lead_source: SOURCE_TABS[tab],
          main_platform: null,
          extras: null,
          created_at: c.created_at,
          created_by: c.created_by,
          source_contact_id: c.id,
          agent_name: null,
        });
        const dirBase = () => {
          let q = supabase
            .from("v_closers_contacts")
            .select("id, name, handle, phone, city, physical_appearance, notes, created_at, created_by, contact_kind, status", { count: "exact" })
            .eq("contact_kind", SOURCE_TABS[tab])
            .neq("status", "converted")
            .order("physical_appearance", { ascending: true })   // Alta → Media → Baja
            .order("created_at", { ascending: false });
          if (normalizedSearch) q = q.or(`handle.ilike.%${normalizedSearch}%,name.ilike.%${normalizedSearch}%`);
          return q;
        };

        // EX-CREADORES: directorio puro. Al tomarse pasan a reclutamiento y
        // reaparecen en "Asignaciones" (no están excluidas del embudo), así que
        // no necesitan mostrarse acá una vez trabajadas.
        if (tab !== "agencias") {
          const cFrom = pageNum * PAGE_SIZE;
          const { data, error, count } = await dirBase().range(cFrom, cFrom + PAGE_SIZE - 1);
          if (error) throw error;
          return { rows: (data || []).map(mapContactRow), total: count || 0 };
        }

        // AGENCIAS: unimos las que YA están en trabajo (leads B2B en el pipeline)
        // con las intactas del directorio. Sin esto, al registrar el primer
        // seguimiento la agencia se convierte en lead y —como las agencias están
        // EXCLUIDAS del embudo de modelos (Asignaciones, etc.)— desaparecería de
        // toda vista. Las en trabajo van primero (tienen actividad). Conjuntos
        // disjuntos: al convertirse el contacto sale del directorio.
        const leadBase = () => {
          // Solo las que YA están EN TRABAJO (con dueño). Una agencia en el
          // pipeline pero sin asignar sigue estando "disponible", y su contacto
          // sin convertir ya la muestra en la porción de directorio de abajo:
          // sin este filtro aparecería DOS veces para quien ve todo el pipeline
          // (admin/supervisor), que es lo que pasó al reetiquetar las 72 que el
          // trigger había metido al embudo de modelos. Los closers rasos no lo
          // notaban porque scopeByAgent ya les acota a sus propias filas.
          let q = supabase.from("closer_creators").select("*", { count: "exact" })
            .eq("lead_source", B2B_SOURCE)
            .not("assigned_to", "is", null);
          if (normalizedSearch) q = q.ilike("instagram_handle", `%${normalizedSearch}%`);
          q = scopeByAgent(q); // el Closer Supervisor no ve las de sus pares
          return q.order("passed_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
        };
        const [leadCountRes, dirCountRes] = await Promise.all([
          leadBase().range(0, 0),   // solo para el count exact
          dirBase().range(0, 0),
        ]);
        if (leadCountRes.error) throw leadCountRes.error;
        if (dirCountRes.error) throw dirCountRes.error;
        const L = leadCountRes.count || 0;
        const D = dirCountRes.count || 0;

        const from = pageNum * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let rows: any[] = [];
        // Porción de leads en trabajo (índices [0, L) del listado combinado).
        if (from < L) {
          const { data, error } = await leadBase().range(from, Math.min(to, L - 1));
          if (error) throw error;
          rows = data || [];
        }
        // Porción de directorio (rellena el resto de la página).
        if (rows.length < PAGE_SIZE && to >= L) {
          const dFrom = Math.max(0, from - L);
          const need = PAGE_SIZE - rows.length;
          const { data, error } = await dirBase().range(dFrom, dFrom + need - 1);
          if (error) throw error;
          rows = rows.concat((data || []).map(mapContactRow));
        }
        return { rows, total: L + D };
      }

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
          .is("assigned_to", null)
          // El pool de modelos no muestra agencias (tienen su propio tab).
          .neq("lead_source", B2B_SOURCE);

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

        // 1ª ola: solo la página cruda. El enriquecimiento (perfiles/historial/
        // teléfonos) se hace aparte y progresivo para que la lista pinte ya.
        return { rows: (data || []) as any[], total: count || 0 };
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

      // Las agencias (B2B) SÍ entran a los tabs por stage, igual que las
      // ex-creadoras: Miguel y Jhon (04/08) tomaban agencias y "Asignaciones"
      // no las contaba — para quien trabaja el pipeline eso lee como que el
      // Tomar no guardó nada. Solo las TOMADAS llegan acá (las no tomadas son
      // contactos del directorio y viven en el tab Agencias), así que no se
      // repite la contaminación del import de las 465.
      // Tab "Ventas": deals de venta de plataforma a creadoras propias
      // (cross-stage) — ahí las B2B sí quedan afuera para no mezclar líneas.
      if (tab === "ventas") {
        query = query.eq("deal_type", "venta_plataforma").neq("lead_source", B2B_SOURCE);
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
      query = scopeByAgent(query);

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

      // 1ª ola: solo la página cruda (ver useMemo `creators` + query de
      // enriquecimiento más abajo para el patrón progresivo).
      return { rows: (data || []) as any[], total: count || 0 };
  };

  const buildCreatorsListKey = (tab: string, pageNum: number) =>
    ["closer-creators-list", tab, pageNum, user?.id, role, scopeKey, dateFrom?.toISOString(), dateTo?.toISOString(), dateField, normalizedSearch, agentFilter, platformFilter, viewAsCloserId] as const;

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

  const rawRows = (creatorsData?.rows ?? []) as any[];
  const totalCount = creatorsData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Enriquecimiento PROGRESIVO (2ª ola) ──
  // La lista pinta con la página cruda (1ª ola); esta query rellena agente /
  // X-6 / notas / teléfono cuando resuelve, sin bloquear el pintado. Mismo
  // patrón que Contactos (query principal + hooks de enriquecimiento aparte).
  const rawIds = rawRows.map((c) => c.id as string);
  const { data: enrichment } = useQuery({
    queryKey: ["closer-list-enrichment", rawIds.join(",")],
    enabled: rawIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const profileIds = [...new Set(rawRows.flatMap((c: any) => [c.assigned_to, c.created_by]).filter(Boolean))] as string[];
      const sourceContactIds = [...new Set(rawRows.map((c: any) => c.source_contact_id).filter(Boolean))] as string[];
      const [profilesRes, historyRes, contactsRes] = await Promise.all([
        profileIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
          : Promise.resolve({ data: [] }),
        rawIds.length > 0
          ? supabase.from("closer_contact_history").select("creator_id, contact_date, channel, notes").in("creator_id", rawIds).order("contact_date", { ascending: true })
          : Promise.resolve({ data: [] }),
        sourceContactIds.length > 0
          ? supabase.from("v_closers_contacts").select("id, country_code, phone").in("id", sourceContactIds)
          : Promise.resolve({ data: [] }),
      ]);
      const profilesMap: Record<string, string> = {};
      for (const p of profilesRes.data || []) profilesMap[(p as any).id] = (p as any).full_name || "Sin nombre";
      const contactCountMap: Record<string, number> = {};
      const contactNotesMap: Record<string, ContactNote[]> = {};
      for (const h of historyRes.data || []) {
        const cid = (h as any).creator_id;
        contactCountMap[cid] = (contactCountMap[cid] || 0) + 1;
        (contactNotesMap[cid] = contactNotesMap[cid] || []).push({
          contact_date: (h as any).contact_date,
          channel: (h as any).channel ?? null,
          notes: (h as any).notes ?? null,
        });
      }
      const sourceContactMap: Record<string, { country_code: string | null; phone: string | null }> = {};
      for (const sc of contactsRes.data || []) sourceContactMap[(sc as any).id] = { country_code: (sc as any).country_code, phone: (sc as any).phone };
      return { profilesMap, contactCountMap, contactNotesMap, sourceContactMap };
    },
  });

  const creators = useMemo<CloserCreatorRow[]>(() => {
    const profilesMap = enrichment?.profilesMap ?? {};
    const contactCountMap = enrichment?.contactCountMap ?? {};
    const contactNotesMap = enrichment?.contactNotesMap ?? {};
    const sourceContactMap = enrichment?.sourceContactMap ?? {};
    return rawRows.map((c: any) => ({
      ...c,
      leadgen_entry_id: c.leadgen_entry_id ?? null,
      estimated_monetization: c.estimated_monetization ?? 0,
      agency_commission: c.agency_commission ?? 0,
      extras: c.extras ?? 0,
      main_platform: c.main_platform ?? null,
      agent_name: c.assigned_to ? (profilesMap[c.assigned_to] || null) : (c.created_by ? (profilesMap[c.created_by] || null) : null),
      contact_count: contactCountMap[c.id] || 0,
      contact_notes: contactNotesMap[c.id] || [],
      source_contact_id: c.source_contact_id ?? null,
      resolved_whatsapp_phone: resolveWhatsAppPhone(c.phone, c.source_contact_id, sourceContactMap),
      _source: "closer" as const,
      _lg_status: null,
    }));
  }, [rawRows, enrichment]);

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
    queryKey: ["closer-alert-counts", user?.id, role, scopeKey, viewAsCloserId],
    queryFn: async () => {
      const targetUserId = effectiveUserId;
      let creatorsQ = supabase
        .from("closer_creators")
        .select("id, passed_date, assigned_to")
        .eq("stage", "Asignada")
        .not("passed_date", "is", null);
      if (!canSeeAll && targetUserId) {
        creatorsQ = creatorsQ.eq("assigned_to", targetUserId);
      } else if (scopeAgentIds && scopeAgentIds.length > 0) {
        // Closer supervisor: las alertas de contacto son de SU gente, no de sus pares.
        creatorsQ = creatorsQ.in("assigned_to", scopeAgentIds);
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
    queryKey: ["closer-creators-counts", "v2", user?.id, role, scopeKey, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      // (A) Conteos por stage "real" — respeta el rol (closer = solo sus
      // asignadas) y el rango de fecha sobre passed_date, igual que el
      // listado de Operaciones.
      // Paginado: PostgREST corta en 1000 filas. closer_creators ya supera ese
      // techo (>2500), así que sin paginar los conteos por stage (No interesada,
      // etc.) quedaban truncados a ~1000. fetchAllRows trae TODAS con .range().
      const rows = await fetchAllRows((from, to) => {
        let q = supabase.from("closer_creators").select("stage, deal_type, lead_source");
        q = scopeByAgent(q);
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        return q.order("id", { ascending: true }).range(from, to);
      });
      const counts: Record<string, number> = {};
      for (const row of rows as Array<{ stage: string | null; deal_type: string | null; lead_source: string | null }>) {
        const src = row.lead_source || "maven";
        const s = row.stage || "Sin stage";
        // Línea de negocio del lead. Son tres embudos distintos y el owner los
        // quiere contados aparte (si se mezclan, la conversión no significa nada:
        // reclutar una modelo y venderle Trafix a una agencia no son lo mismo).
        const line = businessLineOf(src, row.deal_type);
        counts[`${line}:${s}`] = (counts[`${line}:${s}`] || 0) + 1;
        counts[`line:${line}`] = (counts[`line:${line}`] || 0) + 1;

        // Los contadores de Ex-creadores/Agencias NO salen de acá: esos tabs
        // cuentan CONTACTOS del directorio (ver el bloque (C) más abajo).
        // Por STAGE las B2B sí cuentan (Asignaciones etc. — espejo del listado,
        // 04/08); en "Ventas" no (ese tab es ventas a creadoras propias).
        counts[s] = (counts[s] || 0) + 1;
        if (src === B2B_SOURCE) continue;
        if (row.deal_type === "venta_plataforma") counts["ventas"] = (counts["ventas"] || 0) + 1;
      }
      // (B) Pool SIN asignar partido por antigüedad (Nuevo ≤30d / Antiguos
      // >30d). Va aparte de (A) porque NO se filtra por assigned_to (todos
      // ven el pool, incluido el closer tras la policy RLS) ni por el rango
      // de passed_date (los 'Nuevo' no tienen passed_date). head:true =
      // solo cuenta, no transfiere filas. Sobrescribe Nuevo/Antiguos de (A).
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // .neq(lead_source, agencia): el pool de modelos no incluye B2B (mismo
      // criterio que la query del listado, si no el contador no cuadra con la lista).
      const [recentRes, oldRes] = await Promise.all([
        supabase.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("stage", "Nuevo").is("assigned_to", null).neq("lead_source", B2B_SOURCE).gte("created_at", cutoff),
        supabase.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("stage", "Nuevo").is("assigned_to", null).neq("lead_source", B2B_SOURCE).lt("created_at", cutoff),
      ]);
      // (C) Bases del DIRECTORIO: Ex-creadores y Agencias cuentan contactos
      // disponibles (no convertidos), igual que su listado — si contaran leads,
      // el número del tab no cuadraría con las filas que se ven.
      const [exRes, agRes] = await Promise.all([
        supabase.from("v_closers_contacts").select("id", { count: "exact", head: true })
          .eq("contact_kind", "ex_creadora").neq("status", "converted"),
        supabase.from("v_closers_contacts").select("id", { count: "exact", head: true })
          .eq("contact_kind", "agencia").neq("status", "converted"),
      ]);
      counts["ex_creadores"] = exRes.count || 0;
      counts["agencias"] = agRes.count || 0;

      counts["Nuevo"] = recentRes.count || 0;
      counts["Antiguos"] = oldRes.count || 0;
      return counts;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // Revenue by platform
  // Camino VIEJO de registrar una venta de plataforma: el panel dentro del lead
  // (tabla closer_platform_sales). Sigue en uso, así que no se puede ignorar —
  // pero tampoco es la única fuente (ver platformRevenue más abajo).
  const { data: legacyPlatformRevenue = {} } = useQuery({
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
        const key = canonicalPlatform(row.platform);
        rev[key] = (rev[key] || 0) + Number(row.price || 0);
      }
      return rev;
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });

  // OF monetization total (estimated_monetization from completed/confirmed)
  const { data: ofMonetizationTotal = 0 } = useQuery({
    queryKey: ["closer-of-monetization", user?.id, role, scopeKey, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = supabase
        .from("closer_creators")
        .select("estimated_monetization, passed_date")
        // Revenue de la línea KASH: sólo reclutamiento de modelos. Antes no
        // filtraba, así que cualquier fila con estimated_monetization sumaba acá
        // (las agencias, por ejemplo, si les cargan monetización).
        .eq("deal_type", "reclutamiento")
        .neq("lead_source", B2B_SOURCE)
        .in("stage", ["Completada", "Confirmada"]);
      q = scopeByAgent(q);
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
  const { data: subscriptionRevenue = EMPTY_SUBSCRIPTION_REVENUE } = useQuery({
    queryKey: ["closer-subscription-revenue", user?.id, role, scopeKey, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = supabase
        .from("closer_creators")
        .select("main_platform, subscription_amount, passed_date")
        .eq("deal_type", "venta_plataforma")
        // Sólo ventas a creadoras propias. Las agencias también son
        // venta_plataforma con suscripción: sin este filtro, al importar las 465
        // sus suscripciones se sumarían al "Rev. Suscripciones" de creadoras y el
        // número dejaría de significar lo que dice.
        .neq("lead_source", B2B_SOURCE)
        .in("stage", ["Completada", "Confirmada"]);
      q = scopeByAgent(q);
      if (applyCreatorDate) {
        const fromStr = dateFrom!.toISOString().split("T")[0];
        const toStr = dateTo!.toISOString().split("T")[0];
        q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
      }
      const { data, error } = await q;
      if (error) throw error;
      // Desglosado por plataforma además del total: es la fuente REAL del
      // "por plataforma" del dashboard (el carrito de Creadoras escribe acá).
      const byPlatform: Record<string, number> = {};
      let total = 0;
      for (const r of (data || []) as unknown as Array<{ main_platform: string | null; subscription_amount: number | string | null }>) {
        const amount = Number(r.subscription_amount || 0);
        total += amount;
        const key = canonicalPlatform(r.main_platform);
        byPlatform[key] = (byPlatform[key] || 0) + amount;
      }
      return { total, byPlatform };
    },
    enabled: !!user?.id && !!role,
    staleTime: 30_000,
  });
  const subscriptionRevenueTotal = subscriptionRevenue.total;

  // "Rev. Plataformas" y el desglose por plataforma tienen que reflejar TODO lo
  // vendido, venga del panel viejo del lead (closer_platform_sales) o del
  // carrito de Creadoras (deal_type='venta_plataforma' en el pipeline, el camino
  // de hoy). Antes sólo miraba el panel viejo: mostraba $190 de marzo/mayo y
  // dejaba fuera las ventas del pipeline, que sumaban aparte en "Rev.
  // Suscripciones" — así que el desglose por plataforma estaba congelado en 2026-05.
  const platformRevenue = useMemo(() => {
    const merged: Record<string, number> = { ...legacyPlatformRevenue };
    for (const [k, v] of Object.entries(subscriptionRevenue.byPlatform)) {
      merged[k] = (merged[k] || 0) + v;
    }
    return merged;
  }, [legacyPlatformRevenue, subscriptionRevenue]);

  // Revenue de la línea AGENCIAS (B2B): suscripciones de los deals cerrados con
  // agencias. Va aparte de las suscripciones de creadoras porque son dos
  // negocios distintos y el owner los quiere medidos por separado.
  const { data: agencyRevenueTotal = 0 } = useQuery({
    queryKey: ["closer-agency-revenue", user?.id, role, scopeKey, applyCreatorDate ? dateFromStr : null, applyCreatorDate ? dateToStr : null, viewAsCloserId],
    queryFn: async () => {
      let q = supabase
        .from("closer_creators")
        .select("subscription_amount, passed_date")
        .eq("lead_source", B2B_SOURCE)
        .in("stage", ["Completada", "Confirmada"]);
      q = scopeByAgent(q);
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

  // Lista de agentes para el filtro "Agente": TODOS los que tienen al menos un
  // lead asignado (vía RPC get_closer_agents), no solo los presentes en la
  // página cargada — antes se derivaba de `creators` y faltaban closers.
  const { data: agentList = [] } = useQuery({
    queryKey: ["closer-agents-list"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_closer_agents");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!user?.id && !!role,
    staleTime: 5 * 60_000,
  });

  // Optimistic update
  const optimisticUpdate = (id: string, updates: Partial<CloserCreatorRow>) => {
    queryClient.setQueryData(
      buildCreatorsListKey(activeTab, page),
      (old: { rows: any[]; total: number } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          rows: old.rows.map((c) => (c.id === id ? { ...c, ...updates } : c)),
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
    onSuccess: (_data, { id, stage }) => {
      // ── Celebración del cierre (ola 3 UX, #105) ─────────────────────────
      // Mover a "Completada" es el evento de mayor valor del CRM y se sentía
      // igual que editar un campo. Ráfaga breve de confetti + toast con el
      // nombre y el monto — UNA vez por cierre (gate en sessionStorage dentro
      // de celebrateClose) y respetando prefers-reduced-motion.
      if (stage === "Completada") {
        let row: CloserCreatorRow | undefined;
        for (const [, cached] of queryClient.getQueriesData<{ rows: CloserCreatorRow[]; total: number }>({
          queryKey: ["closer-creators-list"],
        })) {
          row = cached?.rows?.find((r) => r.id === id);
          if (row) break;
        }
        if (celebrateClose(`lead-${id}`)) {
          // Venta de plataforma → suscripción fija; reclutamiento → monetización estimada.
          const monto = row?.deal_type === "venta_plataforma"
            ? Number(row?.subscription_amount ?? 0)
            : Number(row?.estimated_monetization ?? 0);
          toast({
            title: row?.instagram_handle ? `🎉 Cerraste a @${row.instagram_handle}` : "🎉 Trato cerrado",
            description: monto > 0
              ? `Pasó a Completada · $${monto.toLocaleString()} ${row?.deal_type === "venta_plataforma" ? "de suscripción" : "de monetización estimada"}.`
              : "Pasó a Completada.",
          });
        }
      }
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

      // ── El id puede NO ser de un lead ────────────────────────────────────
      // En los tabs Ex-creadoras y Agencias las filas son CONTACTOS del
      // directorio: su id es de closers_contacts y no existe en closer_creators.
      // Antes se hacía el UPDATE igual → matcheaba 0 filas, y como un UPDATE sin
      // coincidencias NO es un error en Postgres, la mutación salía "ok" y la UI
      // cantaba "Creator asignada" sin haber guardado nada. Ese era el bug que
      // reportó Miguel el 01/08: asignaba agencias, veía el cartel verde, y
      // después no aparecían en ningún lado porque nunca se escribieron.
      // El RPC es el mismo que usa "Tomar": crea el lead heredando la base del
      // contacto y lo marca como convertido.
      if (!current) {
        const { error } = await (supabase as any).rpc("assign_closer_to_contact", {
          p_contact_id: id,
          p_closer_id: assigned_to,
        });
        if (error) throw error;
        return;
      }

      const updates: Record<string, unknown> = { assigned_to };
      if (current?.stage === "Nuevo") {
        updates.stage = "Asignada";
        // Setear passed_date al pasar de Nuevo → Asignada para que el
        // reporte de closers cuente correctamente las asignaciones en
        // el rango (mismo patrón que confirmed_date/completed_date).
        updates.passed_date = new Date().toISOString().slice(0, 10);
      }

      // .select("id") NO es decorativo: es la única forma de saber si el UPDATE
      // tocó algo. Sin esto la UI puede volver a decir "asignada" sobre cero filas
      // (RLS que filtra, id inexistente, fila borrada entre medio).
      const { data: updated, error } = await supabase
        .from("closer_creators").update(updates).eq("id", id).select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("No se pudo asignar: la lead ya no existe o no tienes permiso sobre ella.");
      }
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

      // En los tabs Ex-creadores/Agencias las filas son CONTACTOS del directorio,
      // no leads: tomar uno es asignárselo vía RPC (que crea el lead heredando el
      // tipo → ex_creadora/agencia, y marca el contacto como convertido para que
      // salga de la base). Si se hiciera el update directo a closer_creators, el
      // id no existiría ahí y el "Tomar" fallaría en silencio.
      const row = (creators as any[]).find((r) => r.id === id);
      if (row?.__isContact) {
        const { error } = await (supabase as any).rpc("assign_closer_to_contact", {
          p_contact_id: id,
          p_closer_id: user.id,
        });
        if (error) throw error;
        return;
      }

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
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      // Las agencias son B2B y están EXCLUIDAS de los tabs del embudo de modelos
      // (ver el filtro neq lead_source=agencia): mandarlas a buscar a "Asignaciones"
      // era mandarlas donde por diseño nunca van a estar.
      toast({
        title: "Tomada",
        description: activeTab === "agencias"
          ? "Quedó asignada a ti, en el tab Agencias."
          : "Quedó asignada a ti, en Asignaciones.",
      });
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
    agencyRevenueTotal,
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
