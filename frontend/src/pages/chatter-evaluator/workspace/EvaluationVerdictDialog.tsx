import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Loader2, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  useChatterCriteria,
  useSubmitEvaluation,
} from "@/hooks/useChatterEvaluator";
import type {
  ChatterSession,
  EvaluationVerdict,
  CriterionResult,
} from "../types";
import type { CriteriaScores } from "./CriteriaPanel";

interface Props {
  session: ChatterSession;
  scores: CriteriaScores;
  scorePct: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}

const EXAMINER_NAME_KEY = "maven.chatter.lastExaminerName";

export const EvaluationVerdictDialog = ({
  session,
  scores,
  scorePct,
  open,
  onOpenChange,
  onSubmitted,
}: Props) => {
  const criteriaQ = useChatterCriteria();
  const submit = useSubmitEvaluation();

  const [examinerName, setExaminerName] = useState("");
  const [verdict, setVerdict] = useState<EvaluationVerdict | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (open) {
      const remembered = window.localStorage.getItem(EXAMINER_NAME_KEY) ?? "";
      setExaminerName(remembered);
      // Pre-suggest verdict based on score
      setVerdict(scorePct >= 50 ? "apto" : "no_apto");
      setFeedback("");
    }
  }, [open, scorePct]);

  const criteria = criteriaQ.data ?? [];
  // Only count scores whose key matches a CURRENT criterion id. After a
  // criteria reset, localStorage may still hold scores keyed by old ids
  // that no longer exist — those would inflate the count and (worse)
  // never be matched against `criteria`, leaving the button stuck
  // disabled even when every visible row has been rated.
  const filledCount = criteria.reduce(
    (n, c) => (scores[c.id] ? n + 1 : n),
    0,
  );
  const allFilled = filledCount === criteria.length && criteria.length > 0;
  const missing = criteria.length - filledCount;

  const handleSubmit = async () => {
    if (!examinerName.trim()) {
      toast.error("Pon tu nombre");
      return;
    }
    if (!verdict) {
      toast.error("Selecciona APTO o NO APTO");
      return;
    }

    const criteriaResults: CriterionResult[] = criteria
      .map((c) => {
        const s = scores[c.id];
        if (!s) return null;
        return {
          criterion_id: c.id,
          label: c.label,
          status: s,
        };
      })
      .filter(Boolean) as CriterionResult[];

    if (criteriaResults.length === 0) {
      toast.error("No hay criterios calificados");
      return;
    }
    if (criteriaResults.length < criteria.length) {
      toast.error(
        `Faltan ${criteria.length - criteriaResults.length} criterio(s) por calificar`,
        {
          description: "Antes de enviar la evaluación, califica todos.",
        },
      );
      return;
    }

    window.localStorage.setItem(EXAMINER_NAME_KEY, examinerName.trim());

    try {
      await submit.mutateAsync({
        sessionId: session.id,
        examinerName: examinerName.trim(),
        verdict,
        feedback,
        criteriaResults,
        scorePct,
      });

      // Webhook fires in the background (Apps Script can take 10-30s).
      // The submit hook itself emits a toast with the webhook outcome
      // when it eventually finishes.
      toast.success("Evaluación guardada", {
        description: "El reporte se está enviando a Apps Script en segundo plano.",
      });

      onOpenChange(false);
      onSubmitted?.();
    } catch (e) {
      toast.error("No se pudo guardar", {
        description: (e as Error).message,
      });
    }
  };

  const badgeText =
    scorePct >= 80 ? "APROBADO" : scorePct >= 50 ? "A CRITERIO" : "NO APTO";
  const badgeColor =
    scorePct >= 80
      ? "text-emerald-400"
      : scorePct >= 50
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar evaluación de {session.chatter_name}</DialogTitle>
          <DialogDescription>
            Esto cierra la sesión y manda el reporte al webhook configurado en Admin (Drive doc + Sheet row + emails).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Score summary */}
          <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
            <div>
              <div className="text-2xl font-bold tabular-nums">{scorePct}%</div>
              <div className="text-[10px] text-muted-foreground">
                {filledCount} de {criteria.length} criterios calificados
              </div>
            </div>
            <div className={`text-sm font-semibold ${badgeColor}`}>{badgeText}</div>
          </div>

          {missing > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 p-2 text-xs text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Faltan {missing} criterio(s) por calificar. Termina de calificarlos antes de enviar la evaluación.
              </span>
            </div>
          )}

          <div>
            <Label htmlFor="examiner_name">Tu nombre (examinador)</Label>
            <Input
              id="examiner_name"
              value={examinerName}
              onChange={(e) => setExaminerName(e.target.value)}
              placeholder="Nombre completo"
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">Verdict</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVerdict("apto")}
                className={`flex items-center justify-center gap-2 rounded-md border-2 px-4 py-4 text-sm font-semibold transition-colors ${
                  verdict === "apto"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-border hover:border-emerald-500/40"
                }`}
              >
                <Check className="h-5 w-5" />
                APTO
              </button>
              <button
                type="button"
                onClick={() => setVerdict("no_apto")}
                className={`flex items-center justify-center gap-2 rounded-md border-2 px-4 py-4 text-sm font-semibold transition-colors ${
                  verdict === "no_apto"
                    ? "border-rose-500 bg-rose-500/10 text-rose-300"
                    : "border-border hover:border-rose-500/40"
                }`}
              >
                <X className="h-5 w-5" />
                NO APTO
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="feedback">Feedback (opcional)</Label>
            <Textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              placeholder="Observaciones, sugerencias, recomendaciones…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submit.isPending ||
              !verdict ||
              !examinerName.trim() ||
              !allFilled
            }
            className="gap-2"
            title={!allFilled ? "Completa todos los criterios antes de enviar" : undefined}
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar evaluación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EvaluationVerdictDialog;
