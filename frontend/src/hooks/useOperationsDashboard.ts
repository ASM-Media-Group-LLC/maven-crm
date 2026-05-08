import { useQuery } from "@tanstack/react-query";
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
  enteredCrm: number;      // Ingresada al CRM (creators.entered_crm_at)
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

/** KPIs del dashboard. Si from/to son undefined, sin filtro de fecha. */
export const useOperationsDashboard = (range: DashboardRange) =>
  useQuery({
    queryKey: ["ops-dashboard", toIso(range.from), toIso(range.to)],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<OperationsKpis> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIso(range.to);

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
      ]);

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
  /** Si está, la fila se vuelve clickable y navega a esa ruta. */
  linkUrl?: string;
  /** Si está, la fila abre LeadDetailDialog con la info completa
   *  de la fila desde la tabla source. */
  leadSource?: "leadgen" | "scouter" | "creator";
}

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
      const toIsoVal = toIso(range.to);

      const dateGte = (q: any, col: string) => (fromIso ? q.gte(col, fromIso) : q);
      const dateLte = (q: any, col: string) => (toIsoVal ? q.lte(col, toIsoVal) : q);

      const limit = 100;

      switch (metric) {
        case "contacted": {
          const q = sb
            .from("leadgen_entries")
            .select("id, model_handle, lg_user_id, phone_e164, status, created_at")
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
            .select("id, model_handle, phone_e164, status, created_at")
            .order("created_at", { ascending: false })
            .limit(50);
          const q2 = sb
            .from("scouter_leads")
            .select("id, instagram_handle, phone, status, first_scouter_contact_at")
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
            leadSource: "leadgen" as const,
          }));
          const bRows = (b ?? []).map((r: any) => ({
            id: r.id,
            primary: `@${r.instagram_handle ?? "?"}`,
            secondary: r.phone ? `📞 ${r.phone}` : "Sin número",
            date: r.first_scouter_contact_at,
            badge: "scouter",
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
            .select("id, instagram_handle")
            .not("instagram_handle", "is", null);
          const creatorByHandle = new Map<string, string>();
          for (const c of (creatorRows ?? []) as Array<{ id: string; instagram_handle: string }>) {
            const norm = c.instagram_handle
              .replace(/^@/, "")
              .toLowerCase()
              .trim();
            if (norm && !creatorByHandle.has(norm)) {
              creatorByHandle.set(norm, c.id);
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
            const matchedCreatorId = handleNorm
              ? creatorByHandle.get(handleNorm)
              : undefined;
            // Si encontramos un creator con ese handle, redirigimos el
            // click a su ficha técnica (creator profile). Si no, usamos
            // el sourceMap original — leadgen/scouter/creators apuntan
            // a sus tablas; closer_creators / closers_contacts sin
            // matching creator quedan sin click (leadSource undefined).
            const leadSource = matchedCreatorId
              ? ("creator" as const)
              : sourceMap[r.source_table];
            const id = matchedCreatorId ?? r.source_id;
            return {
              id,
              primary: `@${r.handle || "?"}`,
              secondary: `📞 ${r.phone}`,
              date: r.captured_at,
              badge: r.source_table,
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
              "id, call_date, closer:qa_closers(name), model:qa_models(name), claude_analysis",
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
            // Click → abre la página del detalle de la QA call
            // (AgencyQA usa ?callId=<id> para deeplinkear).
            linkUrl: `/agency-qa?callId=${r.id}`,
          }));
        }
        case "enteredCrm": {
          const q = sb
            .from("creators")
            .select("id, name, entered_crm_at, entered_crm_by, entered_crm_notes")
            .not("entered_crm_at", "is", null)
            .order("entered_crm_at", { ascending: false })
            .limit(limit);
          const { data, error } = await dateLte(
            dateGte(q, "entered_crm_at"),
            "entered_crm_at",
          );
          if (error) throw error;
          return (data ?? []).map((r: any) => ({
            id: r.id,
            primary: r.name ?? "(sin nombre)",
            secondary: r.entered_crm_notes ?? "",
            date: r.entered_crm_at,
            badge: "ingresada",
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
