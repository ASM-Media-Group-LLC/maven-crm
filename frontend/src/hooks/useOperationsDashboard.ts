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
  | "totalLeads"
  // Pool entero de descubrimiento (leadgen + scouter sin filtrar por
  // first_scouter_contact_at). Para el card "Total leads generados".
  // Distinto de totalLeads que solo cuenta los contactados.
  | "totalGenerated";

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
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OperationsKpis> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);

      // Una sola RPC en lugar de 10 queries paralelas. operations_dashboard_kpis
      // hace todas las counts server-side y devuelve un solo jsonb. Beneficios:
      //   · Un único round-trip a Supabase (vs 10 fetches HTTP).
      //   · Atómico — si falla, el error es claro (no partial data).
      //   · El planner agrega los counts en memoria más eficiente.
      const { data, error } = await (supabase as any).rpc("operations_dashboard_kpis", {
        p_from: fromIso,
        p_to: toIsoVal,
      });
      if (error) {
        console.error("operations_dashboard_kpis RPC failed:", error);
        throw error;
      }
      const k = (data ?? {}) as {
        contacted?: number;
        scouterContacts?: number;
        scouterGenerated?: number;
        numbersObtained?: number;
        closerCalls?: number;
        closes?: number;
        onHold?: number;
        rejections?: number;
        enteredCrm?: number;
        crmAltas?: number;
        crmBajas?: number;
      };

      return {
        contacted: k.contacted ?? 0,
        scouterContacts: k.scouterContacts ?? 0,
        scouterGenerated: k.scouterGenerated ?? 0,
        totalGenerated: (k.contacted ?? 0) + (k.scouterGenerated ?? 0),
        // llgWithPhone / scouterWithPhone se mantienen por compat de la
        // interfaz pero ya no se usan en el dashboard — la view dedupea
        // todo. Los reportamos como 0 para simplicidad.
        llgWithPhone: 0,
        scouterWithPhone: 0,
        numbersObtained: k.numbersObtained ?? 0,
        closerCalls: k.closerCalls ?? 0,
        closes: k.closes ?? 0,
        onHold: k.onHold ?? 0,
        rejections: k.rejections ?? 0,
        enteredCrm: k.enteredCrm ?? 0,
        crmAltas: k.crmAltas ?? 0,
        crmBajas: k.crmBajas ?? 0,
        totalLeads: (k.contacted ?? 0) + (k.scouterContacts ?? 0),
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

/** Result shape del popup: rows visibles (max 100) + el count real
 *  desde DB. El user reportó: "card dice 3174, popup solo muestra 50".
 *  Ahora el header del popup muestra el totalCount aunque rows tenga
 *  100 max — preserva el feedback visual sin hacer queries pesados. */
export interface MetricDetailsResult {
  rows: DetailRow[];
  totalCount: number;
}

/** Fetch de los items detrás de una métrica. Devuelve hasta 100 rows
 *  + count real para mostrar en el header. */
export const useMetricDetails = (
  metric: MetricKey,
  range: DashboardRange,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["ops-dashboard-details", metric, toIso(range.from), toIso(range.to)],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<MetricDetailsResult> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);

      const dateGte = (q: any, col: string) => (fromIso ? q.gte(col, fromIso) : q);
      const dateLte = (q: any, col: string) => (toIsoVal ? q.lte(col, toIsoVal) : q);

      const limit = 100;

      switch (metric) {
        case "contacted": {
          // Solo leadgen entries. category_code suele estar null →
          // enriquecemos con creators.category por handle matching.
          const countQ = sb.from("leadgen_entries").select("*", { count: "exact", head: true });
          const dataQ = sb
            .from("leadgen_entries")
            .select("id, model_handle, lg_user_id, phone_e164, status, category_code, created_at")
            .order("created_at", { ascending: false })
            .limit(limit);
          // Enrichment: leemos categoría de TRES tablas porque la
          // categorización pasa en distintos puntos del funnel.
          // Prioridad: creators (categoría final) > closer_creators
          // (closer asignó tier) > closers_contacts (raro pero existe).
          // El handle viene del row del card.
          const creatorsQ = sb
            .from("creators")
            .select("instagram_handle, category")
            .not("instagram_handle", "is", null)
            .not("category", "is", null);
          const closerCreatorsQ = sb
            .from("closer_creators")
            .select("model_handle, category_code")
            .not("model_handle", "is", null)
            .not("category_code", "is", null);
          const [countRes, dataRes, creatorsRes, closerRes] = await Promise.all([
            dateLte(dateGte(countQ, "created_at"), "created_at"),
            dateLte(dateGte(dataQ, "created_at"), "created_at"),
            creatorsQ,
            closerCreatorsQ,
          ]);
          if (dataRes.error) throw dataRes.error;
          const creatorCat = new Map<string, string>();
          for (const c of (creatorsRes.data ?? []) as Array<{ instagram_handle: string; category: string | null }>) {
            if (!c.category) continue;
            const norm = c.instagram_handle.replace(/^@/, "").toLowerCase().trim();
            if (norm && !creatorCat.has(norm)) creatorCat.set(norm, c.category);
          }
          // closer_creators tiene prioridad menor que creators (que
          // es categoría finalizada), pero mayor que el row source.
          for (const c of (closerRes.data ?? []) as Array<{ model_handle: string; category_code: string | null }>) {
            if (!c.category_code) continue;
            const norm = c.model_handle.replace(/^@/, "").toLowerCase().trim();
            if (norm && !creatorCat.has(norm)) creatorCat.set(norm, c.category_code);
          }
          return {
            totalCount: countRes.count ?? 0,
            rows: (dataRes.data ?? []).map((r: any) => {
              const handleNorm = (r.model_handle ?? "").toLowerCase().trim();
              const enriched = r.category_code ?? creatorCat.get(handleNorm);
              return {
                id: r.id,
                primary: `@${r.model_handle ?? "?"}`,
                secondary: r.phone_e164 ? `📞 ${r.phone_e164}` : "Sin número",
                date: r.created_at,
                badge: r.status,
                category: enriched ?? undefined,
                leadSource: "leadgen" as const,
              };
            }),
          };
        }
        case "totalLeads": {
          // Modelos contactadas = leadgen (todas) + scouter con
          // first_scouter_contact_at. leadgen.category_code suele
          // estar null, entonces ENRIQUECEMOS con creators.category
          // por handle matching (mismo approach que numbersObtained).
          const countQ1 = sb.from("leadgen_entries").select("*", { count: "exact", head: true });
          const countQ2 = sb
            .from("scouter_leads")
            .select("*", { count: "exact", head: true })
            .not("first_scouter_contact_at", "is", null);
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
          // Enrichment: leemos categoría de TRES tablas porque la
          // categorización pasa en distintos puntos del funnel.
          // Prioridad: creators (categoría final) > closer_creators
          // (closer asignó tier) > closers_contacts (raro pero existe).
          // El handle viene del row del card.
          const creatorsQ = sb
            .from("creators")
            .select("instagram_handle, category")
            .not("instagram_handle", "is", null)
            .not("category", "is", null);
          const closerCreatorsQ = sb
            .from("closer_creators")
            .select("model_handle, category_code")
            .not("model_handle", "is", null)
            .not("category_code", "is", null);
          const [c1, c2, a, b, creatorsRes, closerRes] = await Promise.all([
            dateLte(dateGte(countQ1, "created_at"), "created_at"),
            dateLte(dateGte(countQ2, "first_scouter_contact_at"), "first_scouter_contact_at"),
            dateLte(dateGte(q1, "created_at"), "created_at"),
            dateLte(dateGte(q2, "first_scouter_contact_at"), "first_scouter_contact_at"),
            creatorsQ,
            closerCreatorsQ,
          ]);
          const creatorCat = new Map<string, string>();
          for (const c of (creatorsRes.data ?? []) as Array<{ instagram_handle: string; category: string | null }>) {
            if (!c.category) continue;
            const norm = c.instagram_handle.replace(/^@/, "").toLowerCase().trim();
            if (norm && !creatorCat.has(norm)) creatorCat.set(norm, c.category);
          }
          for (const c of (closerRes.data ?? []) as Array<{ model_handle: string; category_code: string | null }>) {
            if (!c.category_code) continue;
            const norm = c.model_handle.replace(/^@/, "").toLowerCase().trim();
            if (norm && !creatorCat.has(norm)) creatorCat.set(norm, c.category_code);
          }
          const aRows = (a.data ?? []).map((r: any) => {
            const handleNorm = (r.model_handle ?? "").toLowerCase().trim();
            const enriched = r.category_code ?? creatorCat.get(handleNorm);
            return {
              id: r.id,
              primary: `@${r.model_handle ?? "?"}`,
              secondary: r.phone_e164 ? `📞 ${r.phone_e164}` : "Sin número",
              date: r.created_at,
              badge: "leadgen",
              category: enriched ?? undefined,
              leadSource: "leadgen" as const,
            };
          });
          const bRows = (b.data ?? []).map((r: any) => {
            const handleNorm = (r.instagram_handle ?? "").toLowerCase().trim();
            const enriched = r.category ?? creatorCat.get(handleNorm);
            return {
              id: r.id,
              primary: `@${r.instagram_handle ?? "?"}`,
              secondary: r.phone ? `📞 ${r.phone}` : "Sin número",
              date: r.first_scouter_contact_at,
              badge: "scouter",
              category: enriched ?? undefined,
              leadSource: "scouter" as const,
            };
          });
          return {
            totalCount: (c1.count ?? 0) + (c2.count ?? 0),
            rows: [...aRows, ...bRows].sort((x, y) =>
              (y.date ?? "") < (x.date ?? "") ? -1 : 1,
            ),
          };
        }
        case "numbersObtained": {
          // Count exacto + fetch limit 100.
          const countQ = sb
            .from("v_model_phone_captures")
            .select("*", { count: "exact", head: true });
          const q = sb
            .from("v_model_phone_captures")
            .select("source_table, source_id, handle, phone, captured_at")
            .order("captured_at", { ascending: false })
            .limit(limit);
          const [countRes, dataRes] = await Promise.all([
            dateLte(dateGte(countQ, "captured_at"), "captured_at"),
            dateLte(dateGte(q, "captured_at"), "captured_at"),
          ]);
          if (dataRes.error) throw dataRes.error;
          const data = dataRes.data;
          const totalCount = countRes.count ?? 0;
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
          return {
            totalCount,
            rows: (data ?? []).map((r: any) => {
              const handleNorm = (r.handle || "").toLowerCase().trim();
              const match = handleNorm
                ? creatorByHandle.get(handleNorm)
                : undefined;
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
            }),
          };
        }
        case "closerCalls":
        case "closes":
        case "onHold":
        case "rejections": {
          // Build count + data queries con el mismo filtro de outcome.
          const buildQ = (mode: "count" | "data") => {
            let q = sb.from("qa_calls");
            q = mode === "count"
              ? q.select("*", { count: "exact", head: true })
              : q.select(
                  "id, call_date, closer:qa_closers(name), model:qa_models(name, category), claude_analysis",
                ).order("call_date", { ascending: false }).limit(limit);
            if (metric === "closes")
              q = q.eq("claude_analysis->>call_outcome", "cerro");
            if (metric === "onHold")
              q = q.eq("claude_analysis->>call_outcome", "en_espera");
            if (metric === "rejections")
              q = q.eq("claude_analysis->>call_outcome", "no_cerro");
            return q;
          };
          const [countRes, dataRes] = await Promise.all([
            dateLte(dateGte(buildQ("count"), "call_date"), "call_date"),
            dateLte(dateGte(buildQ("data"), "call_date"), "call_date"),
          ]);
          if (dataRes.error) throw dataRes.error;
          return {
            totalCount: countRes.count ?? 0,
            rows: (dataRes.data ?? []).map((r: any) => ({
              id: r.id,
              primary: r.model?.name ?? "Modelo",
              secondary: r.closer?.name
                ? `Closer: ${r.closer.name}`
                : "Closer: ?",
              date: r.call_date,
              badge: r.claude_analysis?.call_outcome ?? "—",
              category: r.model?.category ?? undefined,
              linkUrl: `/agency-qa?callId=${r.id}`,
            })),
          };
        }
        case "enteredCrm": {
          const countQ = sb
            .from("creator_blu_history")
            .select("*", { count: "exact", head: true });
          const q = sb
            .from("creator_blu_history")
            .select("id, creator_id, new_state, changed_at, creator:creators(name, category)")
            .order("changed_at", { ascending: false })
            .limit(limit);
          const [countRes, dataRes] = await Promise.all([
            dateLte(dateGte(countQ, "changed_at"), "changed_at"),
            dateLte(dateGte(q, "changed_at"), "changed_at"),
          ]);
          if (dataRes.error) throw dataRes.error;
          return {
            totalCount: countRes.count ?? 0,
            rows: (dataRes.data ?? []).map((r: any) => ({
              id: r.creator_id,
              primary: r.creator?.name ?? "(sin nombre)",
              secondary: r.new_state ? "Activada en Blu/Infloww" : "Desactivada de Blu/Infloww",
              date: r.changed_at,
              badge: r.new_state ? "alta" : "baja",
              category: r.creator?.category ?? undefined,
              leadSource: "creator" as const,
            })),
          };
        }
        case "totalGenerated": {
          // Pool ENTERO de descubrimiento: leadgen (todas las rows) +
          // scouter_leads (TODAS, no solo las contactadas). Enriquece
          // con creators.category por handle matching (igual que
          // numbersObtained y totalLeads).
          const countQ1 = sb.from("leadgen_entries").select("*", { count: "exact", head: true });
          const countQ2 = sb.from("scouter_leads").select("*", { count: "exact", head: true });
          const q1 = sb
            .from("leadgen_entries")
            .select("id, model_handle, phone_e164, status, category_code, created_at")
            .order("created_at", { ascending: false })
            .limit(50);
          const q2 = sb
            .from("scouter_leads")
            .select("id, instagram_handle, phone, status, category, created_at")
            .order("created_at", { ascending: false })
            .limit(50);
          // Enrichment: leemos categoría de TRES tablas porque la
          // categorización pasa en distintos puntos del funnel.
          // Prioridad: creators (categoría final) > closer_creators
          // (closer asignó tier) > closers_contacts (raro pero existe).
          // El handle viene del row del card.
          const creatorsQ = sb
            .from("creators")
            .select("instagram_handle, category")
            .not("instagram_handle", "is", null)
            .not("category", "is", null);
          const closerCreatorsQ = sb
            .from("closer_creators")
            .select("model_handle, category_code")
            .not("model_handle", "is", null)
            .not("category_code", "is", null);
          const [c1, c2, a, b, creatorsRes] = await Promise.all([
            dateLte(dateGte(countQ1, "created_at"), "created_at"),
            dateLte(dateGte(countQ2, "created_at"), "created_at"),
            dateLte(dateGte(q1, "created_at"), "created_at"),
            dateLte(dateGte(q2, "created_at"), "created_at"),
            creatorsQ,
          ]);
          const creatorCat = new Map<string, string>();
          for (const c of (creatorsRes.data ?? []) as Array<{ instagram_handle: string; category: string | null }>) {
            if (!c.category) continue;
            const norm = c.instagram_handle.replace(/^@/, "").toLowerCase().trim();
            if (norm && !creatorCat.has(norm)) creatorCat.set(norm, c.category);
          }
          const aRows = (a.data ?? []).map((r: any) => {
            const handleNorm = (r.model_handle ?? "").toLowerCase().trim();
            const enriched = r.category_code ?? creatorCat.get(handleNorm);
            return {
              id: r.id,
              primary: `@${r.model_handle ?? "?"}`,
              secondary: r.phone_e164 ? `📞 ${r.phone_e164}` : "Sin número",
              date: r.created_at,
              badge: "leadgen",
              category: enriched ?? undefined,
              leadSource: "leadgen" as const,
            };
          });
          const bRows = (b.data ?? []).map((r: any) => {
            const handleNorm = (r.instagram_handle ?? "").toLowerCase().trim();
            const enriched = r.category ?? creatorCat.get(handleNorm);
            return {
              id: r.id,
              primary: `@${r.instagram_handle ?? "?"}`,
              secondary: r.phone ? `📞 ${r.phone}` : "Sin número",
              date: r.created_at,
              badge: "scouter",
              category: enriched ?? undefined,
              leadSource: "scouter" as const,
            };
          });
          return {
            totalCount: (c1.count ?? 0) + (c2.count ?? 0),
            rows: [...aRows, ...bRows].sort((x, y) =>
              (y.date ?? "") < (x.date ?? "") ? -1 : 1,
            ),
          };
        }
      }
      // Fallback - shouldn't reach here pero TS lo necesita.
      return { rows: [], totalCount: 0 };
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
  totalCalls: number;       // total de qa_calls hechas por el closer
  closes: number;           // calls con outcome=cerro
  successRate: number;      // closes / totalCalls (0-1)
  avgScore: number;         // 0-100 (avg de claude_score)
  composite: number;        // 0-1, sólo para ranking interno
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
        { name: string; totalCalls: number; closes: number; scoreSum: number; scoreCount: number }
      >();
      for (const r of rows) {
        const entry = byCloser.get(r.closer_id) ?? {
          name: r.closer?.name ?? "(sin nombre)",
          totalCalls: 0,
          closes: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
        entry.totalCalls += 1;
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
        totalCalls: v.totalCalls,
        closes: v.closes,
        successRate: v.totalCalls > 0 ? v.closes / v.totalCalls : 0,
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

/** Hall of fame mensual — mejor cerrador de cada mes desde MIN_MONTH.
 *  Misma fórmula que useBestCloser (70% cierres + 30% calif QA) pero
 *  un row por mes. Solo cuenta desde 2026-05 (el ranking se lanzó ahí —
 *  no traemos meses anteriores aunque haya data). */
export interface BestCloserByMonth {
  month: string; // YYYY-MM
  monthLabel: string; // "Mayo 2026"
  winner: BestCloser | null;
}

const MIN_MONTH = "2026-05"; // ranking arranca acá. NO traer meses previos.

const MONTH_LABELS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const useBestCloserByMonth = () =>
  useQuery({
    queryKey: ["best-closer-by-month"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BestCloserByMonth[]> => {
      // Trae todas las calls con closer asignado desde MIN_MONTH-01.
      const since = `${MIN_MONTH}-01`;
      const { data, error } = await sb
        .from("qa_calls")
        .select("closer_id, call_date, claude_score, claude_analysis, closer:qa_closers(name)")
        .not("closer_id", "is", null)
        .gte("call_date", since);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        closer_id: string;
        call_date: string;
        claude_score: number | null;
        claude_analysis: { call_outcome?: string } | null;
        closer: { name?: string } | null;
      }>;

      // Agrupa por (month, closer) y dentro de cada mes calcula el
      // composite igual que useBestCloser.
      const byMonth = new Map<
        string,
        Map<string, { name: string; totalCalls: number; closes: number; scoreSum: number; scoreCount: number }>
      >();
      for (const r of rows) {
        const month = (r.call_date || "").slice(0, 7); // YYYY-MM
        if (!month || month < MIN_MONTH) continue;
        const closers = byMonth.get(month) ?? new Map();
        const entry = closers.get(r.closer_id) ?? {
          name: r.closer?.name ?? "(sin nombre)",
          totalCalls: 0,
          closes: 0,
          scoreSum: 0,
          scoreCount: 0,
        };
        entry.totalCalls += 1;
        if (r.claude_analysis?.call_outcome === "cerro") entry.closes += 1;
        if (typeof r.claude_score === "number") {
          entry.scoreSum += r.claude_score;
          entry.scoreCount += 1;
        }
        closers.set(r.closer_id, entry);
        byMonth.set(month, closers);
      }

      const result: BestCloserByMonth[] = [];
      for (const [month, closers] of byMonth.entries()) {
        const aggregated = Array.from(closers.entries()).map(([id, v]) => ({
          closerId: id,
          name: v.name,
          totalCalls: v.totalCalls,
          closes: v.closes,
          successRate: v.totalCalls > 0 ? v.closes / v.totalCalls : 0,
          avgScore: v.scoreCount > 0 ? v.scoreSum / v.scoreCount : 0,
        }));
        const maxCloses = Math.max(1, ...aggregated.map((x) => x.closes));
        const ranked = aggregated
          .map((x) => ({
            ...x,
            composite: 0.7 * (x.closes / maxCloses) + 0.3 * (x.avgScore / 100),
          }))
          .sort((a, b) => b.composite - a.composite);
        const [year, m] = month.split("-");
        const monthLabel = `${MONTH_LABELS_ES[parseInt(m, 10) - 1]} ${year}`;
        result.push({
          month,
          monthLabel,
          winner: ranked[0] ?? null,
        });
      }
      // Ordena del mes más reciente al más viejo.
      result.sort((a, b) => (a.month < b.month ? 1 : -1));
      return result;
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
