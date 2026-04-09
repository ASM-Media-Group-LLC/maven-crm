import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TaskBlocker {
  id: string;
  task_id: string;
  reason: string;
  blocked_by_user_id: string | null;
  reported_by: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export const useTaskBlockers = (taskId: string | null) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["task-blockers", taskId];

  const { data: blockers = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_blockers" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TaskBlocker[];
    },
    enabled: !!taskId,
  });

  const activeBlockers = blockers.filter((b) => !b.resolved);

  const addBlocker = useMutation({
    mutationFn: async ({ reason, blockedByUserId }: { reason: string; blockedByUserId: string | null }) => {
      const { error } = await supabase.from("task_blockers" as any).insert({
        task_id: taskId,
        reason,
        blocked_by_user_id: blockedByUserId,
        reported_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const resolveBlocker = useMutation({
    mutationFn: async (blockerId: string) => {
      const { error } = await supabase
        .from("task_blockers" as any)
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", blockerId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { blockers, activeBlockers, isLoading, addBlocker, resolveBlocker };
};

// Hook to get active blocker counts for multiple tasks
export const useTaskBlockerCounts = (taskIds: string[]) => {
  return useQuery({
    queryKey: ["task-blocker-counts", taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from("task_blockers" as any)
        .select("task_id")
        .in("task_id", taskIds)
        .eq("resolved", false);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        counts[b.task_id] = (counts[b.task_id] || 0) + 1;
      });
      return counts;
    },
    enabled: taskIds.length > 0,
  });
};
