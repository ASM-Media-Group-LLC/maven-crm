import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

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

const PLATFORM_KEYS = ["Trafix", "Blu", "Piclink", "Content Protector", "ORA"];

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

  return useQuery<ClosersKpiPopupResult>({
    queryKey: ["closers-kpi-popup", state, userId, role, applyCreatorDate ? dateFrom?.toISOString() : null, applyCreatorDate ? dateTo?.toISOString() : null, applySalesDate ? "sales" : null, viewAsCloserId ?? null],
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
          if (!canSeeAll && effectiveUserId) {
            q = q.eq("assigned_to", effectiveUserId);
          }
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

      if (platform === "Rev. OnlyFans") {
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, estimated_monetization, stage, passed_date")
          .in("stage", ["Completada", "Confirmada"])
          .gt("estimated_monetization", 0)
          .order("estimated_monetization", { ascending: false });
        if (viewAsCloserId) {
          q = q.eq("assigned_to", viewAsCloserId);
        }
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
        return { mode: "flat", totalCount: rows.length, groups: [{ cat: "", count: rows.length, rows }] };
      }

      if (platform === "Rev. Total") {
        let salesQ = viewAsCloserId
          ? supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at, closer_creators!inner(assigned_to)")
              .eq("closer_creators.assigned_to", viewAsCloserId)
          : supabase.from("closer_platform_sales").select("creator_id, price, created_at");
        let ofQ = supabase
          .from("closer_creators")
          .select("id, instagram_handle, estimated_monetization, stage, passed_date")
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
        for (const c of (ofRes.data ?? []) as Array<{ id: string; instagram_handle: string | null; estimated_monetization: number | string }>) {
          byCreator[c.id] = (byCreator[c.id] || 0) + Number(c.estimated_monetization || 0);
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

      if (PLATFORM_KEYS.includes(platform)) {
        let q = viewAsCloserId
          ? supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at, closer_creators!inner(assigned_to)")
              .eq("platform", platform)
              .eq("closer_creators.assigned_to", viewAsCloserId)
          : supabase
              .from("closer_platform_sales")
              .select("creator_id, price, created_at")
              .eq("platform", platform);
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
        return { mode: "flat", totalCount: sortedRows.length, groups: [{ cat: "", count: sortedRows.length, rows: sortedRows }] };
      }

      return { mode: "flat", groups: [], totalCount: 0 };
    },
  });
}
