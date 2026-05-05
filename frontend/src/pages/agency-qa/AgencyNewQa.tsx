import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Save, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import {
  useAnalyzeQaCall,
  useCreateQaCall,
  useQaClosers,
  useQaModels,
} from "@/hooks/useAgencyQa";

// AgencyNewQa — formulario para registrar manualmente una nueva QA.
// Esta slice cubre la mitad "create": persiste la fila en qa_calls
// con claude_analysis: {} y claude_score: 0. La mitad "enrich" (llamar
// a Groq con el prompt de kash adaptado, parsear el JSON, persistir
// el análisis) llega en la próxima slice cuando GROQ_API_KEY esté
// configurado en los secrets de Supabase.
//
// Out of scope (próximas slices):
//   - Subir transcript desde archivo (.txt / .docx — kash usa mammoth)
//   - Audio metrics (kash recibe MP3 + extrae métricas)
//   - Botón "Analizar con IA" → llama edge function qa-analyze
//   - Re-analyze de calls existentes

const today = () => new Date().toISOString().slice(0, 10);

const AgencyNewQa = () => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const closersQ = useQaClosers();
  const modelsQ = useQaModels();
  const create = useCreateQaCall();
  const analyze = useAnalyzeQaCall();

  // Pre-fill evaluator name from the logged-in user's profile, with
  // email fallback if profile.full_name is empty.
  const defaultEvaluator = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  const [closerId, setCloserId] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [callDate, setCallDate] = useState<string>(today());
  const [evaluatorName, setEvaluatorName] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // Re-set evaluator name once profile loads (initial render evaluator
  // is empty until profile resolves).
  useEffect(() => {
    if (!evaluatorName && defaultEvaluator) setEvaluatorName(defaultEvaluator);
  }, [defaultEvaluator, evaluatorName]);

  const errors: Record<string, string> = {};
  if (!closerId) errors.closer = "Selecciona un closer";
  if (!modelId) errors.model = "Selecciona un modelo";
  if (!callDate) errors.callDate = "Fecha requerida";
  if (!evaluatorName.trim()) errors.evaluator = "Nombre del evaluador requerido";
  if (transcript.trim().length < 50)
    errors.transcript =
      "Transcript demasiado corto (mínimo 50 caracteres)";

  const isValid = Object.keys(errors).length === 0;
  const transcriptChars = transcript.length;
  const transcriptWords = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    try {
      const row = await create.mutateAsync({
        closer_id: closerId,
        model_id: modelId,
        call_date: callDate,
        evaluator_name: evaluatorName.trim(),
        transcript,
      });
      toast.success("QA guardada", {
        description: "Analizando con IA…",
      });
      setLastSavedId(row.id);
      // Reset form keeping evaluator + closer (often same closer for several QAs in a row).
      setModelId("");
      setCallDate(today());
      setTranscript("");
      // Auto-dispatch analysis. If GROQ_API_KEY isn't wired or the edge
      // function isn't deployed yet, the toast surfaces the error and the
      // row stays with claude_analysis: {} until re-triggered manually.
      try {
        const result = await analyze.mutateAsync(row.id);
        toast.success(`Análisis IA listo · score ${result.score}/100`, {
          description: "Aparece en Calls con detalle completo.",
        });
      } catch (analyzeErr) {
        toast.error("Análisis IA falló — la QA quedó guardada igual", {
          description: (analyzeErr as Error).message,
        });
      }
    } catch (err) {
      toast.error("No se pudo guardar la QA", {
        description: (err as Error).message,
      });
    }
  };

  // Manual re-analyze trigger for the just-saved call (tooltip button).
  const handleAnalyze = async () => {
    if (!lastSavedId) return;
    try {
      const result = await analyze.mutateAsync(lastSavedId);
      toast.success(`Análisis IA listo · score ${result.score}/100`);
    } catch (err) {
      toast.error("Análisis IA falló", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Nueva QA</h2>
        <p className="text-xs text-muted-foreground">
          Carga una llamada manualmente. El análisis automático con IA llega
          cuando <code className="rounded bg-muted/40 px-1">GROQ_API_KEY</code>{" "}
          esté configurado en Supabase.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-5 p-6">
            {/* Row 1: closer + modelo */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="closer">Closer *</Label>
                <Select value={closerId || undefined} onValueChange={setCloserId}>
                  <SelectTrigger id="closer">
                    <SelectValue
                      placeholder={
                        closersQ.isLoading ? "Cargando…" : "Elegí un closer"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(closersQ.data ?? []).length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Sin closers en el catálogo
                      </div>
                    ) : (
                      closersQ.data!.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.closer && (
                  <p className="text-xs text-rose-400">{errors.closer}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo *</Label>
                <Select value={modelId || undefined} onValueChange={setModelId}>
                  <SelectTrigger id="model">
                    <SelectValue
                      placeholder={
                        modelsQ.isLoading ? "Cargando…" : "Elegí una modelo"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(modelsQ.data ?? []).length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Sin modelos en el catálogo
                      </div>
                    ) : (
                      modelsQ.data!.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.model && (
                  <p className="text-xs text-rose-400">{errors.model}</p>
                )}
              </div>
            </div>

            {/* Row 2: fecha + evaluator */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="call_date">Fecha de la llamada *</Label>
                <Input
                  id="call_date"
                  type="date"
                  value={callDate}
                  max={today()}
                  onChange={(e) => setCallDate(e.target.value)}
                />
                {errors.callDate && (
                  <p className="text-xs text-rose-400">{errors.callDate}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evaluator">Evaluador *</Label>
                <Input
                  id="evaluator"
                  placeholder="Tu nombre"
                  value={evaluatorName}
                  onChange={(e) => setEvaluatorName(e.target.value)}
                />
                {errors.evaluator && (
                  <p className="text-xs text-rose-400">{errors.evaluator}</p>
                )}
              </div>
            </div>

            {/* Transcript */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="transcript">Transcript *</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {transcriptWords} palabras · {transcriptChars} chars
                </span>
              </div>
              <Textarea
                id="transcript"
                placeholder="Pegá la transcripción completa de la llamada aquí…"
                rows={14}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="font-mono text-xs"
              />
              {errors.transcript && (
                <p className="text-xs text-rose-400">{errors.transcript}</p>
              )}
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!lastSavedId || analyze.isPending}
                        onClick={handleAnalyze}
                        className="gap-1.5"
                      >
                        {analyze.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Re-analizar IA
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[260px]">
                    <p className="text-xs">
                      Vuelve a correr el análisis Groq sobre la última QA
                      guardada. Útil si el primer análisis falló o si querés
                      regenerarlo después de un cambio en el prompt.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                type="submit"
                disabled={!isValid || create.isPending || analyze.isPending}
                className="gap-1.5"
              >
                {create.isPending || analyze.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {analyze.isPending ? "Analizando…" : "Guardar QA"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {lastSavedId && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div className="flex-1 space-y-0.5 text-sm">
              <p className="font-semibold">QA registrada (id corto: {lastSavedId.slice(0, 8)})</p>
              <p className="text-muted-foreground">
                La fila ya está en <code>qa_calls</code> con análisis vacío.
                Aparecerá en la pestaña Calls. Cuando GROQ_API_KEY esté wired,
                podrás dispararle el análisis desde el detail drawer.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AgencyNewQa;
