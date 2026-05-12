import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

const PLATFORM_KEYS = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"];

const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString("es")}`;

type CreatorRow = {
  id: string;
  instagram_handle: string | null;
  stage: string | null;
  assigned_to: string | null;
  estimated_monetization: number | string | null;
  created_at: string | null;
};

export function useClosersKpiPopup(state: ClosersKpiPopupState | null) {
  const { user } = useAuth();
  const { isAdmin, isManager, role } = useUserRole();
  const userId = user?.id;

  return useQuery<ClosersKpiPopupResult>({
    queryKey: ["closers-kpi-popup", state, userId, role],
    enabled: !!state && !!userId && !!role,
    staleTime: 30_000,
    queryFn: async (): Promise<ClosersKpiPopupResult> => {
      if (!state) return { mode: "flat", groups: [], totalCount: 0 };

      // ── PIPELINE ──
      if (state.kind === "pipeline") {
        const stages = STAGE_BY_KEY[state.key];
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, stage, assigned_to, estimated_monetization, created_at")
          .order("created_at", { ascending: false });

        if (stages && stages.length > 0) {
          q = stages.length === 1 ? q.eq("stage", stages[0]) : q.in("stage", stages);
        }

        if (!isAdmin && !isManager && userId) {
          q = q.eq("assigned_to", userId);
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []) as CreatorRow[];

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
        const { data, error } = await supabase
          .from("closer_creators")
          .select("id, instagram_handle, estimated_monetization, stage")
          .in("stage", ["Completada", "Confirmada"])
          .gt("estimated_monetization", 0)
          .order("estimated_monetization", { ascending: false });
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
        const { data, error } = await supabase
          .from("closer_platform_sales")
          .select("creator_id, platform, price");
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
        const [salesRes, ofRes] = await Promise.all([
          supabase.from("closer_platform_sales").select("creator_id, price"),
          supabase
            .from("closer_creators")
            .select("id, instagram_handle, estimated_monetization, stage")
            .in("stage", ["Completada", "Confirmada"]),
        ]);
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
        const { data, error } = await supabase
          .from("closer_platform_sales")
          .select("creator_id, price")
          .eq("platform", platform);
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
