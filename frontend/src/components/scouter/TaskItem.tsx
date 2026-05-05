import { useState } from "react";
import {
  UserPlus,
  Heart,
  MessageCircle,
  Eye,
  Sparkles,
  CheckCircle2,
  SkipForward,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScreenshotUpload } from "./ScreenshotUpload";
import {
  useCompleteTask,
  useSkipTask,
  type InteractionTask,
  type TaskType,
} from "@/hooks/useSpammerTasks";
import type { SpammerAccount } from "@/hooks/useSpammerAccounts";
import { initialsBg } from "@/pages/scouter/leadShared";

// ─── Task type icon map ───────────────────────────────────────────────────

const TASK_ICONS: Record<TaskType, React.ReactNode> = {
  follow:      <UserPlus className="h-4 w-4 text-sky-400" />,
  like:        <Heart className="h-4 w-4 text-rose-400" />,
  comment:     <MessageCircle className="h-4 w-4 text-amber-400" />,
  story_view:  <Eye className="h-4 w-4 text-violet-400" />,
  story_react: <Sparkles className="h-4 w-4 text-pink-400" />,
};

const TASK_LABELS: Record<TaskType, string> = {
  follow:      "Seguir",
  like:        "Like",
  comment:     "Comentario",
  story_view:  "Ver historia",
  story_react: "Reaccionar historia",
};

// ─── Props ────────────────────────────────────────────────────────────────

interface TaskItemProps {
  task: InteractionTask;
  accounts: SpammerAccount[];
  assignmentDate: string; // "YYYY-MM-DD"
  leadId: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export const TaskItem = ({ task, accounts: _accounts, assignmentDate, leadId }: TaskItemProps) => {
  const completeMut = useCompleteTask();
  const skipMut = useSkipTask();
  const [optimisticDone, setOptimisticDone] = useState(false);

  const isDone = task.status === "done" || optimisticDone;
  const isSkipped = task.status === "skipped";
  const isPending = !isDone && !isSkipped;
  const isComment = task.task_type === "comment";
  const isBusy = completeMut.isPending || skipMut.isPending;

  const fromAccount = task.from_account;

  const handleCheck = async () => {
    if (isDone || isSkipped || isBusy) return;
    setOptimisticDone(true);
    try {
      await completeMut.mutateAsync({
        taskId: task.id,
        assignmentId: task.assignment_id,
        leadId,
        fromAccountId: task.from_account_id,
        taskType: task.task_type,
      });
    } catch {
      setOptimisticDone(false);
    }
  };

  const handleSkip = async () => {
    if (isDone || isSkipped || isBusy) return;
    await skipMut.mutateAsync({ taskId: task.id, assignmentId: task.assignment_id });
  };

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-all ${
        isDone
          ? "border-emerald-500/20 bg-emerald-500/5 opacity-70"
          : isSkipped
          ? "border-border/30 bg-muted/10 opacity-50"
          : "border-border bg-card/50"
      }`}
    >
      {/* ── Header row ── */}
      <div className="flex items-start gap-2">
        {/* Task type icon */}
        <div className="mt-0.5 shrink-0">
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            TASK_ICONS[task.task_type]
          )}
        </div>

        {/* Instruction text */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm leading-snug ${
              isSkipped ? "line-through text-muted-foreground" : "text-foreground"
            }`}
          >
            {task.instruction}
          </p>
          {/* Task type label */}
          <span className="mt-0.5 inline-block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {TASK_LABELS[task.task_type]}
          </span>
        </div>

        {/* Actions (non-comment only) */}
        {!isComment && isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <Checkbox
              checked={false}
              disabled={isBusy}
              onCheckedChange={handleCheck}
              aria-label="Marcar como completada"
              className="h-5 w-5 border-2"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSkip}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground opacity-50 transition-opacity hover:opacity-100 hover:text-foreground disabled:opacity-30"
              aria-label="Saltar tarea"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Done indicator */}
        {!isComment && isDone && (
          <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
        )}
      </div>

      {/* ── From account badge ── */}
      {fromAccount && (
        <div className="flex items-center gap-1.5 pl-6">
          <div
            className="h-5 w-5 rounded-full overflow-hidden shrink-0"
            style={{ background: initialsBg(fromAccount.instagram_handle) }}
          >
            {fromAccount.profile_pic_url ? (
              <img
                src={fromAccount.profile_pic_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-white/80">
                {fromAccount.instagram_handle.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            desde <span className="font-semibold text-foreground/80">@{fromAccount.instagram_handle}</span>
          </span>
        </div>
      )}

      {/* ── Comment block ── */}
      {isComment && task.suggested_comment && (
        <div className="pl-6 space-y-1">
          <blockquote className="rounded-md border-l-2 border-amber-400/50 bg-amber-400/5 pl-3 pr-2 py-2 text-sm italic text-foreground/80">
            {task.suggested_comment}
          </blockquote>
          <p className="text-[11px] text-muted-foreground">
            Agrega algo de tu cosecha para que suene natural.
          </p>
        </div>
      )}

      {/* ── Screenshot upload (comment tasks) ── */}
      {isComment && isPending && (
        <div className="pl-6">
          <ScreenshotUpload
            taskId={task.id}
            assignmentId={task.assignment_id}
            leadId={leadId}
            fromAccountId={task.from_account_id}
            assignmentDate={assignmentDate}
            onUploaded={() => {
              // Query invalidation is handled inside useUploadScreenshot
            }}
          />
        </div>
      )}

      {/* ── Skipped comment action ── */}
      {isComment && isPending && !isDone && (
        <div className="pl-6 flex items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleSkip}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
          >
            <SkipForward className="h-3.5 w-3.5" />
            Saltar
          </button>
        </div>
      )}
    </div>
  );
};
