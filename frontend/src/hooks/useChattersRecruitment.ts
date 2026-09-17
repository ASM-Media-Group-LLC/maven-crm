import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as { from: (table: string) => any };

export interface ChattersRecruitmentKpis {
  total: number;            // Sesiones creadas
  claimed: number;          // El chatter abrió el link (active_device_claimed_at no null)
  ended: number;            // Sesiones cerradas (status='ended')
  evaluated: number;        // Tienen evaluación cargada
  apto: number;             // Aprobados (verdict='apto')
  noApto: number;           // Rechazados (verdict='no_apto')
}

export type ChattersMetricKey =
  | "total"
  | "claimed"
  | "ended"
  | "evaluated"
  | "apto"
  | "noApto";

export interface ChattersRange {
  from: Date | undefined;
  to: Date | undefined;
}

const toIso = (d: Date | undefined): string | null => (d ? d.toISOString() : null);
const toIsoEndOfDay = (d: Date | undefined): string | null =>
  d ? endOfDay(d).toISOString() : null;

/** KPIs del funnel de reclutamiento de chatters — sesiones creadas →
 *  reclamadas → completadas → evaluadas → apto/no_apto. */
export const useChattersRecruitment = (range: ChattersRange) =>
  useQuery({
    queryKey: ["chatters-recruitment", toIso(range.from), toIso(range.to)],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ChattersRecruitmentKpis> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);

      // count:"estimated": son las cards del embudo de reclutamiento, no una
      // paginación ni una nómina. Por debajo del max-rows de PostgREST el
      // número sigue siendo exacto, que es el caso de cualquier rango normal.
      const head = (table: string, dateCol: string, filter?: (q: any) => any) => {
        let q = sb.from(table).select("*", { count: "estimated", head: true });
        if (fromIso) q = q.gte(dateCol, fromIso);
        if (toIsoVal) q = q.lte(dateCol, toIsoVal);
        if (filter) q = filter(q);
        return q;
      };

      const [
        { count: total },
        { count: claimed },
        { count: ended },
        { count: evaluated },
        { count: apto },
        { count: noApto },
      ] = await Promise.all([
        head("chatter_sessions", "created_at"),
        head("chatter_sessions", "created_at", (q) =>
          q.not("active_device_claimed_at", "is", null),
        ),
        head("chatter_sessions", "created_at", (q) => q.eq("status", "ended")),
        head("chatter_evaluations", "created_at"),
        head("chatter_evaluations", "created_at", (q) => q.eq("verdict", "apto")),
        head("chatter_evaluations", "created_at", (q) => q.eq("verdict", "no_apto")),
      ]);

      return {
        total: total ?? 0,
        claimed: claimed ?? 0,
        ended: ended ?? 0,
        evaluated: evaluated ?? 0,
        apto: apto ?? 0,
        noApto: noApto ?? 0,
      };
    },
  });

export interface ChattersDetailRow {
  id: string;
  primary: string;
  secondary?: string;
  date?: string;
  badge?: string;
  scorePct?: number;
}

/** Fetch del detalle de un KPI del funnel chatters. Hasta 100 rows. */
export const useChattersRecruitmentDetails = (
  metric: ChattersMetricKey,
  range: ChattersRange,
  enabled: boolean,
) =>
  useQuery({
    queryKey: ["chatters-recruitment-details", metric, toIso(range.from), toIso(range.to)],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ChattersDetailRow[]> => {
      const fromIso = toIso(range.from);
      const toIsoVal = toIsoEndOfDay(range.to);
      const dateGte = (q: any, col: string) => (fromIso ? q.gte(col, fromIso) : q);
      const dateLte = (q: any, col: string) => (toIsoVal ? q.lte(col, toIsoVal) : q);

      const limit = 100;

      if (metric === "total" || metric === "claimed" || metric === "ended") {
        let q = sb
          .from("chatter_sessions")
          .select(
            "id, chatter_name, examiner_name, status, active_device_claimed_at, created_at, profile:chatter_profiles(name)",
          )
          .order("created_at", { ascending: false })
          .limit(limit);
        if (metric === "claimed") q = q.not("active_device_claimed_at", "is", null);
        if (metric === "ended") q = q.eq("status", "ended");
        const { data, error } = await dateLte(dateGte(q, "created_at"), "created_at");
        if (error) throw error;
        return (data ?? []).map((r: any) => ({
          id: r.id,
          primary: r.chatter_name ?? "Sin nombre",
          secondary: r.profile?.name
            ? `Perfil: ${r.profile.name} · ${r.examiner_name ?? "?"}`
            : `Examiner: ${r.examiner_name ?? "?"}`,
          date: r.created_at,
          badge: r.status,
        }));
      }

      // Evaluated / apto / noApto leen de chatter_evaluations.
      let q = sb
        .from("chatter_evaluations")
        .select(
          "id, examiner_name, verdict, score_pct, created_at, session:chatter_sessions(chatter_name, profile:chatter_profiles(name))",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (metric === "apto") q = q.eq("verdict", "apto");
      if (metric === "noApto") q = q.eq("verdict", "no_apto");
      const { data, error } = await dateLte(dateGte(q, "created_at"), "created_at");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        primary: r.session?.chatter_name ?? "Sin nombre",
        secondary: r.session?.profile?.name
          ? `Perfil: ${r.session.profile.name} · ${r.examiner_name ?? "?"}`
          : `Examiner: ${r.examiner_name ?? "?"}`,
        date: r.created_at,
        badge: r.verdict,
        scorePct: typeof r.score_pct === "number" ? r.score_pct : undefined,
      }));
    },
  });
