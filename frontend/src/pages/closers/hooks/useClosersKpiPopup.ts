import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { SALE_PLATFORMS } from "./useCloserLeads";

// Datos para los popups de los KPI cards en closers/dashboard.
//
// Pipeline KPIs (total + asignadas/confirmadas/completadas/cerradas/
// no_interesadas) se devuelven AGRUPADOS:
//   · total → grupos por stage (Asignada → Confirmada → Completada →
//     No interesada).
//   · resto → grupos por closer (agent_name) — "quién tiene cuántas".
//
// Revenue KPIs van planos por ahora (un solo grupo).
//
// El popup ClosersKpiDetailDialog expande solo el primer grupo por
// default — igual que Panel de Control.

export type ClosersKpiPopupState =
  | { kind: "pipeline"; key: "total" | "asignadas" | "confirmadas" | "completadas" | "cerradas" | "no_interesadas" }
  | { kind: "revenue"; platform: string };

export interface ClosersKpiPopupRow {
  id: string;
  primary: string;
  secondary?: string;
  badge?: string;
  amount?: string;
  date?: string | null;
}

export interface ClosersKpiPopupGroup {
  cat: string;
  count: number;
  rows: ClosersKpiPopupRow[];
}

export interface ClosersKpiPopupResult {
  mode: "grouped" | "flat";
  groups: ClosersKpiPopupGroup[];
  totalCount: number;
}

const STAGE_BY_KEY: Record<string, string[] | null> = {
  total: null,
  asignadas: ["Asignada"],
  confirmadas: ["Confirmada"],
  completadas: ["Completada"],
  cerradas: ["Confirmada", "Completada"],
  no_interesadas: ["No interesada"],
};

const STAGE_ORDER: string[] = ["Asignada", "Confirmada", "Completada", "No interesada"];

// Del catálogo vigente + Trafix, que ya no se vende pero tiene ventas viejas
// clickeables en el desglose. Se deriva de SALE_PLATFORMS para que no vuelva a
// quedar desincronizado con el selector de ventas.
const PLATFORM_KEYS: string[] = [...SALE_PLATFORMS, "Trafix"];

