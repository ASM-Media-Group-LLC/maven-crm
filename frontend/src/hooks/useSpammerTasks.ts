import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SpammerAccount } from "@/hooks/useSpammerAccounts";
import type { ScouterLead } from "@/hooks/useScouterLeads";

// ─── Interfaces ───────────────────────────────────────────────────────────

export type TaskType = "follow" | "like" | "comment" | "story_view" | "story_react";
export type TaskStatus = "pending" | "done" | "skipped";
export type AssignmentStatus = "pending" | "in_progress" | "done" | "skipped";

export interface InteractionTask {
  id: string;
  assignment_id: string;
  from_account_id: string;
  task_type: TaskType;
  instruction: string;
  suggested_comment: string | null;
  sort_order: number;
  status: TaskStatus;
  screenshot_url: string | null;
  completed_at: string | null;
  tenant_id: string;
  created_at: string;
  // Joined relation
  from_account: SpammerAccount;
}

export interface DailyAssignment {
  id: string;
  spammer_id: string;
  lead_id: string;
  assigned_date: string;
  ai_strategy: string | null;
  ai_reasoning: string | null;
  priority: number;
  status: AssignmentStatus;
  completed_at: string | null;
  tenant_id: string;
  created_at: string;
  // Joined relations
  lead: ScouterLead;
  tasks: InteractionTask[];
}

// The `scouter_*` tables aren't in the generated Supabase types yet —
// cast through unknown so the calls don't need full type plumbing.
const sb = supabase as unknown as { from: (table: string) => any };

// ─── Queries ──────────────────────────────────────────────────────────────

/** Returns all daily assignments for the current user for the given date,
 *  with nested lead and tasks (each with their from_account).
 *  RLS on scouter_daily_assignments scopes to spammer_id = auth.uid()
 *  for spammer-role users; managers see all rows. */
export const useDailyAssignments = (date: string) =>
  useQuery({
    queryKey: ["daily-assignments", date],
    queryFn: async (): Promise<DailyAssignment[]> => {
      const { data, error } = await sb
        .from("scouter_daily_assignments")
        .select(
          `
          *,
          lead:scouter_leads(*),
          tasks:scouter_interaction_tasks(
            *,
            from_account:scouter_spammer_accounts(*)
          )
          `,
        )
        .eq("assigned_date", date)
        .order("priority", { ascending: true });
      if (error) throw error;
      // Sort tasks by sort_order within each assignment
      const assignments = (data ?? []) as DailyAssignment[];
      return assignments.map((a) => ({
        ...a,
        tasks: [...(a.tasks ?? [])].sort((x, y) => x.sort_order - y.sort_order),
      }));
    },
    enabled: !!date,
  });

// ─── Helpers ──────────────────────────────────────────────────────────────

/** After completing or skipping a task, check if ALL tasks for the
 *  assignment are now done/skipped and if so mark the assignment done. */
async function maybeCompleteAssignment(
  assignmentId: string,
  updatedTaskId: string,
  updatedStatus: TaskStatus,
): Promise<void> {
  // Fetch all tasks for this assignment
  const { data: tasks, error } = await sb
    .from("scouter_interaction_tasks")
    .select("id, status")
    .eq("assignment_id", assignmentId);
  if (error) throw error;

  const allTasks = (tasks ?? []) as { id: string; status: TaskStatus }[];
  // Apply the in-flight update to the local snapshot before checking
  const effective = allTasks.map((t) =>
    t.id === updatedTaskId ? { ...t, status: updatedStatus } : t,
  );
  const allSettled = effective.every(
    (t) => t.status === "done" || t.status === "skipped",
  );
  if (!allSettled) return;

  const { error: assignErr } = await sb
    .from("scouter_daily_assignments")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (assignErr) throw assignErr;
}

// ─── Mutations ────────────────────────────────────────────────────────────

export interface CompleteTaskInput {
  taskId: string;
  assignmentId: string;
  leadId: string;
  fromAccountId: string;
  taskType: TaskType;
  screenshotUrl?: string | null;
}

/** Mark a task as done, insert an interaction history row, and
 *  auto-complete the parent assignment if all tasks are settled. */
