import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as { from: (table: string) => any };

export interface OperationsKpis {
  // LLG team contactó (solo `leadgen_entries`).
  contacted: number;
  // Scouter team CONTACTÓ — un spammer completó una task 'comment' con
  // screenshot. Filtramos por `first_scouter_contact_at` (seteado por
  // trigger). El simple hecho de que la lead exista en `scouter_leads`
  // NO cuenta como contactada — esos son leads descubiertos, pool de
  // prospección.
  scouterContacts: number;
  // Scouter team GENERÓ — todas las leads en scouter_leads (pool de
  // prospección). Útil para la hero card "Total leads generados" que
  // mide volumen de descubrimiento, no de contacto.
  scouterGenerated: number;
  // contacted + scouterGenerated (LLG contactadas + scouter pool).
  totalGenerated: number;
  // LLG con teléfono capturado.
  llgWithPhone: number;
  // Scouter con teléfono capturado.
  scouterWithPhone: number;
  // Cross-team (leadgen+phone + scouter+phone). Subset estricto de
  // `totalLeads` — todo modelo contactado por cualquier equipo cuyo
  // teléfono ya fue capturado.
  numbersObtained: number;
  closerCalls: number;     // Llamadas para cierre (qa_calls — closer crea New QA)
  closes: number;          // Cerró (call_outcome=cerro)
  onHold: number;          // En espera (call_outcome=en_espera)
  rejections: number;      // Rechazos (call_outcome=no_cerro)
  enteredCrm: number;      // [DEPRECATED] Ingresada al CRM por entered_crm_at (legacy)
  crmAltas: number;        // ↑ Movimientos del CRM: creators que pasaron a blu_infloww_active=true netos en el período
  crmBajas: number;        // ↓ Movimientos del CRM: creators que pasaron a false netos en el período
  totalLeads: number;      // LLG + Scouter — el verdadero "total contactadas"
}

export type MetricKey =
  | "contacted"
  | "numbersObtained"
  | "closerCalls"
  | "closes"
  | "onHold"
  | "rejections"
  | "enteredCrm"
  | "totalLeads";

export interface DashboardRange {
  from: Date | undefined;
  to: Date | undefined;
}

const toIso = (d: Date | undefined): string | null =>
  d ? d.toISOString() : null;

// El user pickea fechas como "1/may → 10/may" pero las columnas son
// timestamptz. Si pasamos `to = 2026-05-10T00:00:00Z` con `<=`, sólo
// matchean filas creadas exactamente a la medianoche → resultado vacío.
// Inflamos el `to` a fin-de-día para que la cota superior sea inclusiva
// del día completo (rango cerrado por la izquierda, inclusivo por la
// derecha al nivel de día).
const toIsoEndOfDay = (d: Date | undefined): string | null =>
  d ? endOfDay(d).toISOString() : null;