const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString("es")}`;

type CreatorRow = {
  id: string;
  instagram_handle: string | null;
  stage: string | null;
  assigned_to: string | null;
  estimated_monetization: number | string | null;
  created_at: string | null;
};

export function useClosersKpiPopup(
  state: ClosersKpiPopupState | null,
  opts?: { dateFrom?: Date; dateTo?: Date; dateField?: string; viewAsCloserId?: string | null },
) {
  const { user } = useAuth();
  const { isAdmin, isManager, isSupervisor, role } = useUserRole();
  const userId = user?.id;

  const { dateFrom, dateTo, dateField, viewAsCloserId } = opts ?? {};
  const applyCreatorDate = dateField === "passed_date" && !!dateFrom && !!dateTo;
  const applySalesDate = !!dateFrom && !!dateTo;
  // Cuando el admin está viendo "como" un closer, ignoramos privilegios
  // y forzamos assigned_to = viewAsCloserId.
  const effectiveIsAdmin = viewAsCloserId ? false : isAdmin;
  const effectiveIsManager = viewAsCloserId ? false : isManager;
  const effectiveIsSupervisor = viewAsCloserId ? false : isSupervisor;
  const effectiveUserId = viewAsCloserId ?? userId;
  // Ve todo el pipeline: admin/manager/supervisor (incluye Team Leader).
  const canSeeAll = effectiveIsAdmin || effectiveIsManager || effectiveIsSupervisor;

  // Mismo alcance que el listado de Operaciones: un Closer Supervisor no ve las
  // filas de sus PARES. Sin esto, el popup de un KPI listaba leads que el listado
  // de abajo ya no muestra (y el conteo del card no cuadraba con el detalle).
  const { data: scopeAgentIds = null } = useQuery({
    queryKey: ["closer-scope-agents", userId, role],
    enabled: !!userId && role === "Closer Supervisor" && !viewAsCloserId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("closer_scope_agent_ids");
      if (error) throw error;
      return (data as string[] | null) ?? null;
    },
  });
  const scopeByAgent = (q: any) => {
    if (!canSeeAll && effectiveUserId) return q.eq("assigned_to", effectiveUserId);
    if (scopeAgentIds && scopeAgentIds.length > 0) {
      return q.or(`assigned_to.in.(${scopeAgentIds.join(",")}),assigned_to.is.null`);
    }
    return q;
  };
  // Mismo token de alcance que useCloserLeads: sin él, si el popup abre antes de
  // que scopeAgentIds resuelva, muestra el detalle SIN alcance y no se refetchea
  // al resolver (su key no cambia). Ver la nota extensa en useCloserLeads.
  const scopeKey =
    role === "Closer Supervisor" && !viewAsCloserId
      ? (scopeAgentIds ? `sc:${scopeAgentIds.join(",")}` : "sc:pending")
      : "sc:none";

  return useQuery<ClosersKpiPopupResult>({
    queryKey: ["closers-kpi-popup", state, userId, role, scopeKey, applyCreatorDate ? dateFrom?.toISOString() : null, applyCreatorDate ? dateTo?.toISOString() : null, applySalesDate ? "sales" : null, viewAsCloserId ?? null],
    enabled: !!state && !!userId && !!role,
    staleTime: 30_000,
    queryFn: async (): Promise<ClosersKpiPopupResult> => {
      if (!state) return { mode: "flat", groups: [], totalCount: 0 };

      // ── PIPELINE ──
      if (state.kind === "pipeline") {
        const stages = STAGE_BY_KEY[state.key];
        // Paginado: closer_creators ya pasa las 1000 filas (cap PostgREST). Sin
        // paginar, el popup de 'No interesadas' (1838) salía truncado a ~1000.
        const rows = (await fetchAllRows((from, to) => {
          let q = supabase
            .from("closer_creators")
            .select("id, instagram_handle, stage, assigned_to, estimated_monetization, created_at, passed_date")
            .order("created_at", { ascending: false })
            .order("id", { ascending: true });
          if (stages && stages.length > 0) {
            q = stages.length === 1 ? q.eq("stage", stages[0]) : q.in("stage", stages);
          }
          q = scopeByAgent(q);
          if (applyCreatorDate) {
            const fromStr = dateFrom!.toISOString().split("T")[0];
            const toStr = dateTo!.toISOString().split("T")[0];
            q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
          }
          return q.range(from, to);
        })) as CreatorRow[];

        // Resolver nombres de agentes.
        const agentIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))] as string[];
        const nameMap: Record<string, string> = {};
        if (agentIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", agentIds);
          for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
            nameMap[p.id] = p.full_name || "Sin nombre";
          }
        }

        const toRow = (r: CreatorRow): ClosersKpiPopupRow => ({
          id: r.id,
          primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
          secondary: r.assigned_to ? nameMap[r.assigned_to] ?? "Sin asignar" : "Sin asignar",
          badge: r.stage ?? undefined,
          date: r.created_at,
        });

        // total → agrupar por stage
        if (state.key === "total") {
          const byStage = new Map<string, CreatorRow[]>();
          for (const r of rows) {
            const s = r.stage ?? "Sin stage";
            const arr = byStage.get(s) ?? [];
            arr.push(r);
            byStage.set(s, arr);
          }
          const sortedStages = Array.from(byStage.keys()).sort((a, b) => {
            const sa = STAGE_ORDER.indexOf(a);
            const sb = STAGE_ORDER.indexOf(b);
            return (sa === -1 ? 999 : sa) - (sb === -1 ? 999 : sb);
          });
          return {
            mode: "grouped",
            totalCount: rows.length,
            groups: sortedStages.map((stage) => {
              const stageRows = byStage.get(stage)!;
              return {
                cat: stage,
                count: stageRows.length,
                rows: stageRows.map(toRow),
              };
            }),
          };
        }

        // Resto del pipeline → agrupar por closer.
        const byCloser = new Map<string, CreatorRow[]>();
        for (const r of rows) {
          const closer = r.assigned_to ? nameMap[r.assigned_to] ?? "Sin asignar" : "Sin asignar";
          const arr = byCloser.get(closer) ?? [];
          arr.push(r);
          byCloser.set(closer, arr);
        }
        // Ordenar por count desc; "Sin asignar" al final.
        const sortedClosers = Array.from(byCloser.keys()).sort((a, b) => {
          if (a === "Sin asignar") return 1;
          if (b === "Sin asignar") return -1;
          return byCloser.get(b)!.length - byCloser.get(a)!.length;
        });
        return {
          mode: "grouped",
          totalCount: rows.length,
          groups: sortedClosers.map((closer) => {
            const closerRows = byCloser.get(closer)!;
            return {
              cat: closer,
              count: closerRows.length,
              rows: closerRows.map((r) => ({
                ...toRow(r),
                // Dentro del grupo del closer, secondary muestra stage en vez del agente repetido.
                secondary: r.stage ?? "Sin stage",
                badge: undefined,
              })),
            };
          }),
        };
      }

      // ── REVENUE ── (flat por ahora)
      const platform = state.platform;

      // Ventas de plataforma registradas por el CARRITO (pipeline). Mismos
      // filtros que la card "Rev. Plataformas" de ClosersKPICards: si acá
      // divergen, el popup muestra un total distinto al de la card.
      // `onlyPlatform` usa ilike (igualdad case-insensitive) porque el mismo
      // producto está escrito de dos formas según la fila ("Piclink"/"PicLink").
      const fetchPipelinePlatformRows = async (onlyPlatform?: string): Promise<ClosersKpiPopupRow[]> => {
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, subscription_amount, main_platform, stage, passed_date")
          .eq("deal_type", "venta_plataforma")
          .neq("lead_source", "agencia")
          .in("stage", ["Completada", "Confirmada"]);
        if (onlyPlatform) q = q.ilike("main_platform", onlyPlatform);
        q = viewAsCloserId ? q.eq("assigned_to", viewAsCloserId) : scopeByAgent(q);
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? [])
          .map((r: any) => ({
            id: r.id,
            primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
            secondary: [r.main_platform, r.stage].filter(Boolean).join(" · "),
            amount: fmtMoney(Number(r.subscription_amount || 0)),
            _sort: Number(r.subscription_amount || 0),
          }))
          .sort((a, b) => b._sort - a._sort)
          .map(({ _sort, ...row }) => row);
      };

      if (platform === "Rev. OnlyFans") {
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, estimated_monetization, stage, passed_date")
          .in("stage", ["Completada", "Confirmada"])
          // Mismos filtros que la CARD de Rev. OnlyFans (línea Kash). Sin esto el
          // detalle listaba filas que no suman en el número de arriba.
          .eq("deal_type", "reclutamiento")
          .neq("lead_source", "agencia")
          .gt("estimated_monetization", 0)
          .order("estimated_monetization", { ascending: false });
        q = viewAsCloserId ? q.eq("assigned_to", viewAsCloserId) : scopeByAgent(q);
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        const { data, error } = await q;
        if (error) throw error;
        const rows: ClosersKpiPopupRow[] = (data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
          secondary: r.stage,
          amount: fmtMoney(Number(r.estimated_monetization)),
        }));
        return { mode: "flat", totalCount: rows.length, groups: [{ cat: "", count: rows.length, rows }] };
      }

      // Suscripciones (creadoras propias) y Agencias (B2B). Faltaban las dos:
      // "Rev. Suscripciones" existe desde que hay venta de plataformas y al
      // clickearla el popup no listaba NADA porque ninguna rama la matcheaba;
      // "Rev. Agencias" es nueva. Ambas se miden por subscription_amount, no por
      // estimated_monetization (que en estos deals es 0).
      if (platform === "Rev. Suscripciones" || platform === "Rev. Agencias") {
        const esAgencia = platform === "Rev. Agencias";
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, subscription_amount, main_platform, stage, passed_date")
          .eq("deal_type", "venta_plataforma")
          .in("stage", ["Completada", "Confirmada"])
          .order("subscription_amount", { ascending: false });
        q = esAgencia ? q.eq("lead_source", "agencia") : q.neq("lead_source", "agencia");
        q = viewAsCloserId ? q.eq("assigned_to", viewAsCloserId) : scopeByAgent(q);
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          q = q.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        const { data, error } = await q;
        if (error) throw error;
        const rows: ClosersKpiPopupRow[] = (data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
          secondary: [r.main_platform, r.stage].filter(Boolean).join(" · "),
          amount: fmtMoney(Number(r.subscription_amount || 0)),
        }));
        return { mode: "flat", totalCount: rows.length, groups: [{ cat: "", count: rows.length, rows }] };
      }

      if (platform === "Rev. Plataformas") {
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
        const byCreator: Record<string, { total: number; platforms: string[] }> = {};
        for (const r of (data ?? []) as Array<{ creator_id: string; platform: string; price: number | string }>) {
          if (!byCreator[r.creator_id]) byCreator[r.creator_id] = { total: 0, platforms: [] };
          byCreator[r.creator_id].total += Number(r.price || 0);
          if (!byCreator[r.creator_id].platforms.includes(r.platform)) {
            byCreator[r.creator_id].platforms.push(r.platform);
          }
        }
        const creatorIds = Object.keys(byCreator);
        const handleMap: Record<string, string> = {};
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from("closer_creators")
            .select("id, instagram_handle")
            .in("id", creatorIds);
          for (const c of (creators ?? []) as Array<{ id: string; instagram_handle: string | null }>) {
            handleMap[c.id] = c.instagram_handle ? `@${c.instagram_handle}` : "Sin handle";
          }
        }
        const rows: ClosersKpiPopupRow[] = Object.entries(byCreator)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([cid, v]) => ({
            id: cid,
            primary: handleMap[cid] ?? "Sin handle",
            secondary: v.platforms.join(", "),
            amount: fmtMoney(v.total),
          }));
        // Las ventas registradas por el CARRITO viven en el pipeline, no en
        // closer_platform_sales. La card las suma, así que el detalle también
        // tiene que listarlas o el popup no cuadra con el monto de arriba.
        const pipelineRows = await fetchPipelinePlatformRows();
        const allRows = [...rows, ...pipelineRows];
        return { mode: "flat", totalCount: allRows.length, groups: [{ cat: "", count: allRows.length, rows: allRows }] };
      }

      if (platform === "Rev. Total") {
        let salesQ = viewAsCloserId
          ? supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at, closer_creators!inner(assigned_to)")
              .eq("closer_creators.assigned_to", viewAsCloserId)
          : supabase.from("closer_platform_sales").select("creator_id, price, created_at");
        // Rev. Total = OF (reclutamiento) + plataformas + agencias. Antes sólo
        // leía estimated_monetization, que en los deals de venta es 0 → las
        // ventas de plataforma y las agencias no aparecían en el detalle aunque
        // sí estaban en el monto de la card.
        let ofQ = supabase
          .from("closer_creators")
          .select("id, instagram_handle, estimated_monetization, subscription_amount, deal_type, lead_source, stage, passed_date")
          .in("stage", ["Completada", "Confirmada"]);
        if (viewAsCloserId) {
          ofQ = ofQ.eq("assigned_to", viewAsCloserId);
        }
        if (applySalesDate) {
          salesQ = salesQ.gte("created_at", dateFrom!.toISOString()).lte("created_at", dateTo!.toISOString());
        }
        if (applyCreatorDate) {
          const fromStr = dateFrom!.toISOString().split("T")[0];
          const toStr = dateTo!.toISOString().split("T")[0];
          ofQ = ofQ.gte("passed_date", fromStr).lte("passed_date", toStr);
        }
        const [salesRes, ofRes] = await Promise.all([salesQ, ofQ]);
        if (salesRes.error) throw salesRes.error;
        if (ofRes.error) throw ofRes.error;
        const byCreator: Record<string, number> = {};
        for (const r of (salesRes.data ?? []) as Array<{ creator_id: string; price: number | string }>) {
          byCreator[r.creator_id] = (byCreator[r.creator_id] || 0) + Number(r.price || 0);
        }
        const handleMap: Record<string, string> = {};
        for (const c of (ofRes.data ?? []) as unknown as Array<{
          id: string;
          instagram_handle: string | null;
          estimated_monetization: number | string;
          subscription_amount: number | string | null;
          deal_type: string | null;
          lead_source: string | null;
        }>) {
          // Cada línea factura por un campo distinto: reclutamiento por
          // estimated_monetization, venta de plataforma y agencias por
          // subscription_amount.
          const amount =
            c.deal_type === "venta_plataforma"
              ? Number(c.subscription_amount || 0)
              : c.lead_source === "agencia"
                ? 0
                : Number(c.estimated_monetization || 0);
          byCreator[c.id] = (byCreator[c.id] || 0) + amount;
          handleMap[c.id] = c.instagram_handle ? `@${c.instagram_handle}` : "Sin handle";
        }
        const missingIds = Object.keys(byCreator).filter((id) => !(id in handleMap));
        if (missingIds.length > 0) {
          const { data: extra } = await supabase
            .from("closer_creators")
            .select("id, instagram_handle")
            .in("id", missingIds);
          for (const c of (extra ?? []) as Array<{ id: string; instagram_handle: string | null }>) {
            handleMap[c.id] = c.instagram_handle ? `@${c.instagram_handle}` : "Sin handle";
          }
        }
        const rows: ClosersKpiPopupRow[] = Object.entries(byCreator)
          .filter(([, total]) => total > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([cid, total]) => ({
            id: cid,
            primary: handleMap[cid] ?? "Sin handle",
            amount: fmtMoney(total),
          }));
        return { mode: "flat", totalCount: rows.length, groups: [{ cat: "", count: rows.length, rows }] };
      }

      // Clic en una barra del desglose "por plataforma". El desglose se arma con
      // los datos, así que acá puede llegar cualquier nombre de plataforma —
      // incluida una que no esté en PLATFORM_KEYS. Se descarta sólo lo que ya
      // matcheó una rama de label ("Rev. …"), que retornó más arriba.
      if (PLATFORM_KEYS.includes(platform) || !platform.startsWith("Rev. ")) {
        let q = viewAsCloserId
          ? supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at, closer_creators!inner(assigned_to)")
              .ilike("platform", platform)
              .eq("closer_creators.assigned_to", viewAsCloserId)
          : supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at")
              .ilike("platform", platform);
        if (applySalesDate) {
          q = q.gte("created_at", dateFrom!.toISOString()).lte("created_at", dateTo!.toISOString());
        }
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as Array<{ creator_id: string; price: number | string }>;
        const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
        const handleMap: Record<string, string> = {};
        if (creatorIds.length > 0) {
          const { data: creators } = await supabase
            .from("closer_creators")
            .select("id, instagram_handle")
            .in("id", creatorIds);
          for (const c of (creators ?? []) as Array<{ id: string; instagram_handle: string | null }>) {
            handleMap[c.id] = c.instagram_handle ? `@${c.instagram_handle}` : "Sin handle";
          }
        }
        const sortedRows: ClosersKpiPopupRow[] = rows
          .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
          .map((r, idx) => ({
            id: `${r.creator_id}-${idx}`,
            primary: handleMap[r.creator_id] ?? "Sin handle",
            amount: fmtMoney(Number(r.price || 0)),
          }));
        // + las ventas de esa misma plataforma hechas por el carrito.
        const pipelineRows = await fetchPipelinePlatformRows(platform);
        const allRows = [...sortedRows, ...pipelineRows];
        return { mode: "flat", totalCount: allRows.length, groups: [{ cat: "", count: allRows.length, rows: allRows }] };
      }

      return { mode: "flat", groups: [], totalCount: 0 };
    },
  });
}
