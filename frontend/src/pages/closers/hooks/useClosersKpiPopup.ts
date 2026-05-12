import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import type { KpiRow } from "@/components/dashboard/KpiDetailDialog";

// Datos para los popups de los KPI cards en closers/dashboard.
// Antes el popup mostraba creators.filter(...) sobre el array paginado
// de la tab activa → siempre 0 o pocos matches según en qué tab estuviera
// el user. Ahora cada popup dispara su propia query a la DB, sin paginar,
// solo cuando el popup está abierto.
//
// También el popup de revenue platform estaba roto: usaba un map
// indexado por creator_id pero accedía por nombre de plataforma → undefined.

export type ClosersKpiPopupState =
  | { kind: "pipeline"; key: "total" | "asignadas" | "confirmadas" | "completadas" | "cerradas" | "no_interesadas" }
  | { kind: "revenue"; platform: string };

const STAGE_BY_KEY: Record<string, string[] | null> = {
  total: null,
  asignadas: ["Asignada"],
  confirmadas: ["Confirmada"],
  completadas: ["Completada"],
  cerradas: ["Confirmada", "Completada"],
  no_interesadas: ["No interesada"],
};

const PLATFORM_KEYS = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"];

const stageTone = (stage: string): KpiRow["rightTone"] =>
  stage === "Completada" || stage === "Confirmada"
    ? "success"
    : stage === "No interesada"
      ? "destructive"
      : stage === "Asignada"
        ? "warning"
        : "default";

export function useClosersKpiPopup(state: ClosersKpiPopupState | null) {
  const { user } = useAuth();
  const { isAdmin, isManager, role } = useUserRole();
  const userId = user?.id;
  return useQuery({
    queryKey: ["closers-kpi-popup", state, userId, role],
    enabled: !!state && !!userId && !!role,
    staleTime: 30_000,
    queryFn: async (): Promise<KpiRow[]> => {
      if (!state) return [];

      // ── PIPELINE: lista de creadoras por stage ──
      if (state.kind === "pipeline") {
        const stages = STAGE_BY_KEY[state.key];
        let q = supabase
          .from("closer_creators")
          .select("id, instagram_handle, stage, assigned_to")
          .order("created_at", { ascending: false });

        if (stages && stages.length > 0) {
          q = stages.length === 1 ? q.eq("stage", stages[0]) : q.in("stage", stages);
        }

        // Filtro por rol: closer ve solo lo asignado.
        if (!isAdmin && !isManager && userId) {
          q = q.eq("assigned_to", userId);
        }

        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []) as Array<{
          id: string;
          instagram_handle: string | null;
          stage: string | null;
          assigned_to: string | null;
        }>;

        // Enriquecer con nombre del agente asignado.
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

        return rows.map((r): KpiRow => ({
          primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
          secondary: r.assigned_to ? nameMap[r.assigned_to] ?? "Sin asignar" : "Sin asignar",
          right: r.stage ?? "—",
          rightTone: stageTone(r.stage ?? ""),
        }));
      }

      // ── REVENUE ──
      const platform = state.platform;

      // Rev. OnlyFans → estimated_monetization de Completada/Confirmada.
      if (platform === "Rev. OnlyFans") {
        const { data, error } = await supabase
          .from("closer_creators")
          .select("id, instagram_handle, assigned_to, estimated_monetization, stage")
          .in("stage", ["Completada", "Confirmada"])
          .gt("estimated_monetization", 0)
          .order("estimated_monetization", { ascending: false });
        if (error) throw error;
        return (data ?? []).map((r: any): KpiRow => ({
          primary: r.instagram_handle ? `@${r.instagram_handle}` : "Sin handle",
          secondary: r.stage,
          right: `$${Number(r.estimated_monetization).toLocaleString("es")}`,
          rightTone: "success",
        }));
      }

      // Rev. Plataformas → suma por creadora de closer_platform_sales.
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
        return Object.entries(byCreator)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([cid, v]): KpiRow => ({
            primary: handleMap[cid] ?? "Sin handle",
            secondary: v.platforms.join(", "),
            right: `$${v.total.toLocaleString("es")}`,
            rightTone: "success",
          }));
      }

      // Rev. Total → OnlyFans + Plataformas agregado por creadora.
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
        // Faltan handles para creadoras que tienen sales pero NO están en
        // ofRes (porque no están en Completada/Confirmada).
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
        return Object.entries(byCreator)
          .filter(([, total]) => total > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([cid, total]): KpiRow => ({
            primary: handleMap[cid] ?? "Sin handle",
            right: `$${total.toLocaleString("es")}`,
            rightTone: "success",
          }));
      }

      // Plataforma específica (Trafix / Blu / Piclink / LeakHunter / ORA).
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
        return rows
          .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))
          .map((r): KpiRow => ({
            primary: handleMap[r.creator_id] ?? "Sin handle",
            right: `$${Number(r.price || 0).toLocaleString("es")}`,
            rightTone: "success",
          }));
      }

      return [];
    },
  });
}