/** KPIs del dashboard. Si from/to son undefined, sin filtro de fecha. */
export const useOperationsDashboard = (range: DashboardRange) =>
  useQuery({
    queryKey: ["ops-dashboard", toIso(range.from), toIso(range.to)],
    // Bumped 60s → 5min. Las 9 queries de count en paralelo (la más
    // lenta marca el ritmo) no necesitan refrescarse cada minuto en un
    // dashboard de overview. refetchInterval también sube.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    // keepPreviousData: al cambiar de rango de fechas, los números
    // viejos se quedan visibles mientras llega el nuevo resultado.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OperationsKpis> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);

      const head = (table: string, dateCol: string, filter?: (q: any) => any) => {
        let q = sb.from(table).select("*", { count: "exact", head: true });
        if (fromIso) q = q.gte(dateCol, fromIso);
        if (toIsoVal) q = q.lte(dateCol, toIsoVal);
        if (filter) q = filter(q);
        return q;
      };

      // "Números obtenidos" — leemos de la view consolidada
      // `v_model_phone_captures` que UNIONa las 5 tablas con teléfono y
      // dedupea por (handle, phone). Una sola modelo aparecida en
      // varias etapas se cuenta UNA vez. captured_at es la primera
      // captura cross-team.
      const [
        { count: contacted },
        { count: scouterTotal },
        { count: scouterRaw },
        { count: numbersObtainedCount },
        { count: closerCalls },
        { count: closes },
        { count: onHold },
        { count: rejections },
        { count: enteredCrm },
        crmMovementsRes,
      ] = await Promise.all([
        head("leadgen_entries", "created_at"),
        // Scouter "contactadas" = lead con first_scouter_contact_at
        // poblado (=spammer hizo comment con screenshot). Pool de leads
        // descubiertos pero no contactadas no entra al funnel.
        head("scouter_leads",   "first_scouter_contact_at", (q) =>
          q.not("first_scouter_contact_at", "is", null),
        ),
        // Scouter "generadas" — pool entero de descubrimiento. Útil
        // para la card "Total leads generados" que mide volumen, no
        // contacto efectivo.
        head("scouter_leads", "created_at"),
        head("v_model_phone_captures", "captured_at"),
        head("qa_calls", "call_date"),
        head("qa_calls", "call_date", (q) =>
          q.eq("claude_analysis->>call_outcome", "cerro"),
        ),
        head("qa_calls", "call_date", (q) =>
          q.eq("claude_analysis->>call_outcome", "en_espera"),
        ),
        head("qa_calls", "call_date", (q) =>
          q.eq("claude_analysis->>call_outcome", "no_cerro"),
        ),
        head("creators", "entered_crm_at", (q) =>
          q.not("entered_crm_at", "is", null),
        ),
        // Movimientos del CRM — RPC que computa altas/bajas NETAS de
        // creator.blu_infloww_active en el rango. NULLs OK: el RPC
        // los trata como "desde el principio" / "hasta ahora".
        (supabase as any).rpc("crm_movements_in_range", {
          p_from: fromIso ?? null,
          p_to: toIsoVal ?? null,
        }),
      ]);

      const crmMov = (crmMovementsRes as any)?.data ?? { altas: 0, bajas: 0 };

      return {
        contacted: contacted ?? 0,
        scouterContacts: scouterTotal ?? 0,
        scouterGenerated: scouterRaw ?? 0,
        totalGenerated: (contacted ?? 0) + (scouterRaw ?? 0),
        // llgWithPhone / scouterWithPhone se mantienen por compat de la
        // interfaz pero ya no se usan en el dashboard — la view dedupea
        // todo. Los reportamos como 0 para simplicidad.
        llgWithPhone: 0,
        scouterWithPhone: 0,
        numbersObtained: numbersObtainedCount ?? 0,
        closerCalls: closerCalls ?? 0,
        closes: closes ?? 0,
        onHold: onHold ?? 0,
        rejections: rejections ?? 0,
        enteredCrm: enteredCrm ?? 0,
        crmAltas: crmMov.altas ?? 0,
        crmBajas: crmMov.bajas ?? 0,
        totalLeads: (contacted ?? 0) + (scouterTotal ?? 0),
      };
    },
  });

// ─── Detalle por métrica (para el popup al hacer click en la card) ───────

export interface DetailRow {
  id: string;
  primary: string;   // texto principal (handle, modelo, etc)
  secondary?: string; // texto secundario (closer, fecha, etc)
  date?: string;
  badge?: string;
  /** Categoría de la modelo (Elite, A+, A, B+, B, C+, C). Si no se
   *  pudo determinar, queda undefined → grupo "Sin categoría". */
  category?: string;
  /** Si está, la fila se vuelve clickable y navega a esa ruta. */
  linkUrl?: string;
  /** Si está, la fila abre LeadDetailDialog con la info completa
   *  de la fila desde la tabla source. */
  leadSource?: "leadgen" | "scouter" | "creator";
}

// Orden canónico de categorías para los grupos del popup. Las que no
// estén en este map quedan al final, ordenadas alfabéticamente.
export const CATEGORY_ORDER: Record<string, number> = {
  Elite: 1,
  "A+": 2,
  A: 3,
  "B+": 4,
  B: 5,
  "C+": 6,
  C: 7,
};

