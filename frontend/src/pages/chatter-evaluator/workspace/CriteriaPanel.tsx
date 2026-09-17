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
    scorePct >= 80 ? { label: "APROBADO", color: "text-success" } :
    scorePct >= 50 ? { label: "A CRITERIO", color: "text-warning" } :
    { label: "NO APTO", color: "text-destructive" };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Criterios
          </h2>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px]"
            title="Restablecer criterios originales"
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
            Evaluando: <strong>{session.chatter_name}</strong>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Selecciona una sesión para evaluar.
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
          {passes} cumple · {partials} parcial · {fails} no cumple · {total} total
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
        {criteriaQ.isLoading && (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        )}
        {!criteriaQ.isLoading && criteria.length === 0 && (
          <Card className="p-3 text-xs text-muted-foreground">
            No hay criterios activos. Agrega algunos en{" "}
            <span className="underline">Admin</span>.
          </Card>
        )}
        {criteria.map((c) => {
          const v = scores[c.id] ?? null;
          return (
            <div key={c.id} className="rounded-md border bg-card p-2">
              <div className="mb-2 text-xs leading-snug">{c.label}</div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setOne(c.id, "pass")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "pass", "pass")}`}
                  disabled={!session}
                >
                  <Check className="h-3 w-3" /> Sí
                </button>
                <button
                  type="button"
                  onClick={() => setOne(c.id, "partial")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "partial", "partial")}`}
                  disabled={!session}
                >
                  <Minus className="h-3 w-3" /> Parc.
                </button>
                <button
                  type="button"
                  onClick={() => setOne(c.id, "fail")}
                  className={`flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs transition-colors ${verdictButtonClass(v === "fail", "fail")}`}
                  disabled={!session}
                >
                  <X className="h-3 w-3" /> No
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
          Enviar evaluación
        </Button>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer criterios</AlertDialogTitle>
            <AlertDialogDescription>
              Esto reemplaza todos los criterios actuales por los 10 originales
              de Roleplaychatters. Cualquier criterio personalizado se borra.
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
                    toast.success("Criterios originales restablecidos");
                  },
                  onError: (err) =>
                    toast.error("No se pudo restablecer", {
                      description: (err as Error).message,
                    }),
                });
              }}
              disabled={resetMut.isPending}
            >
              {resetMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CriteriaPanel;
