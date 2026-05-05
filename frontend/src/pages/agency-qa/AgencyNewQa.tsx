import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import {
  useAnalyzeQaCall,
  useCreateQaCall,
  useQaClosers,
  useQaModels,
  useTranscribeAudio,
} from "@/hooks/useAgencyQa";

// AgencyNewQa — formulario para registrar manualmente una nueva QA.
// Soporta:
//   - Pegar transcript en el textarea
//   - Subir archivo .txt (FileReader)
//   - Subir archivo .docx (mammoth, dynamic import — solo se carga
//     cuando hace falta para no inflar el bundle inicial)
// Insertar el row dispara automáticamente la edge function qa-analyze.
//
// Próximas slices:
//   - Upload de audio (mp3/m4a/wav) → edge function qa-transcribe
//     con Groq Whisper, auto-fill del transcript.
//   - Audio metrics (WPM, fillers, monólogo) — kash usa ffmpeg.

const today = () => new Date().toISOString().slice(0, 10);

const AgencyNewQa = () => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const closersQ = useQaClosers();
  const modelsQ = useQaModels();
  const create = useCreateQaCall();
  const analyze = useAnalyzeQaCall();
  const transcribe = useTranscribeAudio();

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
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    const lower = file.name.toLowerCase();
    const isTxt = lower.endsWith(".txt") || file.type === "text/plain";
    const isDocx =
      lower.endsWith(".docx") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const isAudio =
      file.type.startsWith("audio/") ||
      [".mp3", ".m4a", ".wav", ".webm", ".ogg", ".flac", ".mp4", ".mpga"].some(
        (ext) => lower.endsWith(ext),
      );

    if (lower.endsWith(".doc") && !isDocx) {
      toast.error("Formato .doc antiguo no soportado", {
        description: "Guardá como .docx o pegá el texto.",
      });
      return;
    }
    if (!isTxt && !isDocx && !isAudio) {
      toast.error("Formato no soportado", {
        description: "Aceptamos .txt, .docx o audio (mp3/m4a/wav/webm).",
      });
      return;
    }

    setParsing(true);
    try {
      let text = "";
      if (isTxt) {
        text = await file.text();
      } else if (isDocx) {
        // mammoth se carga via dynamic import para no inflar el bundle
        // de páginas que no lo necesitan.
        const mammoth = await import("mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value ?? "";
      } else {
        // Audio: pasamos al edge function qa-transcribe (Groq Whisper).
        // Toast informativo porque puede tardar 5-30s según duración.
        toast.loading("Transcribiendo audio con Whisper…", { id: "transcribe" });
        const result = await transcribe.mutateAsync(file);
        toast.dismiss("transcribe");
        text = result.text;
      }
      const cleaned = text.trim();
      if (cleaned.length === 0) {
        toast.error("El archivo no tiene texto");
        return;
      }
      setTranscript(cleaned);
      setUploadedFile({ name: file.name, size: file.size });
      toast.success(
        isAudio
          ? `Audio transcripto · ${cleaned.length.toLocaleString()} chars`
          : `Transcript cargado · ${cleaned.length.toLocaleString()} chars`,
      );
    } catch (err) {
      toast.dismiss("transcribe");
      toast.error(
        isAudio ? "No se pudo transcribir el audio" : "No se pudo leer el archivo",
        { description: (err as Error).message },
      );
    } finally {
      setParsing(false);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setTranscript("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

            {/* Transcript — upload o pegar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="transcript">Transcript *</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {transcriptWords} palabras · {transcriptChars} chars
                </span>
              </div>

              {/* Upload zone */}
              <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac,.mpga,.mp4"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileUpload(file);
                  }}
                />
                {uploadedFile ? (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="truncate font-medium">{uploadedFile.name}</span>
                      <span className="text-muted-foreground">
                        · {(uploadedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearUploadedFile}
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <X className="h-3 w-3" />
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Upload className="h-4 w-4" />
                      <span>
                        Subí .txt / .docx, o audio (.mp3 / .m4a / .wav, máx 25MB) — o pegá el texto abajo.
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={parsing}
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1.5"
                    >
                      {parsing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {parsing
                        ? transcribe.isPending
                          ? "Transcribiendo…"
                          : "Leyendo…"
                        : "Elegir archivo"}
                    </Button>
                  </div>
                )}
              </div>

              <Textarea
                id="transcript"
                placeholder="…o pegá la transcripción completa acá."
                rows={14}
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  // Si el usuario edita manualmente después de subir un
                  // archivo, despegamos el indicador de "archivo cargado"
                  // (el texto ya no refleja el archivo original).
                  if (uploadedFile) setUploadedFile(null);
                }}
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