/** Fetch de los items detrás de una métrica. Hasta 100 rows.
 *  Misma lógica de fechas que useOperationsDashboard. */
export const useMetricDetails = (
  metric: MetricKey,
  range: DashboardRange,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["ops-dashboard-details", metric, toIso(range.from), toIso(range.to)],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<DetailRow[]> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);

      const dateGte = (q: any, col: string) => (fromIso ? q.gte(col, fromIso) : q);
      const dateLte = (q: any, col: string) => (toIsoVal ? q.lte(col, toIsoVal) : q);

      const limit = 100;

      switch (metric) {
        case "contacted": {
          const q = sb
            .from("leadgen_entries")
            .select("id, model_handle, lg_user_id, phone_e164, status, category_code, created_at")
            .order("created_at", { ascending: false })
            .limit(limit);
          const { data, error } = await dateLte(dateGte(q, "created_at"), "created_at");
          if (error) throw error;
          return (data ?? []).map((r: any) => ({
            id: r.id,
            primary: `@${r.model_handle ?? "?"}`,
            secondary: r.phone_e164 ? `📞 ${r.phone_e164}` : "Sin número",
            date: r.created_at,
            badge: r.status,
            category: r.category_code ?? undefined,
            leadSource: "leadgen" as const,
          }));
        }
        case "totalLeads": {
          // Modelos contactadas — leadgen (cualquier fila) + scouter
          // que tuvo al menos una task 'comment' con screenshot
          // (filtrado por first_scouter_contact_at). El pool de leads
          // descubiertos pero no contactadas NO aparece acá.
          const q1 = sb
            .from("leadgen_entries")
            .select("id, model_handle, phone_e164, status, category_code, created_at")
            .order("created_at", { ascending: false })
            .limit(50);
          const q2 = sb
            .from("scouter_leads")
            .select("id, instagram_handle, phone, status, category, first_scouter_contact_at")
            .not("first_scouter_contact_at", "is", null)
            .order("first_scouter_contact_at", { ascending: false })
            .limit(50);
          const [{ data: a }, { data: b }] = await Promise.all([
            dateLte(dateGte(q1, "created_at"), "created_at"),
            dateLte(dateGte(q2, "first_scouter_contact_at"), "first_scouter_contact_at"),
          ]);
          const aRows = (a ?? []).map((r: any) => ({
            id: r.id,
            primary: `@${r.model_handle ?? "?"}`,
            secondary: r.phone_e164 ? `📞 ${r.phone_e164}` : "Sin número",
            date: r.created_at,
            badge: "leadgen",
            category: r.category_code ?? undefined,
            leadSource: "leadgen" as const,
          }));
          const bRows = (b ?? []).map((r: any) => ({
            id: r.id,
            primary: `@${r.instagram_handle ?? "?"}`,
            secondary: r.phone ? `📞 ${r.phone}` : "Sin número",
            date: r.first_scouter_contact_at,
            badge: "scouter",
            category: r.category ?? undefined,
            leadSource: "scouter" as const,
          }));
          return [...aRows, ...bRows].sort((x, y) =>
            (y.date ?? "") < (x.date ?? "") ? -1 : 1,
          );
        }
        case "numbersObtained": {
          // Listamos por phone_first_set_at (primera captura) — coincide
          // con el conteo del KPI. Leemos de la view consolidada — una
          // entrada por (handle, phone), con fecha = primera captura
          // cross-table. El badge muestra de qué tabla salió la captura
          // ganadora del dedup.
          const q = sb
            .from("v_model_phone_captures")
            .select("source_table, source_id, handle, phone, captured_at")
            .order("captured_at", { ascending: false })
            .limit(limit);
          const { data, error } = await dateLte(
            dateGte(q, "captured_at"),
            "captured_at",
          );
          if (error) throw error;
          // Para las filas que vinieron de closer_creators o
          // closers_contacts, el `source_id` no apunta a creators —
          // resolvemos el handle → creator.id buscando en `creators`
          // case-insensitive (algunos handles están con mayúsculas, 3
          // tienen prefix "@"). Si encontramos match, redirigimos el
          // click al perfil del creator (ficha técnica). 273 rows no
          // es nada para fetchear y nos evita complicar con .or().
          const { data: creatorRows } = await sb
            .from("creators")
            .select("id, instagram_handle, category")
            .not("instagram_handle", "is", null);
          const creatorByHandle = new Map<string, { id: string; category: string | null }>();
          for (const c of (creatorRows ?? []) as Array<{ id: string; instagram_handle: string; category: string | null }>) {
            const norm = c.instagram_handle
              .replace(/^@/, "")
              .toLowerCase()
              .trim();
            if (norm && !creatorByHandle.has(norm)) {
              creatorByHandle.set(norm, { id: c.id, category: c.category });
            }
          }
          // El leadSource del dialog se infiere para los pocos casos
          // donde el dialog puede abrir el detalle. Solo "leadgen",
          // "scouter" y "creator" están soportados; el resto se omite.
          const sourceMap: Record<string, "leadgen" | "scouter" | "creator" | undefined> = {
            leadgen_entries: "leadgen",
            scouter_leads: "scouter",
            creators: "creator",
          };
          return (data ?? []).map((r: any) => {
            const handleNorm = (r.handle || "").toLowerCase().trim();
            const match = handleNorm
              ? creatorByHandle.get(handleNorm)
              : undefined;
            // Si encontramos un creator con ese handle, redirigimos el
            // click a su ficha técnica (creator profile). Si no, usamos
            // el sourceMap original — leadgen/scouter/creators apuntan
            // a sus tablas; closer_creators / closers_contacts sin
            // matching creator quedan sin click (leadSource undefined).
            const leadSource = match
              ? ("creator" as const)
              : sourceMap[r.source_table];
            const id = match?.id ?? r.source_id;
            return {
              id,
              primary: `@${r.handle || "?"}`,
              secondary: `📞 ${r.phone}`,
              date: r.captured_at,
              badge: r.source_table,
              category: match?.category ?? undefined,
              leadSource,
            };
          });
        }
        case "closerCalls":
        case "closes":
        case "onHold":
        case "rejections": {
          let q = sb
            .from("qa_calls")
            .select(
              "id, call_date, closer:qa_closers(name), model:qa_models(name, category), claude_analysis",
            )
            .order("call_date", { ascending: false })
            .limit(limit);
          if (metric === "closes")
            q = q.eq("claude_analysis->>call_outcome", "cerro");
          if (metric === "onHold")
            q = q.eq("claude_analysis->>call_outcome", "en_espera");
          if (metric === "rejections")
            q = q.eq("claude_analysis->>call_outcome", "no_cerro");
          const { data, error } = await dateLte(dateGte(q, "call_date"), "call_date");
          if (error) throw error;
          return (data ?? []).map((r: any) => ({
            id: r.id,
            primary: r.model?.name ?? "Modelo",
            secondary: r.closer?.name
              ? `Closer: ${r.closer.name}`
              : "Closer: ?",
            date: r.call_date,
            badge: r.claude_analysis?.call_outcome ?? "—",
            category: r.model?.category ?? undefined,
            // Click → abre la página del detalle de la QA call
            // (AgencyQA usa ?callId=<id> para deeplinkear).
            linkUrl: `/agency-qa?callId=${r.id}`,
          }));
        }
        case "enteredCrm": {
          // Mismo source que el card: creator_blu_history JOIN creators.
          // El card muestra el NETO (altas - bajas) y el popup lista los
          // eventos individuales. Antes el popup queryeaba la columna
          // legacy entered_crm_at, por eso no matcheaba.
          const q = sb
            .from("creator_blu_history")
            .select("id, creator_id, new_state, changed_at, creator:creators(name)")
            .order("changed_at", { ascending: false })
            .limit(limit);
          const { data, error } = await dateLte(
            dateGte(q, "changed_at"),
            "changed_at",
          );
          if (error) throw error;
          return (data ?? []).map((r: any) => ({
            id: r.creator_id,
            primary: r.creator?.name ?? "(sin nombre)",
            secondary: r.new_state ? "Activada en Blu/Infloww" : "Desactivada de Blu/Infloww",
            date: r.changed_at,
            badge: r.new_state ? "alta" : "baja",
            leadSource: "creator" as const,
          }));
        }
      }
    },
  });

