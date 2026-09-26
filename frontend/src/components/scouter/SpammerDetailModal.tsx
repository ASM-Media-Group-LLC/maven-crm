import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  SkipForward,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useSpammerDetail,
  type SpammerDetailTask,
} from "@/hooks/useSpammerDetail";
import { initialsBg } from "@/pages/scouter/leadShared";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Task icon map (mirrors TaskItem.tsx) ────────────────────────────────

const TASK_ICONS: Record<SpammerDetailTask["task_type"], React.ReactNode> = {
  follow: <UserPlus className="h-3.5 w-3.5 text-sky-400" />,
  like: <Heart className="h-3.5 w-3.5 text-rose-400" />,
  comment: <MessageCircle className="h-3.5 w-3.5 text-amber-400" />,
  story_view: <Eye className="h-3.5 w-3.5 text-violet-400" />,
  story_react: <Sparkles className="h-3.5 w-3.5 text-pink-400" />,
};

const TASK_LABELS: Record<SpammerDetailTask["task_type"], TranslationKey> = {
  follow: "scouter.task.type.follow",
  like: "scouter.task.type.like",
  comment: "scouter.task.type.comment",
  story_view: "scouter.task.type.storyView",
  story_react: "common.react",
};

// ─── Props ────────────────────────────────────────────────────────────────

interface SpammerDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spammerId: string | null;
  spammerName: string | null;
  date: string;
}

// ─── Component ────────────────────────────────────────────────────────────

export const SpammerDetailModal = ({
  open,
  onOpenChange,
  spammerId,
  spammerName,
  date,
}: SpammerDetailModalProps) => {
  const { t } = useLanguage();
  const { data: assignments, isLoading } = useSpammerDetail(spammerId, date);
  const [zoomedScreenshot, setZoomedScreenshot] = useState<string | null>(null);

  const stats = (() => {
    if (!assignments) return null;
    const allTasks = assignments.flatMap((a) => a.tasks ?? []);
    const total = allTasks.length;
    const done = allTasks.filter((tk) => tk.status === "done").length;
    const skipped = allTasks.filter((tk) => tk.status === "skipped").length;
    const pending = total - done - skipped;
    const comments = allTasks.filter((tk) => tk.task_type === "comment").length;
    const commentsWithProof = allTasks.filter(
      (tk) => tk.task_type === "comment" && tk.screenshot_url,
    ).length;
    return { total, done, skipped, pending, comments, commentsWithProof };
  })();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>
                {spammerName ?? "Spammer"}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  · {date}
                </span>
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Stats bar */}
          {stats && (
            <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border/40">
              <Badge variant="outline" className="font-mono">
                {t("scouter.detail.done", { done: stats.done, total: stats.total })}
              </Badge>
              {stats.pending > 0 && (
                <Badge variant="outline" className="text-warning border-warning/30">
                  {t("scouter.detail.pending", { count: stats.pending })}
                </Badge>
              )}
              {stats.skipped > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("scouter.detail.skipped", { count: stats.skipped })}
                </Badge>
              )}
              {stats.comments > 0 && (
                <Badge variant="outline" className="text-warning border-warning/30">
                  {t("scouter.detail.withScreenshot", { done: stats.commentsWithProof, total: stats.comments })}
                </Badge>
              )}
            </div>
          )}

          {/* Body */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t("common.loading")}</span>
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("scouter.detail.noAssignments")}
            </p>
          ) : (
            <div className="space-y-3">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-border bg-card/40 p-3 space-y-3"
                >
                  {/* Lead header */}
                  <div className="flex items-start gap-3">
                    <div
                      className="h-9 w-9 rounded-full overflow-hidden shrink-0"
                      style={{ background: initialsBg(a.lead?.instagram_handle ?? "?") }}
                    >
                      {a.lead?.profile_pic_url ? (
                        <img
                          src={a.lead.profile_pic_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/80">
                          {(a.lead?.instagram_handle ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">
                          @{a.lead?.instagram_handle ?? "?"}
                        </span>
                        {typeof a.lead?.ai_score === "number" && (
                          <Badge variant="outline" className="text-[10px]">
                            score {a.lead.ai_score}
                          </Badge>
                        )}
                        {a.ai_strategy && (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {a.ai_strategy}
                          </Badge>
                        )}
                      </div>
                      {a.ai_reasoning && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                          {a.ai_reasoning}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="space-y-1.5 pl-12">
                    {(a.tasks ?? []).map((tk) => (
                      <TaskRow
                        key={tk.id}
                        task={tk}
                        onZoomScreenshot={setZoomedScreenshot}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Screenshot zoom overlay */}
      {zoomedScreenshot && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomedScreenshot(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setZoomedScreenshot(null)}
            aria-label={t("common.close")}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={zoomedScreenshot}
            alt="Screenshot"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

// ─── Task row ─────────────────────────────────────────────────────────────

const TaskRow = ({
  task,
  onZoomScreenshot,
}: {
  task: SpammerDetailTask;
  onZoomScreenshot: (url: string) => void;
}) => {
  const { t } = useLanguage();
  const isDone = task.status === "done";
  const isSkipped = task.status === "skipped";
  return (
    <div className="flex items-start gap-2 text-xs">
      <div className="mt-0.5 shrink-0">
        {isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : isSkipped ? (
          <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/60" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          {TASK_ICONS[task.task_type]}
          <span className="font-medium text-xs text-muted-foreground">
            {t(TASK_LABELS[task.task_type])}
          </span>
          {task.from_account && (
            <span className="text-[10px] text-muted-foreground">
              {t("scouter.task.from", { handle: task.from_account.instagram_handle })}
            </span>
          )}
        </div>
        <p
          className={`leading-snug whitespace-pre-line ${
            isSkipped ? "line-through text-muted-foreground/70" : ""
          }`}
        >
          {task.instruction}
        </p>
        {task.suggested_comment && (
          <blockquote className="rounded-md border-l-2 border-amber-400/50 bg-amber-400/5 pl-2 pr-1 py-1 italic text-foreground/70">
            {task.suggested_comment}
          </blockquote>
        )}
        {task.signed_screenshot_url && (
          <button
            type="button"
            onClick={() => onZoomScreenshot(task.signed_screenshot_url!)}
            className="block mt-1 rounded border border-border overflow-hidden hover:opacity-80 transition-opacity"
          >
            <img
              src={task.signed_screenshot_url}
              alt="Screenshot"
              className="h-24 w-auto object-cover"
            />
          </button>
        )}
        {task.task_type === "comment" && !task.screenshot_url && task.status === "pending" && (
          <span className="text-[10px] text-muted-foreground italic">
            {t("scouter.detail.waitingScreenshot")}
          </span>
        )}
      </div>
    </div>
  );
};
