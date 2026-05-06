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
import { useUserRole } from "@/hooks/useUserRole";
import { compressAudioIfNeeded } from "@/lib/audioCompress";
import {
  useAnalyzeQaCall,
  useCreateQaCall,
  useCurrentTenantId,
  useFetchIgAvatar,
  useFireQaWebhook,
  useQaModels,
  useTenantProfiles,
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

const MODEL_CATEGORIES: ModelCategory[] = ["A++", "A+", "A", "B+", "B", "C+", "C"];

const AgencyNewQa = () => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const { isAdmin, isManager, isSupervisor } = useUserRole();
  // Solo admin/manager/supervisor pueden subir QAs en nombre de otro
  // closer. Un closer regular queda lockeado a su propio nombre — no
  // puede atribuirse una llamada a otro o atribuir la suya a otro.
  const canPickAnyCloser = isAdmin || isManager || isSupervisor;
  // Lista de empleados del tenant actual — solo se carga cuando el
  // user puede elegir. Para closers regulares no hace falta.
  const closersQ = useTenantProfiles();
  const modelsQ = useQaModels();
  const tenantQ = useCurrentTenantId();
  const create = useCreateQaCall();
  const analyze = useAnalyzeQaCall();
  const transcribe = useTranscribeAudio();
  const uploadAudio = useUploadQaAudio();
  const upsertCloser = useUpsertQaCloser();
  const upsertModel = useUpsertQaModel();
  const fetchAvatar = useFetchIgAvatar();
  const fireWebhook = useFireQaWebhook();

  const defaultEvaluator = useMemo(() => {
    return (
      profileQ.data?.full_name?.trim() ||
      user?.user_metadata?.full_name?.trim() ||
      user?.email ||
      ""
    );
  }, [profileQ.data, user]);

  // closerId aquí = profiles.id del usuario CRM con rol "closer".
  // Al guardar, resolvemos su full_name y lo upsert-eamos en qa_closers
  // — así el roster de qa_closers queda sincronizado con los closers
  // reales del CRM sin tener que mantener dos listas a mano.
  const [closerId, setCloserId] = useState<string>("");
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

  // Lock closer al usuario logueado cuando no es admin/manager/supervisor.
  useEffect(() => {
    if (!canPickAnyCloser && user?.id && closerId !== user.id) {
      setCloserId(user.id);
    }
  }, [canPickAnyCloser, user?.id, closerId]);

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
  if (!closerId) errors.closer = "Elegí un closer";
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

      // 2. Upsert closer (por full_name del CRM) + modelo por nombre.
      // Para admin/manager/supervisor: usan el name del profile pickeado.
      // Para closers regulares (lockeados): cae al defaultEvaluator (su
      // propio name del perfil) porque no cargamos closersQ con su row.
      setSubmitStage("Guardando catálogo…");
      const pickedCloser = (closersQ.data ?? []).find((u) => u.id === closerId);
      const closerDisplayName =
        pickedCloser?.full_name?.trim() ||
        defaultEvaluator?.trim() ||
        "Closer sin nombre";
      const [qaCloserId, qaModelId] = await Promise.all([
        upsertCloser.mutateAsync(closerDisplayName),
        upsertModel.mutateAsync({
          name: modelName,
          category: modelCategory || null,
          country: modelCountry.trim() || null,
          ig_url: modelIgUrl.trim() || null,
        }),
      ]);

      // 2.5 Fire-and-forget: si el modelo tiene IG y aún no tiene
      // avatar, intentamos backfillearlo. No bloqueamos el submit —
      // el avatar se persiste async y aparece la próxima vez que se
      // refresca Calls/Models.
      if (modelIgUrl.trim()) {
        void fetchAvatar.mutateAsync(qaModelId).catch(() => {
          // Silent: cuenta privada o IG bloqueando el scrape no debería
          // hacer ruido al closer cuando lo importante (la QA) salió bien.
        });
      }

      // 3. Generamos call_id client-side y subimos el audio a Storage
      // PRIMERO. Antes transcribíamos mandando el File en multipart al
      // edge function, pero con audios comprimidos de ~8MB el gateway
      // cortaba la conexión y el browser veía "Failed to fetch". Storage
      // tiene transporte propio dimensionado para archivos grandes —
      // el edge después baja por path con service role.
      const callId = crypto.randomUUID();
      const ext = (audioForUpload.name.split(".").pop() || "mp3").toLowerCase();
      const audioPath = `${tenantQ.data}/${callId}.${ext}`;

      setSubmitStage("Subiendo audio a Storage…");
      toast.loading("Subiendo audio…", { id: "upload" });
      const savedAudioPath = await uploadAudio.mutateAsync({
        file: audioForUpload,
        path: audioPath,
      });
      toast.dismiss("upload");

      // 4. Transcribir vía Whisper (el edge baja desde Storage).
      setSubmitStage("Transcribiendo con Whisper…");
      toast.loading("Transcribiendo audio…", { id: "transcribe" });
      const transcribeResult = await transcribe.mutateAsync({
        audioPath: savedAudioPath,
      });
      toast.dismiss("transcribe");
      const transcriptText = transcribeResult.text.trim();
      if (transcriptText.length === 0) {
        throw new Error("Whisper devolvió transcripción vacía. ¿El audio tiene voz audible?");
      }

      // 5. Insert qa_calls con id explícito + transcript + audio_path.
      setSubmitStage("Guardando QA…");
      const row = await create.mutateAsync({
        closer_id: qaCloserId,
        model_id: qaModelId,
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
        // 9. Fire-and-forget del webhook a Apps Script para mail + Drive
        // doc + Sheet log. El examiner no espera el GAS (~10-30s); el
        // toast aparece cuando termina, o un warning si falla.
        void fireWebhook.mutateAsync({ callId: row.id })
          .then(() => {
            toast.success("Reporte enviado por mail", {
              description: "Apps Script recibió el análisis.",
            });
          })
          .catch((webhookErr) => {
            toast.warning("Reporte: webhook falló", {
              description: (webhookErr as Error).message,
            });
          });
      } catch (analyzeErr) {
        toast.error("Análisis IA falló — la QA quedó guardada igual", {
          description: (analyzeErr as Error).message,
        });
      }
    } catch (err) {
      toast.dismiss("compress");
      toast.dismiss("upload");
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
            {/* datalist solo para el modelo — la lista de closers
                viene del CRM (rol "closer"), no admite tipear nuevos. */}
            <datalist id="qa-models-list">
              {(modelsQ.data ?? []).map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>

            {/* Row 1: closer + modelo */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="closer">Closer *</Label>
                {canPickAnyCloser ? (
                  <CloserCombobox
                    value={closerId}
                    onChange={setCloserId}
                    options={closersQ.data ?? []}
                    loading={closersQ.isLoading}
                  />
                ) : (
                  // Closer regular: lockeado a su propio nombre. Mostramos
                  // el nombre como readonly + tooltip explicando por qué.
                  <Input
                    id="closer"
                    value={defaultEvaluator || "Tu nombre"}
                    readOnly
                    tabIndex={-1}
                    title="Solo admin/manager/supervisor pueden subir QAs en nombre de otro closer."
                    className="cursor-not-allowed bg-muted/40 text-muted-foreground"
                  />
                )}
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

/** Searchable combobox for the closer field. Filters the CRM users
 *  with role="closer" by typing. Same pattern as CountryCombobox but
 *  the value is the profile.id (not the display name). */
const CloserCombobox = ({
  value,
  onChange,
  options,
  loading,
}: {
  value: string;
  onChange: (id: string) => void;
  options: Array<{ id: string; full_name: string | null }>;
  loading?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          id="closer"
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected?.full_name?.trim() ||
              (loading
                ? "Cargando…"
                : options.length === 0
                  ? "Sin empleados en el tenant"
                  : "Elegí un closer")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar closer…" className="h-9" />
          <CommandList>
            {options.length === 0 ? (
              <CommandEmpty>
                No hay empleados todavía en el tenant.
              </CommandEmpty>
            ) : (
              <>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => {
                    const label = opt.full_name?.trim() || "(sin nombre)";
                    return (
                      <CommandItem
                        key={opt.id}
                        // value es lo que cmdk usa para filtrar — usamos el
                        // nombre legible para que tipear "ana" matchee a "Ana".
                        value={label}
                        onSelect={() => {
                          onChange(opt.id === value ? "" : opt.id);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5",
                            value === opt.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
