import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, Minus, X, Send, Loader2, RotateCcw } from "lucide-react";
import { useChatterCriteria, useResetCriteria } from "@/hooks/useChatterEvaluator";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import type { ChatterSession } from "../types";

export type CriterionVerdict = "pass" | "partial" | "fail" | null;
export type CriteriaScores = Record<string, CriterionVerdict>;

interface Props {
  session: ChatterSession | null;
  scores: CriteriaScores;
  setScores: (next: CriteriaScores) => void;
  onSubmitEvaluation: () => void;
  isSubmitting?: boolean;
}

export const SCORES_STORAGE_PREFIX = "maven.chatter.scores.";

// Plain helper (not a React hook) — read persisted criteria scores for a
// session from localStorage. Returns {} when nothing is stored.
export const readScoresFromStorage = (sessionId: string | null): CriteriaScores => {
  if (!sessionId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SCORES_STORAGE_PREFIX + sessionId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const verdictButtonClass = (active: boolean, kind: CriterionVerdict): string => {
  if (!active) return "bg-muted text-muted-foreground hover:bg-muted/70";
  switch (kind) {
    case "pass":    return "bg-success/20 text-success ring-1 ring-success/40";
    case "partial": return "bg-warning/20 text-warning ring-1 ring-warning/40";
    case "fail":    return "bg-destructive/20 text-destructive ring-1 ring-destructive/40";
    default:        return "bg-muted text-muted-foreground";
  }
};

export const CriteriaPanel = ({
  session,
  scores,
  setScores,
  onSubmitEvaluation,
  isSubmitting,
}: Props) => {
  const { t, language } = useLanguage();
  const criteriaQ = useChatterCriteria();
  const criteria = useMemo(() => criteriaQ.data ?? [], [criteriaQ.data]);
  const resetMut = useResetCriteria();
  const [confirmReset, setConfirmReset] = useState(false);

  // Persist scores per session
  useEffect(() => {
    if (!session?.id) return;
    window.localStorage.setItem(
      SCORES_STORAGE_PREFIX + session.id,
      JSON.stringify(scores),
    );
  }, [scores, session?.id]);

  const setOne = (id: string, v: CriterionVerdict) =>
    setScores({ ...scores, [id]: scores[id] === v ? null : v });

  const { passes, partials, fails, total, scorePct } = useMemo(() => {
    let pass = 0, part = 0, fail = 0;
    for (const c of criteria) {
      const s = scores[c.id];
      if (s === "pass") pass++;
      else if (s === "partial") part++;
      else if (s === "fail") fail++;
    }
    const total = criteria.length;
    const scorePct = total === 0 ? 0 : Math.round(((pass + part * 0.5) / total) * 100);
    return { passes: pass, partials: part, fails: fail, total, scorePct };
  }, [criteria, scores]);

  const badge =
    scorePct >= 80 ? { label: t("chatters.crit.badgeApproved"), color: "text-success" } :
    scorePct >= 50 ? { label: t("chatters.crit.badgeBorderline"), color: "text-warning" } :
    { label: t("chatters.crit.badgeNotFit"), color: "text-destructive" };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("chatters.crit.title")}
          </h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            title={t("chatters.crit.resetTitle")}
            onClick={() => setConfirmReset(true)}
            disabled={resetMut.isPending}
          >
            {resetMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Reset
          </Button>
        </div>
        {session ? (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t("chatters.crit.evaluating")} <strong>{session.chatter_name}</strong>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chatters.crit.selectSession")}
          </p>
        )}
      </div>

      {/* Score */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold tabular-nums">{scorePct}%</div>
          <div className={`text-sm font-semibold ${badge.color}`}>{badge.label}</div>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {t("chatters.crit.tally", { pass: passes, partial: partials, fail: fails, total })}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {criteriaQ.isLoading && (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        )}
        {!criteriaQ.isLoading && criteria.length === 0 && (
          <Card className="p-3 text-xs text-muted-foreground">
            {t("chatters.crit.noneActive")}{" "}
            <span className="underline">Admin</span>.
          </Card>
        )}
        {criteria.map((c) => {
          const v = scores[c.id] ?? null;
          return (
            <div key={c.id} className="rounded-md border bg-card p-2">
              <div className="mb-2 text-xs leading-snug">{language === "en" && c.label_en ? c.label_en : c.label}</div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setOne(c.id, "pass")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "pass", "pass")}`}
                  disabled={!session}
                >
                  <Check className="h-3 w-3" /> {t("chatters.crit.yes")}
                </button>
                <button
                  type="button"
                  onClick={() => setOne(c.id, "partial")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "partial", "partial")}`}
                  disabled={!session}
                >
                  <Minus className="h-3 w-3" /> {t("chatters.crit.partialShort")}
                </button>
                <button
                  type="button"
                  onClick={() => setOne(c.id, "fail")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "fail", "fail")}`}
                  disabled={!session}
                >
                  <X className="h-3 w-3" /> {t("chatters.crit.no")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit */}
      <div className="border-t p-3">
        <Button
          onClick={onSubmitEvaluation}
          disabled={!session || criteria.length === 0 || isSubmitting}
          className="w-full gap-2"
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t("chatters.crit.submit")}
        </Button>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chatters.crit.resetDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("chatters.crit.resetDialogDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMut.isPending} />
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resetMut.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmReset(false);
                    toast.success(t("chatters.crit.resetDone"));
                  },
                  onError: (err) =>
                    toast.error(t("chatters.crit.resetFailed"), {
                      description: (err as Error).message,
                    }),
                });
              }}
              disabled={resetMut.isPending}
            >
              {resetMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("chatters.crit.reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CriteriaPanel;
