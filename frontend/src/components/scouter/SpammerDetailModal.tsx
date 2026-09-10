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

// ─── Task icon map (mirrors TaskItem.tsx) ────────────────────────────────

const TASK_ICONS: Record<SpammerDetailTask["task_type"], React.ReactNode> = {
  follow: <UserPlus className="h-3.5 w-3.5 text-sky-400" />,
  like: <Heart className="h-3.5 w-3.5 text-rose-400" />,
  comment: <MessageCircle className="h-3.5 w-3.5 text-amber-400" />,
  story_view: <Eye className="h-3.5 w-3.5 text-violet-400" />,
  story_react: <Sparkles className="h-3.5 w-3.5 text-pink-400" />,
};

const TASK_LABELS: Record<SpammerDetailTask["task_type"], string> = {
  follow: "Seguir",
  like: "Like",
  comment: "Comentario",
  story_view: "Ver historia",
  story_react: "Reaccionar",
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
  const { data: assignments, isLoading } = useSpammerDetail(spammerId, date);
  const [zoomedScreenshot, setZoomedScreenshot] = useState<string | null>(null);

  const stats = (() => {
    if (!assignments) return null;
    const allTasks = assignments.flatMap((a) => a.tasks ?? []);
    const total = allTasks.length;
    const done = allTasks.filter((t) => t.status === "done").length;
    const skipped = allTasks.filter((t) => t.status === "skipped").length;
    const pending = total - done - skipped;
    const comments = allTasks.filter((t) => t.task_type === "comment").length;
    const commentsWithProof = allTasks.filter(
      (t) => t.task_type === "comment" && t.screenshot_url,
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
                {stats.done}/{stats.total} hechas
              </Badge>
              {stats.pending > 0 && (
                <Badge variant="outline" className="text-warning border-warning/30">
                  {stats.pending} pendientes
                </Badge>
              )}
              {stats.skipped > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {stats.skipped} saltadas
                </Badge>
              )}
              {stats.comments > 0 && (
                <Badge variant="outline" className="text-warning border-warning/30">
                  {stats.commentsWithProof}/{stats.comments} comments con screenshot
                </Badge>
              )}
            </div>
          )}

          {/* Body */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Cargando...</span>
            </div>
          ) : !assignments || assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Sin asignaciones para este día.
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
                    {(a.tasks ?? []).map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
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
            aria-label="Cerrar"
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
  task: t,
  onZoomScreenshot,
}: {
  task: SpammerDetailTask;
  onZoomScreenshot: (url: string) => void;
}) => {
  const isDone = t.status === "done";
  const isSkipped = t.status === "skipped";
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
          {TASK_ICONS[t.task_type]}
          <span className="font-medium text-xs text-muted-foreground">
            {TASK_LABELS[t.task_type]}
          </span>
          {t.from_account && (
            <span className="text-[10px] text-muted-foreground">
              desde @{t.from_account.instagram_handle}
            </span>
          )}
        </div>
        <p
          className={`leading-snug whitespace-pre-line ${
            isSkipped ? "line-through text-muted-foreground/70" : ""
          }`}
        >
          {t.instruction}
        </p>
        {t.suggested_comment && (
          <blockquote className="rounded-md border-l-2 border-amber-400/50 bg-amber-400/5 pl-2 pr-1 py-1 italic text-foreground/70">
            {t.suggested_comment}
          </blockquote>
        )}
        {t.signed_screenshot_url && (
          <button
            type="button"
            onClick={() => onZoomScreenshot(t.signed_screenshot_url!)}
            className="block mt-1 rounded border border-border overflow-hidden hover:opacity-80 transition-opacity"
          >
            <img
              src={t.signed_screenshot_url}
              alt="Screenshot"
              className="h-24 w-auto object-cover"
            />
          </button>
        )}
        {t.task_type === "comment" && !t.screenshot_url && t.status === "pending" && (
          <span className="text-[10px] text-muted-foreground italic">
            Esperando screenshot del comentario
          </span>
        )}
      </div>
    </div>
  );
};
