import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Cast to skip codegen plumbing — scouter_* tables aren't in generated types yet.
const sb = supabase as unknown as { from: (table: string) => any };

// ─── Types ────────────────────────────────────────────────────────────────

export interface SpammerDetailTask {
  id: string;
  task_type: "follow" | "like" | "comment" | "story_view" | "story_react";
  instruction: string;
  suggested_comment: string | null;
  status: "pending" | "done" | "skipped";
  screenshot_url: string | null;
  signed_screenshot_url: string | null;
  completed_at: string | null;
  sort_order: number;
  from_account: {
    instagram_handle: string;
    profile_pic_url: string | null;
  } | null;
}

export interface SpammerDetailAssignment {
  id: string;
  ai_strategy: string | null;
  ai_reasoning: string | null;
  status: "pending" | "in_progress" | "done" | "skipped";
  priority: number;
  created_at: string;
  completed_at: string | null;
  lead: {
    id: string;
    instagram_handle: string;
    bio: string | null;
    ai_score: number | null;
    profile_pic_url: string | null;
  } | null;
  tasks: SpammerDetailTask[];
}

// ─── Query ────────────────────────────────────────────────────────────────

/**
 * Drill-down detail for one spammer on a given date. Returns all their
 * assignments with embedded tasks and signed URLs for any uploaded
 * screenshots. RLS still scopes by tenant + role; this hook trusts the
 * caller has admin/manager/supervisor access and just shapes the data.
 */
export const useSpammerDetail = (spammerId: string | null, date: string) =>
  useQuery({
    queryKey: ["spammer-detail", spammerId, date],
    enabled: !!spammerId && !!date,
    staleTime: 15_000,
    queryFn: async (): Promise<SpammerDetailAssignment[]> => {
      const { data, error } = await sb
        .from("scouter_daily_assignments")
        .select(
          `
          id,
          ai_strategy,
          ai_reasoning,
          status,
          priority,
          created_at,
          completed_at,
          lead:lead_id(
            id,
            instagram_handle,
            bio,
            ai_score,
            profile_pic_url
          ),
          tasks:scouter_interaction_tasks(
            id,
            task_type,
            instruction,
            suggested_comment,
            status,
            screenshot_url,
            completed_at,
            sort_order,
            from_account:from_account_id(
              instagram_handle,
              profile_pic_url
            )
          )
          `,
        )
        .eq("spammer_id", spammerId)
        .eq("assigned_date", date)
        .order("priority", { ascending: true });

      if (error) throw error;

      // Sign each screenshot path so the modal can render thumbnails
      // (bucket es privado — sin signed URL no se ven). Ttl 1h.
      const assignments = (data ?? []) as SpammerDetailAssignment[];
      const allTasks = assignments.flatMap((a) => a.tasks ?? []);
      const pathsToSign = allTasks
        .filter((t) => !!t.screenshot_url)
        .map((t) => t.screenshot_url as string);

      const signedMap = new Map<string, string>();
      if (pathsToSign.length > 0) {
        const { data: signed } = await supabase.storage
          .from("scouter-screenshots")
          .createSignedUrls(pathsToSign, 3600);
        for (const s of signed ?? []) {
          if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
        }
      }

      // Inject signed URLs + sort tasks within each assignment
      for (const a of assignments) {
        a.tasks = (a.tasks ?? [])
          .map((t) => ({
            ...t,
            signed_screenshot_url: t.screenshot_url
              ? signedMap.get(t.screenshot_url) ?? null
              : null,
          }))
          .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
      }

      return assignments;
    },
  });