/** Detalle completo de un lead — usado por LeadDetailDialog que se
 *  abre cuando el user clickea una fila en el modal del dashboard.
 *  Trae TODOS los campos de la tabla source para mostrarlos en el popup.
 */
export const useLeadDetail = (
  source: "leadgen" | "scouter" | "creator" | undefined,
  id: string | null,
) =>
  useQuery({
    queryKey: ["lead-detail", source, id],
    enabled: !!source && !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, unknown> | null> => {
      if (!source || !id) return null;
      const table =
        source === "leadgen"
          ? "leadgen_entries"
          : source === "scouter"
            ? "scouter_leads"
            : "creators";
      const { data, error } = await sb
        .from(table)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

/** Mejor cerrador del rango: score compuesto 70% cierres + 30% avg QA.
 *  Devuelve null si no hay calls en el rango. */
export interface BestCloser {
  closerId: string;
  name: string;
  closes: number;
  avgScore: number; // 0-100
  composite: number; // 0-1, sólo para ranking interno
}

export const useBestCloser = (range: DashboardRange) =>
  useQuery({
    queryKey: ["best-closer", toIso(range.from), toIso(range.to)],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<BestCloser | null> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);
      let q = sb
        .from("qa_calls")
        .select("closer_id, claude_score, claude_analysis, closer:qa_closers(name)")
        .not("closer_id", "is", null);
      if (fromIso) q = q.gte("call_date", fromIso.slice(0, 10));
      if (toIsoVal) q = q.lte("call_date", toIsoVal.slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        closer_id: string;
        claude_score: number | null;
        claude_analysis: { call_outcome?: string } | null;
        closer: { name?: string } | null;
      }>;
      if (rows.length === 0) return null;

      const byCloser = new Map<
        string,
        { name: string; closes: number; scoreSum: number; scoreCount: number }
      >();
      for (const r of rows) {
        const entry = byCloser.get(r.closer_id) ?? {
          name: r.closer?.name ?? "(sin nombre)",
          closes: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
        if (r.claude_analysis?.call_outcome === "cerro") entry.closes += 1;
        if (typeof r.claude_score === "number") {
          entry.scoreSum += r.claude_score;
          entry.scoreCount += 1;
        }
        byCloser.set(r.closer_id, entry);
      }

      // Normalizar cierres contra el max del período para que ambas
      // dimensiones queden en [0,1]. Si nadie cerró, el ranking se
      // decide sólo por avg QA.
      const aggregated = Array.from(byCloser.entries()).map(([id, v]) => ({
        closerId: id,
        name: v.name,
        closes: v.closes,
        avgScore: v.scoreCount > 0 ? v.scoreSum / v.scoreCount : 0,
      }));
      const maxCloses = Math.max(1, ...aggregated.map((x) => x.closes));
      const ranked = aggregated
        .map((x) => ({
          ...x,
          composite: 0.7 * (x.closes / maxCloses) + 0.3 * (x.avgScore / 100),
        }))
        .sort((a, b) => b.composite - a.composite);
      return ranked[0] ?? null;
    },
  });

/** Marcar/desmarcar una creator como "ingresada al CRM externo". */
export const useMarkCreatorEnteredCrm = () => {
  return async (creatorId: string, mark: boolean, notes?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("No hay sesión activa");
    const updates = mark
      ? {
          entered_crm_at: new Date().toISOString(),
          entered_crm_by: user.id,
          entered_crm_notes: notes ?? null,
        }
      : {
          entered_crm_at: null,
          entered_crm_by: null,
          entered_crm_notes: null,
        };
    const { error } = await sb.from("creators").update(updates).eq("id", creatorId);
    if (error) throw error;
  };
};