export const useCompleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteTaskInput): Promise<void> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw userErr ?? new Error("No hay sesión activa.");
      const userId = userRes.user.id;

      // 1. Mark task done
      const updatePayload: Record<string, unknown> = {
        status: "done",
        completed_at: new Date().toISOString(),
      };
      if (input.screenshotUrl) {
        updatePayload.screenshot_url = input.screenshotUrl;
      }
      const { error: taskErr } = await sb
        .from("scouter_interaction_tasks")
        .update(updatePayload)
        .eq("id", input.taskId);
      if (taskErr) throw taskErr;

      // 2. Insert interaction history (append-only)
      const { error: histErr } = await sb
        .from("scouter_interaction_history")
        .insert({
          lead_id: input.leadId,
          spammer_id: userId,
          from_account_id: input.fromAccountId,
          interaction_type: input.taskType,
          task_id: input.taskId,
          notes: input.screenshotUrl ? `screenshot: ${input.screenshotUrl}` : null,
        });
      if (histErr) throw histErr;

      // 3. Auto-complete assignment if all tasks settled
      await maybeCompleteAssignment(input.assignmentId, input.taskId, "done");
    },
    onSuccess: (_data, variables) => {
      const date = new Date().toISOString().slice(0, 10);
      qc.invalidateQueries({ queryKey: ["daily-assignments", date] });
      qc.invalidateQueries({ queryKey: ["spammer-progress"] });
    },
    onError: (e) => {
      toast.error("No se pudo completar la tarea", { description: (e as Error).message });
    },
  });
};

export interface SkipTaskInput {
  taskId: string;
  assignmentId: string;
}

/** Mark a task as skipped and auto-complete the assignment if all settled. */
export const useSkipTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SkipTaskInput): Promise<void> => {
      const { error } = await sb
        .from("scouter_interaction_tasks")
        .update({ status: "skipped" })
        .eq("id", input.taskId);
      if (error) throw error;

      await maybeCompleteAssignment(input.assignmentId, input.taskId, "skipped");
    },
    onSuccess: () => {
      const date = new Date().toISOString().slice(0, 10);
      qc.invalidateQueries({ queryKey: ["daily-assignments", date] });
      qc.invalidateQueries({ queryKey: ["spammer-progress"] });
    },
    onError: (e) => {
      toast.error("No se pudo saltar la tarea", { description: (e as Error).message });
    },
  });
};

// ─── Task 3.4: Screenshot Upload ──────────────────────────────────────────

export interface UploadScreenshotInput {
  file: File;
  taskId: string;
  assignmentId: string;
  leadId: string;
  fromAccountId: string;
  date: string; // ISO date string "YYYY-MM-DD"
}

/** Convert any image File to a WebP Blob using a canvas element.
 *  This keeps the same spirit as audioCompress.ts — client-side format
 *  normalization before upload. Returns the original file unchanged if
 *  canvas API is unavailable (e.g. test environments). */
async function compressImageToWebP(file: File, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      // Cap at 1920px on the longest side to avoid unnecessarily large uploads
      const MAX_PX = 1920;
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_PX);
          width = MAX_PX;
        } else {
          width = Math.round((width / height) * MAX_PX);
          height = MAX_PX;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // Fallback: return original
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const webpFile = new File([blob], `screenshot.webp`, { type: "image/webp" });
          resolve(webpFile);
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback
    };
    img.src = url;
  });
}

/** Upload a screenshot to `scouter-screenshots/{tenant_id}/{user_id}/{date}/{task_id}.webp`,
 *  update the task's screenshot_url, and mark the task done.
 *  Follows the same pattern as audio upload in the qa-transcribe flow. */
export const useUploadScreenshot = () => {
  const qc = useQueryClient();
  const completeTask = useCompleteTask();
  return useMutation({
    mutationFn: async (input: UploadScreenshotInput): Promise<string> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw userErr ?? new Error("No hay sesión activa.");
      const userId = userRes.user.id;

      // Resolve tenant_id via the same RPC pattern used in useScouterLeads
      const { data: tenantId, error: tenantErr } = await (
        supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: unknown }>
      )("current_tenant_id");
      if (tenantErr) throw tenantErr;
      if (!tenantId) throw new Error("Tenant no resuelto.");

      // Compress to WebP before upload
      const webpFile = await compressImageToWebP(input.file);

      // Storage path: {tenant_id}/{user_id}/{date}/{task_id}.webp
      const storagePath = `${tenantId}/${userId}/${input.date}/${input.taskId}.webp`;

      const { error: uploadErr } = await supabase.storage
        .from("scouter-screenshots")
        .upload(storagePath, webpFile, {
          contentType: "image/webp",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      // Mark task done with screenshot_url via completeTask mutation
      await completeTask.mutateAsync({
        taskId: input.taskId,
        assignmentId: input.assignmentId,
        leadId: input.leadId,
        fromAccountId: input.fromAccountId,
        taskType: "comment",
        screenshotUrl: storagePath,
      });

      return storagePath;
    },
    onSuccess: (_storagePath, variables) => {
      qc.invalidateQueries({ queryKey: ["daily-assignments", variables.date] });
      qc.invalidateQueries({ queryKey: ["spammer-progress"] });
      toast.success("Screenshot subido y tarea completada");
    },
    onError: (e) => {
      toast.error("No se pudo subir el screenshot", { description: (e as Error).message });
    },
  });
};
