import { useState } from "react";
import { ChevronDown, ChevronRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TaskItem } from "./TaskItem";
import { useSkipTask, type DailyAssignment } from "@/hooks/useSpammerTasks";
import type { SpammerAccount } from "@/hooks/useSpammerAccounts";
import {
  scoreColor,
  countryToFlag,
  formatFollowers,
  initialsBg,
} from "@/pages/scouter/leadShared";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Strategy badge config ────────────────────────────────────────────────
// La llave es el ai_strategy que guarda la IA; solo la etiqueta se traduce.
// Las que se dicen igual en inglés quedan como texto (`label`). Mismas
// etiquetas que el filtro de estrategia de MisTareas.

const STRATEGY_META: Record<
  string,
  { label?: string; labelKey?: TranslationKey; className: string }
> = {
  warm_approach: {
    label: "Warm approach",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  cold_follow: {
    label: "Cold follow",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  multi_account: {
    labelKey: "scouter.strategy.multiAccount",
    className: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  },
  re_engage: {
    label: "Re-engage",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
};

// ─── Props ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  assignment: DailyAssignment;
  accounts: SpammerAccount[];
}

// ─── Component ────────────────────────────────────────────────────────────

export const TaskCard = ({ assignment, accounts }: TaskCardProps) => {
  const { t } = useLanguage();
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const skipMut = useSkipTask();

  const { lead, tasks } = assignment;
  const assignmentDate = assignment.assigned_date;

  // Visual state
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === "done");
  const allSkipped =
    tasks.length > 0 && tasks.every((t) => t.status === "skipped");
  const hasPending = tasks.some((t) => t.status === "pending");

  const aiScore = lead.ai_score;
  const sc = scoreColor(aiScore);

  const initial = (
    lead.instagram_handle.charAt(0) ?? "?"
  ).toUpperCase();

  const strategyMeta = assignment.ai_strategy
    ? STRATEGY_META[assignment.ai_strategy] ?? null
    : null;

  const handleSkipAll = async () => {
    const pendingTasks = tasks.filter((t) => t.status === "pending");
    // Fire skip mutations sequentially to preserve assignment rollup logic
    for (const t of pendingTasks) {
      await skipMut.mutateAsync({
        taskId: t.id,
        assignmentId: assignment.id,
      });
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition-all ${
        allDone
          ? "border-success/30 shadow-[0_0_12px_-4px_rgb(34_197_94_/_0.3)]"
          : allSkipped
          ? "border-border/30 bg-muted/10 opacity-60"
          : "border-border bg-card"
      }`}
    >
      {/* ── Lead mini-profile ── */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="h-11 w-11 shrink-0 overflow-hidden rounded-full"
          style={{ background: initialsBg(lead.instagram_handle) }}
        >
          {lead.photo_data_url ? (
            <img
              src={lead.photo_data_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white/80">
              {initial}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold truncate">
              @{lead.instagram_handle}
            </span>
            {lead.country && (
              <span className="text-sm">{countryToFlag(lead.country)}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {lead.followers != null && (
              <span className="text-[11px] text-muted-foreground">
                {t("scouter.task.followersShort", { count: formatFollowers(lead.followers) })}
              </span>
            )}
            {strategyMeta && (
              <span
                className={`inline-block rounded-full border px-1.5 py-0.5 text-xs font-bold ${strategyMeta.className}`}
              >
                {strategyMeta.labelKey ? t(strategyMeta.labelKey) : strategyMeta.label}
              </span>
            )}
          </div>
        </div>

        {/* AI Score */}
        {aiScore != null && (
          <div className="text-right shrink-0">
            <div
              className="text-xl font-extrabold tabular-nums leading-none"
              style={{ color: sc }}
            >
              {aiScore.toFixed(1)}
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">score</div>
          </div>
        )}
      </div>

      {/* ── AI reasoning block (collapsible) ── */}
      {assignment.ai_reasoning && (
        <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {reasoningOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {t("scouter.task.whyThisLead")}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 rounded-md border border-border/50 bg-muted/20 p-2.5 text-xs leading-relaxed text-foreground/80">
              {assignment.ai_reasoning}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* ── Task items ── */}
      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              accounts={accounts}
              assignmentDate={assignmentDate}
              leadId={lead.id}
            />
          ))}
        </div>
      )}

      {/* ── Skip all button ── */}
      {hasPending && !allDone && (
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleSkipAll}
            disabled={skipMut.isPending}
          >
            <SkipForward className="h-3.5 w-3.5" />
            {t("scouter.task.skipAll")}
          </Button>
        </div>
      )}
    </div>
  );
};
