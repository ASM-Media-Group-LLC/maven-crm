import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The `scouter_*` tables aren't in the generated Supabase types yet —
// cast through unknown so the calls don't need full type plumbing.
const sb = supabase as unknown as { from: (table: string) => any };

// ─── Interfaces ───────────────────────────────────────────────────────────

export interface SpammerProgressRow {
  spammer_id: string;
  spammer_name: string | null;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  completion_rate: number; // 0–1
}

// ─── Query ────────────────────────────────────────────────────────────────

/** Returns per-spammer task completion stats for a given date.
 *  Intended for the ManagerDashboard component (admin/manager/supervisor).
 *  RLS on scouter_daily_assignments + scouter_interaction_tasks scopes
 *  the result to the current tenant only. */
export const useSpammerProgress = (date: string) =>
  useQuery({
    queryKey: ["spammer-progress", date],
    queryFn: async (): Promise<SpammerProgressRow[]> => {
      // Pull all assignments for the date with nested tasks and the
      // spammer's profile data for display name.
      const { data, error } = await sb
        .from("scouter_daily_assignments")
        .select(
          `
          spammer_id,
          status,
          tasks:scouter_interaction_tasks(status),
          spammer:spammer_id(
            raw_user_meta_data
          )
          `,
        )
        .eq("assigned_date", date);
      if (error) throw error;

      // Group by spammer_id and aggregate task counts
      const map = new Map<
        string,
        {
          spammer_name: string | null;
          total_tasks: number;
          completed_tasks: number;
        }
      >();

      type RawAssignment = {
        spammer_id: string;
        status: string;
        tasks: { status: string }[];
        spammer: { raw_user_meta_data?: { full_name?: string; name?: string } } | null;
      };

      for (const row of (data ?? []) as RawAssignment[]) {
        const existing = map.get(row.spammer_id);
        const spammerName =
          existing?.spammer_name ??
          row.spammer?.raw_user_meta_data?.full_name ??
          row.spammer?.raw_user_meta_data?.name ??
          null;

        const tasks = row.tasks ?? [];
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(
          (t) => t.status === "done" || t.status === "skipped",
        ).length;

        if (existing) {
          existing.total_tasks += totalTasks;
          existing.completed_tasks += completedTasks;
        } else {
          map.set(row.spammer_id, {
            spammer_name: spammerName,
            total_tasks: totalTasks,
            completed_tasks: completedTasks,
          });
        }
      }

      return Array.from(map.entries())
        .map(([spammer_id, agg]) => ({
          spammer_id,
          spammer_name: agg.spammer_name,
          total_tasks: agg.total_tasks,
          completed_tasks: agg.completed_tasks,
          pending_tasks: agg.total_tasks - agg.completed_tasks,
          completion_rate: agg.total_tasks > 0 ? agg.completed_tasks / agg.total_tasks : 0,
        }))
        .sort((a, b) => b.completion_rate - a.completion_rate);
    },
    enabled: !!date,
    staleTime: 30_000,
  });
