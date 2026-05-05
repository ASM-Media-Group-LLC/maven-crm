import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Check,
  CheckCircle2,
  ChevronsUpDown,
  FileAudio,
  Loader2,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CANONICAL_COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { compressAudioIfNeeded } from "@/lib/audioCompress";
import {
  useAnalyzeQaCall,
  useCreateQaCall,
  useCurrentTenantId,
  useQaClosers,
  useQaModels,
  useTranscribeAudio,
  useUploadQaAudio,
  useUpsertQaCloser,
  useUpsertQaModel,
  type ModelCategory,
} from "@/hooks/useAgencyQa";

// AgencyNewQa — audio-only intake con free-text para closer y modelo.
//
// Por qué free-text en vez de dropdown: en kash el closer escribe el
// nombre directamente (a veces sube QAs de modelos nuevas que aún no
// están en el catálogo). El backend hace UPSERT por nombre — si la
// modelo no existe, la crea con la metadata mínima del form.
//
// Cuando elegís una modelo existente del datalist, autofill: categoría,
// país, IG (campos que no querés re-tipear cada vez).
//
// Categoría (A++/A/B+/B/C+/C) sigue siendo required como en kash —
// es la lente principal de segmentación en el dashboard de Modelos.
// País + IG son optional en Maven MVP; cuando el scout team mete data
// vía Apify pipeline, esos quedan rellenados solos.

const today = () => new Date().toISOString().slice(0, 10);

const isAudioFile = (file: File): boolean => {
  const lower = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    [".mp3", ".m4a", ".wav", ".webm", ".ogg", ".flac", ".mp4", ".mpga"].some(
      (ext) => lower.endsWith(ext),
    )
  );
};

const MODEL_CATEGORIES: ModelCategory[] = ["A++", "A", "B+", "B", "C+", "C"];

const AgencyNewQa = () => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const closersQ = useQaClosers();
  const modelsQ = useQaModels();
  const tenantQ = useCurrentTenantId();
  const create = useCreateQaCall();
  const analyze = useAnalyzeQaCall();
  const transcribe = useTranscribeAudio();
  const uploadAudio = useUploadQaAudio();
  const upsertCloser = useUpsertQaCloser();
  const upsertModel = useUpsertQaModel();

  const defaultEvaluator = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  const [closerName, setCloserName] = useState<string>("");
  const [modelName, setModelName] = useState<string>("");
  const [modelCategory, setModelCategory] = useState<ModelCategory | "">("");
  const [modelCountry, setModelCountry] = useState<string>("");
  const [modelIgUrl, setModelIgUrl] = useState<string>("");
  const [callDate, setCallDate] = useState<string>(today());
  const [evaluatorName, setEvaluatorName] = useState<string>("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>("");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!evaluatorName && defaultEvaluator) setEvaluatorName(defaultEvaluator);
  }, [defaultEvaluator, evaluatorName]);

  // Auto-fill categoría/país/IG cuando el nombre tipeado matchea
  // exactamente una modelo del catálogo. Solo rellenamos cuando los
  // campos están vacíos para no pisar lo que el closer ya escribió.
  useEffect(() => {
    const trimmed = modelName.trim().toLowerCase();
    if (!trimmed || !modelsQ.data) return;
    const match = modelsQ.data.find((m) => m.name.trim().toLowerCase() === trimmed);
    if (!match) return;
    if (!modelCategory && match.category) {
      setModelCategory(match.category as ModelCategory);
    }
    if (!modelCountry && match.country) setModelCountry(match.country);
    if (!modelIgUrl && match.ig_url) setModelIgUrl(match.ig_url);
  }, [modelName, modelsQ.data, modelCategory, modelCountry, modelIgUrl]);

  const handleFileSelect = (file: File) => {
    if (!isAudioFile(file)) {
      toast.error("Formato no soportado", {
        description: "Subí un archivo de audio (.mp3 / .m4a / .wav / .webm / .ogg / .flac).",
      });
      return;
    }
    if (file.size === 0) {
      toast.error("El archivo está vacío");
      return;
    }
    setAudioFile(file);
  };

  const clearAudio = () => {
    setAudioFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const errors: Record<string, string> = {};
  if (!closerName.trim()) errors.closer = "Nombre del closer requerido";
  if (!modelName.trim()) errors.model = "Nombre de la modelo requerido";
  if (!modelCategory) errors.category = "Categoría requerida";
  if (!callDate) errors.callDate = "Fecha requerida";
  if (!audioFile) errors.audio = "Subí el audio de la llamada";

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !audioFile) return;
    if (!tenantQ.data) {
      toast.error("No se pudo determinar tu tenant", {
        description: "Reload e intenta de nuevo. Si sigue, avisá al admin.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Comprimir si supera 23MB.
      let audioForUpload = audioFile;
      if (audioFile.size > 23 * 1024 * 1024) {
        setSubmitStage("Comprimiendo audio…");
        toast.loading("Comprimiendo audio (10-30s)…", { id: "compress" });
        const compressed = await compressAudioIfNeeded(audioFile, (pct, label) => {
          toast.loading(`${label} ${pct}%`, { id: "compress" });
        });
        toast.dismiss("compress");
        audioForUpload = compressed.file;
        toast.message(
          `Comprimido: ${(compressed.originalSize / 1024 / 1024).toFixed(1)}MB → ${(compressed.finalSize / 1024 / 1024).toFixed(1)}MB`,
        );
      }

      // 2. Upsert closer + modelo por nombre.
      setSubmitStage("Guardando catálogo…");
      const [closerId, modelId] = await Promise.all([
        upsertCloser.mutateAsync(closerName),
        upsertModel.mutateAsync({
          name: modelName,
          category: modelCategory || null,
          country: modelCountry.trim() || null,
          ig_url: modelIgUrl.trim() || null,
        }),
      ]);

      // 3. Transcribir vía Whisper.
      setSubmitStage("Transcribiendo con Whisper…");
      toast.loading("Transcribiendo audio…", { id: "transcribe" });
      const transcribeResult = await transcribe.mutateAsync(audioForUpload);
      toast.dismiss("transcribe");
      const transcriptText = transcribeResult.text.trim();
      if (transcriptText.length === 0) {
        throw new Error("Whisper devolvió transcripción vacía. ¿El audio tiene voz audible?");
      }

      // 4. Generamos call_id client-side para usarlo como path del audio
      // y poder hacer todo en orden: upload audio → insert con audio_path.
      const callId = crypto.randomUUID();
      const ext = (audioForUpload.name.split(".").pop() || "mp3").toLowerCase();
      const audioPath = `${tenantQ.data}/${callId}.${ext}`;

      // 5. Subir audio a Storage.
      setSubmitStage("Subiendo audio a Storage…");
      let savedAudioPath: string | null = null;
      try {
        savedAudioPath = await uploadAudio.mutateAsync({
          file: audioForUpload,
          path: audioPath,
        });
      } catch (storageErr) {
        toast.error("Audio no se subió a Storage (la QA queda sin audio)", {
          description: (storageErr as Error).message,
        });
      }

      // 6. Insert qa_calls con id explícito + transcript + audio_path.
      setSubmitStage("Guardando QA…");
      const row = await create.mutateAsync({
        closer_id: closerId,
        model_id: modelId,
        call_date: callDate,
        evaluator_name: evaluatorName.trim() || defaultEvaluator,
        transcript: transcriptText,
        audio_path: savedAudioPath,
      });

      setLastSavedId(row.id);
      toast.success("QA guardada", { description: "Analizando con IA…" });

      // 7. Reset form (mantiene closer + evaluator + categoría — son
      // los que más se repiten cuando un closer sube varias QAs seguidas).
      setModelName("");
      setModelCountry("");
      setModelIgUrl("");
      setCallDate(today());
      setAudioFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // 8. Disparar análisis IA.
      setSubmitStage("Analizando con IA…");
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
      toast.dismiss("compress");
      toast.dismiss("transcribe");
      toast.error("No se pudo procesar la QA", {
        description: (err as Error).message,
      });
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  };

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

  const audioSizeMb = audioFile ? audioFile.size / 1024 / 1024 : 0;
  const willCompress = audioSizeMb > 23;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Nueva QA</h2>
        <p className="text-xs text-muted-foreground">
          Subí el audio crudo de la llamada. La transcripción se hace
          server-side con Whisper (no editable). El audio queda guardado
          para auditoría y se puede escuchar desde el detalle de la QA.
          Si el closer o la modelo todavía no están en el catálogo, los
          tipeás y se crean al guardar.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-5 p-6">
            {/* Datalists con sugerencias del catálogo (HTML nativo, sin
                dependencia extra). El user puede tipear cualquier valor;
                si matchea con uno existente, fast-path. */}
            <datalist id="qa-closers-list">
              {(closersQ.data ?? []).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            <datalist id="qa-models-list">
              {(modelsQ.data ?? []).map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>

            {/* Row 1: closer + modelo */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="closer">Closer *</Label>
                <Input
                  id="closer"
                  list="qa-closers-list"
                  placeholder="Tipeá el nombre del closer"
                  value={closerName}
                  onChange={(e) => setCloserName(e.target.value)}
                  autoComplete="off"
                />
                {errors.closer && (
                  <p className="text-xs text-rose-400">{errors.closer}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo *</Label>
                <Input
                  id="model"
                  list="qa-models-list"
                  placeholder="Tipeá el nombre de la modelo"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  autoComplete="off"
                />
                {errors.model && (
                  <p className="text-xs text-rose-400">{errors.model}</p>
                )}
              </div>
            </div>

            {/* Row 2: categoría + país + ig */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">Categoría modelo *</Label>
                <Select
                  value={modelCategory || undefined}
                  onValueChange={(v) => setModelCategory(v as ModelCategory)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Elegí" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-xs text-rose-400">{errors.category}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">País modelo</Label>
                <CountryCombobox value={modelCountry} onChange={setModelCountry} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig">Instagram</Label>
                <Input
                  id="ig"
                  placeholder="@user o instagram.com/user"
                  value={modelIgUrl}
                  onChange={(e) => setModelIgUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Row 3: fecha + evaluador */}
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
                <Label htmlFor="evaluator">Evaluador</Label>
                <Input
                  id="evaluator"
                  placeholder="Tu nombre (opcional, default: tu perfil)"
                  value={evaluatorName}
                  onChange={(e) => setEvaluatorName(e.target.value)}
                />
              </div>
            </div>

            {/* Audio upload */}
            <div className="space-y-1.5">
              <Label>Audio de la llamada *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.flac,.mpga,.mp4"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {audioFile ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileAudio className="h-5 w-5 shrink-0 text-emerald-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{audioFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {audioSizeMb.toFixed(2)} MB
                        {willCompress && " · se comprime al subir (>23MB)"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={submitting}
                    onClick={clearAudio}
                    className="gap-1"
                  >
                    <X className="h-3 w-3" />
                    Quitar
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-8 text-center transition-colors hover:bg-muted/30 disabled:opacity-50"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm font-medium">Click para elegir audio</p>
                  <p className="text-[11px] text-muted-foreground">
                    .mp3 · .m4a · .wav · .webm · .ogg · .flac
                    <br />
                    Audios &gt; 23MB se comprimen automáticamente en el navegador.
                  </p>
                </button>
              )}
              {errors.audio && (
                <p className="text-xs text-rose-400">{errors.audio}</p>
              )}
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
              {lastSavedId && !submitting && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={analyze.isPending}
                  onClick={handleAnalyze}
                  className="gap-1.5"
                >
                  {analyze.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Re-analizar IA (última)
                </Button>
              )}
              <Button
                type="submit"
                disabled={!isValid || submitting}
                className="gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {submitting ? submitStage || "Procesando…" : "Guardar QA"}
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
                La fila ya está en <code>qa_calls</code> con audio en Storage,
                transcript y análisis IA. Aparece en la pestaña Calls.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/** Searchable combobox for the country field. Lets the closer type to
 *  filter the canonical list (e.g. "arg" → Argentina) and pick from
 *  the dropdown. Built on shadcn Command + Popover; cmdk handles the
 *  fuzzy matching out of the box. */
const CountryCombobox = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value || "Elegí un país"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar país…" className="h-9" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {CANONICAL_COUNTRIES.map((country) => (
                <CommandItem
                  key={country}
                  value={country}
                  onSelect={(picked) => {
                    onChange(picked === value.toLowerCase() ? "" : country);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === country ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {country}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AgencyNewQa;
