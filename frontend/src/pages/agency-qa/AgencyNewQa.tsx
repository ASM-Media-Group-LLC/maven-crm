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
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CANONICAL_COUNTRIES } from "@/lib/countries";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import { useUserRole } from "@/hooks/useUserRole";
import { compressAudioIfNeeded } from "@/lib/audioCompress";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato } from "@/pages/admin/ConFormato";
import {
  useAnalyzeQaCall,
  useCreateQaCall,
  useReprocessQaCall,
  useCurrentTenantId,
  useFetchIgAvatar,
  useFireQaWebhook,
  useIgLookup,
  useQaModels,
  useSearchModelsForQa,
  useTenantProfiles,
  useTranscribeAudio,
  useUploadQaAudio,
  useUpsertQaCloser,
  useUpsertQaModel,
  type ModelCategory,
  type ModelSearchResult,
} from "@/hooks/useAgencyQa";

// AgencyNewQa — audio-only intake con free-text para closer y modelo.
//
// Por qué free-text en vez de dropdown: en kash el closer escribe el
// nombre directamente (a veces sube QAs de modelos nuevas que aún no
// están en el catálogo). El backend hace UPSERT por nombre — si la
// modelo no existe, la crea con la metadata mínima del form.
//
// Cuando eliges una modelo existente del datalist, autofill: categoría,
// país, IG (campos que no quieres re-tipear cada vez).
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

// Tipo de llamada. La IA evalúa cada uno con un framing distinto (ver
// qa-analyze/prompt.ts): reclutar para la agencia · venderle un servicio a una
// creadora propia · venderle una plataforma a una modelo EXTERNA.
type CallType = "reclutamiento" | "venta_servicio" | "venta_externa";

// Los dos tipos de venta piden "Servicio ofrecido".
const isSaleType = (t: CallType) => t === "venta_servicio" || t === "venta_externa";

// Servicios/plataformas que un closer puede vender (a creadora propia o a una
// modelo externa). Los que pidió Miguel (Kash/Unlimited) + las plataformas del
// pipeline de closers (SALE_PLATFORMS de useCloserLeads).
// Trafix salió del catálogo (discontinuada) → ya no se ofrece. Las QA viejas
// que la tengan guardada siguen mostrándose bien: el valor se lee de la fila,
// no de esta lista.
// ⚠️ El valor se guarda en qa_calls.service_sold y lo lee qa-analyze: no se
// traduce. Solo se traduce la ETIQUETA de "Otro" (ver SERVICE_LABEL).
const QA_SERVICES = [
  "Kash",
  "Unlimited",
  "Blu",
  "Piclink",
  "Content Protector",
  "ORA",
  "Let's Shoot",
  // Make Me: producto de generación con IA del ecosistema. Sin esta opción las
  // ventas de Make Me entraban como "Otro" y el evaluador no sabía qué se vendió.
  "Make Me",
  "Otro",
] as const;
const SERVICE_LABEL: Partial<Record<(typeof QA_SERVICES)[number], TranslationKey>> = {
  Otro: "agencyQa.new.serviceOther",
};

const AgencyNewQa = () => {
  const { t } = useLanguage();
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
  const reprocess = useReprocessQaCall();
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
  // Closers de soporte (opcional, multi-select). Cuando el primary se
  // hizo cargo principal pero otros closers participaron en la llamada,
  // se agregan acá. Después de qa-analyze, los participation_pct se
  // redistribuyen automáticamente según talk_ratio del audio.
  // Solo admin/manager/supervisor puede agregar soportes.
  const [supportCloserIds, setSupportCloserIds] = useState<string[]>([]);
  // Regla nueva (2026-05): el form ya no acepta nombres libres. El closer
  // tiene que seleccionar una modelo que ya exista en `models` (catálogo
  // canónico). Si no existe, primero hay que crear el lead en /scouter o
  // /lead-gen. Esto cierra el agujero de qa_models huérfanos.
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [modelName, setModelName] = useState<string>("");
  const [modelSearch, setModelSearch] = useState<string>("");
  const [modelComboOpen, setModelComboOpen] = useState(false);
  const modelBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modelCategory, setModelCategory] = useState<ModelCategory | "">("");
  const [modelCountry, setModelCountry] = useState<string>("");
  const [modelIgUrl, setModelIgUrl] = useState<string>("");

  const modelSearchQ = useSearchModelsForQa(modelSearch, {
    enabled: modelComboOpen && modelSearch.trim().length >= 2,
  });

  const handlePickModel = (m: ModelSearchResult) => {
    setSelectedModelId(m.id);
    setModelName(m.display_name || m.instagram_handle || "");
    if (m.instagram_handle && !modelIgUrl) {
      setModelIgUrl(`https://instagram.com/${m.instagram_handle}`);
    }
    if (m.country && !modelCountry) setModelCountry(m.country);
    setModelComboOpen(false);
    setModelSearch("");
  };

  // Debounced IG lookup — al ingresar o pegar el handle/URL de la
  // modelo, esperamos 500ms tras la última tecla y disparamos un
  // lookup cross-modular (scouter_leads / closer_creators / etc.) para
  // avisar al closer si la modelo ya existe en el sistema.
  const [debouncedIg, setDebouncedIg] = useState<string>("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedIg(modelIgUrl), 500);
    return () => clearTimeout(t);
  }, [modelIgUrl]);
  const igLookupQ = useIgLookup(debouncedIg, {
    enabled: debouncedIg.trim().length >= 3,
  });

  const [callDate, setCallDate] = useState<string>(today());
  // Tipo de llamada: reclutamiento (default, comportamiento histórico) o venta
  // de un servicio del portfolio a una creadora que YA es de la agencia.
  // qa-analyze ajusta el rubric/outcome según esto (pedido de Miguel: la IA
  // evaluaba las ventas de Unlimited/Kash como reclutamiento fallido).
  const [callType, setCallType] = useState<CallType>("reclutamiento");
  const [serviceSold, setServiceSold] = useState<string>("");
  // Evaluador por defecto: "Claude AI" (la IA es quien hace la evaluación).
  const [evaluatorName, setEvaluatorName] = useState<string>("Claude AI");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>("");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // (Se removió el auto-fill desde el perfil — el evaluador queda en
  //  "Claude AI" por defecto y el usuario puede cambiarlo si quiere.)

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
      toast.error(t("agencyQa.new.badFormat"), {
        description: t("agencyQa.new.badFormatHint"),
      });
      return;
    }
    if (file.size === 0) {
      toast.error(t("agencyQa.new.emptyFile"));
      return;
    }
    setAudioFile(file);
  };

  const clearAudio = () => {
    setAudioFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const errors: Record<string, string> = {};
  if (!closerId) errors.closer = t("agencyQa.new.err.closer");
  if (!selectedModelId) errors.model = t("agencyQa.new.err.model");
  if (!modelCategory) errors.category = t("agencyQa.new.err.category");
  if (!modelCountry.trim()) errors.country = t("agencyQa.new.err.country");
  if (!modelIgUrl.trim()) errors.ig = t("agencyQa.new.err.ig");
  if (!callDate) errors.callDate = t("agencyQa.new.err.date");
  if (!evaluatorName.trim()) errors.evaluator = t("agencyQa.new.err.evaluator");
  if (isSaleType(callType) && !serviceSold) errors.service = t("agencyQa.new.err.service");
  if (!audioFile) errors.audio = t("agencyQa.new.err.audio");

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !audioFile) return;
    if (!tenantQ.data) {
      toast.error(t("agencyQa.new.noTenant"), {
        description: t("agencyQa.new.noTenantHint"),
      });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Comprimir si supera 23MB.
      let audioForUpload = audioFile;
      if (audioFile.size > 23 * 1024 * 1024) {
        setSubmitStage(t("agencyQa.new.compressing"));
        toast.loading(t("agencyQa.new.compressingLong"), { id: "compress" });
        const compressed = await compressAudioIfNeeded(audioFile, (pct, label) => {
          toast.loading(`${label} ${pct}%`, { id: "compress" });
        });
        toast.dismiss("compress");
        audioForUpload = compressed.file;
        toast.message(
          t("agencyQa.new.compressed", {
            from: (compressed.originalSize / 1024 / 1024).toFixed(1),
            to: (compressed.finalSize / 1024 / 1024).toFixed(1),
          }),
        );
      }

      // 2. Upsert closer (por full_name del CRM) + modelo por nombre.
      // Para admin/manager/supervisor: usan el name del profile pickeado.
      // Para closers regulares (lockeados): cae al defaultEvaluator (su
      // propio name del perfil) porque no cargamos closersQ con su row.
      setSubmitStage(t("agencyQa.new.savingCatalog"));
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
          model_id: selectedModelId || null,
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

      setSubmitStage(t("agencyQa.new.uploadingStorage"));
      toast.loading(t("agencyQa.new.uploading"), { id: "upload" });
      const savedAudioPath = await uploadAudio.mutateAsync({
        file: audioForUpload,
        path: audioPath,
      });
      toast.dismiss("upload");

      // 4. Crear la fila YA (estado "procesando"), ANTES de transcribir. El audio
      // ya está en Storage, así la subida NUNCA se pierde aunque la transcripción
      // falle o se corte el navegador. (Antes la fila se creaba DESPUÉS de
      // transcribir → si fallaba, el closer perdía la QA sin saberlo. Caso real:
      // Miguel 2026-06-11.) El trigger AFTER INSERT auto-crea el participant primary.
      setSubmitStage(t("agencyQa.new.savingQa"));
      const row = await create.mutateAsync({
        closer_id: qaCloserId,
        model_id: qaModelId,
        call_date: callDate,
        evaluator_name: evaluatorName.trim() || defaultEvaluator,
        audio_path: savedAudioPath,
        status: "processing",
        call_type: callType,
        service_sold: isSaleType(callType) ? serviceSold : null,
      });

      // 5.5 Insertar closers de soporte como participants.
      // El pct queda en 1.0 inicialmente; qa-analyze redistribuye al
      // terminar el análisis llamando a recalculate_qa_call_participants.
      if (supportCloserIds.length > 0) {
        try {
          const supportRows = supportCloserIds
            .filter((id) => id !== qaCloserId) // evitar duplicar primary
            .map((id) => ({
              call_id: row.id,
              closer_id: id,
              role: "support" as const,
              participation_pct: 1.0,
            }));
          if (supportRows.length > 0) {
            const { error: supErr } = await supabase
              .from("qa_call_participants")
              .insert(supportRows);
            if (supErr) {
              console.warn("Error agregando supports:", supErr.message);
              toast.warning(t("agencyQa.new.supportsFailed"), {
                description: supErr.message,
              });
            }
          }
        } catch (e) {
          console.warn("Support insert threw:", (e as Error).message);
        }
      }

      setLastSavedId(row.id);
      toast.success(t("agencyQa.new.saved"), { description: t("agencyQa.new.analyzingAi") });

      // 7. Reset form (mantiene closer + evaluator + categoría — son
      // los que más se repiten cuando un closer sube varias QAs seguidas).
      setModelName("");
      setSelectedModelId("");
      setModelCountry("");
      setModelIgUrl("");
      setCallDate(today());
      setAudioFile(null);
      setSupportCloserIds([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      // 8. Transcribir + analizar (server-side). La fila ya existe en 'processing';
      // esto la completa (status → 'ready'). El email lo manda qa-analyze
      // server-side al terminar. Si falla, reprocess deja la fila en 'failed' con
      // el motivo → se Reintenta desde Calls. La subida NO se pierde.
      setSubmitStage(t("agencyQa.new.transcribing"));
      toast.loading(t("agencyQa.new.transcribing"), { id: "process" });
      try {
        const result = await reprocess.mutateAsync(row.id);
        toast.dismiss("process");
        toast.success(t("agencyQa.new.ready", { score: result.score }), {
          description: t("agencyQa.new.readyHint"),
        });
      } catch (procErr) {
        toast.dismiss("process");
        toast.error(t("agencyQa.new.savedButFailed"), {
          description: t("agencyQa.new.savedButFailedHint", { msg: (procErr as Error).message }),
        });
      }
    } catch (err) {
      toast.dismiss("compress");
      toast.dismiss("upload");
      toast.dismiss("transcribe");
      toast.error(t("agencyQa.new.couldNotProcess"), {
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
      toast.success(t("agencyQa.new.analysisReady", { score: result.score }));
    } catch (err) {
      toast.error(t("agencyQa.new.analysisFailed"), {
        description: (err as Error).message,
      });
    }
  };

  const audioSizeMb = audioFile ? audioFile.size / 1024 / 1024 : 0;
  const willCompress = audioSizeMb > 23;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">{t("agencyQa.tab.newQa")}</h2>
        <p className="text-xs text-muted-foreground">{t("agencyQa.new.intro")}</p>
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
                    value={defaultEvaluator || t("agencyQa.new.yourName")}
                    readOnly
                    tabIndex={-1}
                    title={t("agencyQa.new.lockedCloser")}
                    className="cursor-not-allowed bg-muted/40 text-muted-foreground"
                  />
                )}
                {errors.closer && (
                  <p className="text-xs text-destructive">{errors.closer}</p>
                )}
                {/* Closers de soporte: solo para admin/manager/supervisor.
                    El primary lleva el 100% al inicio; qa-analyze redistribuye
                    los pct según talk_ratio del audio cuando termina. */}
                {canPickAnyCloser && (
                  <SupportClosersPicker
                    value={supportCloserIds}
                    onChange={setSupportCloserIds}
                    options={(closersQ.data ?? []).filter((u) => u.id !== closerId)}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="model">{t("agencyQa.new.modelRequired")}</Label>
                {/* Input único + lista inline. La lista se renderiza en flow
                    del DOM (empuja los demás campos hacia abajo) en vez de
                    flotar como popover ocluyendo el form. */}
                <div className="relative">
                  <Input
                    id="model"
                    value={modelName}
                    placeholder={t("agencyQa.new.searchModel")}
                    onChange={(e) => {
                      const v = e.target.value;
                      setModelName(v);
                      setModelSearch(v);
                      if (selectedModelId) setSelectedModelId("");
                    }}
                    onFocus={() => setModelComboOpen(true)}
                    onBlur={() => {
                      modelBlurTimeoutRef.current = setTimeout(() => setModelComboOpen(false), 150);
                    }}
                    className={cn(selectedModelId && "pr-8")}
                  />
                  {selectedModelId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedModelId("");
                        setModelName("");
                        setModelSearch("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted/60"
                      title={t("agencyQa.new.removeModel")}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                {modelComboOpen && !selectedModelId && modelSearch.trim().length >= 2 && (
                  <div
                    onMouseDown={() => {
                      if (modelBlurTimeoutRef.current) {
                        clearTimeout(modelBlurTimeoutRef.current);
                        modelBlurTimeoutRef.current = null;
                      }
                    }}
                    className="rounded-lg border border-border/60 bg-card shadow-sm max-h-72 overflow-y-auto"
                  >
                    {modelSearchQ.isFetching ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                        {t("agencyQa.new.searching")}
                      </p>
                    ) : (modelSearchQ.data ?? []).length === 0 ? (
                      <div className="px-3 py-3 text-center">
                        <p className="text-sm">{t("common.noResults")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <ConFormato
                            texto={t("agencyQa.new.createFirst")}
                            piezas={{
                              scouter: <a href="/scouter/leads" className="text-primary underline">Scouter</a>,
                              leadgen: <a href="/lead-gen" className="text-primary underline">Lead Gen</a>,
                            }}
                          />
                        </p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/40">
                        {(modelSearchQ.data ?? []).map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => handlePickModel(m)}
                              className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex items-center gap-2"
                            >
                              <Check
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  selectedModelId === m.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">
                                  {m.display_name || m.instagram_handle || t("agencyQa.noNameBare")}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {m.instagram_handle ? `@${m.instagram_handle}` : "—"}
                                  {m.country ? ` · ${m.country}` : ""}
                                </div>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {errors.model && (
                  <p className="text-xs text-destructive">{errors.model}</p>
                )}
              </div>
            </div>

            {/* Row 2: categoría + país + ig */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="category">{t("agencyQa.new.categoryRequired")}</Label>
                <Select
                  value={modelCategory || undefined}
                  onValueChange={(v) => setModelCategory(v as ModelCategory)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder={t("agencyQa.new.pick")} />
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
                  <p className="text-xs text-destructive">{errors.category}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country">{t("agencyQa.new.countryRequired")}</Label>
                <CountryCombobox value={modelCountry} onChange={setModelCountry} />
                {errors.country && (
                  <p className="text-xs text-destructive">{errors.country}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ig">Instagram *</Label>
                <Input
                  id="ig"
                  placeholder={t("agencyQa.new.igPlaceholder")}
                  value={modelIgUrl}
                  onChange={(e) => setModelIgUrl(e.target.value)}
                  required
                />
                {errors.ig && (
                  <p className="text-xs text-destructive">{errors.ig}</p>
                )}
              </div>
            </div>

            {/* IG cross-module lookup banner — si la modelo ya existe
                en otros módulos del sistema, avisamos al closer para
                que sepa que no es un nuevo descubrimiento. Estilo
                Maven: card con accent violeta + lista agrupada. */}
            <IgLookupBanner result={igLookupQ.data} loading={igLookupQ.isFetching} />


            {/* Row 2.5: tipo de llamada + servicio (si es venta a creadora existente).
                La IA evalúa distinto según el tipo (pedido de Miguel: las ventas de
                Unlimited/Kash a creadoras de la agencia se puntuaban como
                reclutamiento fallido). */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="call_type">{t("agencyQa.new.callTypeRequired")}</Label>
                <Select
                  value={callType}
                  onValueChange={(v) => {
                    const next = v as CallType;
                    setCallType(next);
                    if (!isSaleType(next)) setServiceSold("");
                  }}
                >
                  <SelectTrigger id="call_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reclutamiento">{t("agencyQa.new.type.recruitment")}</SelectItem>
                    <SelectItem value="venta_servicio">{t("agencyQa.new.type.serviceSale")}</SelectItem>
                    <SelectItem value="venta_externa">{t("agencyQa.new.type.externalSale")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isSaleType(callType) && (
                <div className="space-y-1.5">
                  <Label htmlFor="service_sold">
                    {callType === "venta_externa" ? t("agencyQa.new.platformOffered") : t("agencyQa.new.serviceOffered")}
                  </Label>
                  <Select value={serviceSold || undefined} onValueChange={setServiceSold}>
                    <SelectTrigger id="service_sold">
                      <SelectValue placeholder={t("agencyQa.new.whatSold")} />
                    </SelectTrigger>
                    <SelectContent>
                      {QA_SERVICES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SERVICE_LABEL[s] ? t(SERVICE_LABEL[s]!) : s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.service && (
                    <p className="text-xs text-destructive">{errors.service}</p>
                  )}
                </div>
              )}
            </div>

            {/* Row 3: fecha + evaluador */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="call_date">{t("agencyQa.new.callDateRequired")}</Label>
                <Input
                  id="call_date"
                  type="date"
                  value={callDate}
                  max={today()}
                  onChange={(e) => setCallDate(e.target.value)}
                />
                {errors.callDate && (
                  <p className="text-xs text-destructive">{errors.callDate}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evaluator">{t("agencyQa.new.evaluatorRequired")}</Label>
                <Input
                  id="evaluator"
                  placeholder={t("agencyQa.new.evaluatorPlaceholder")}
                  value={evaluatorName}
                  onChange={(e) => setEvaluatorName(e.target.value)}
                  required
                />
                {errors.evaluator && (
                  <p className="text-xs text-destructive">{errors.evaluator}</p>
                )}
              </div>
            </div>

            {/* Audio upload */}
            <div className="space-y-1.5">
              <Label>{t("agencyQa.new.audioRequired")}</Label>
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
                <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileAudio className="h-5 w-5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{audioFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {audioSizeMb.toFixed(2)} MB
                        {willCompress && t("agencyQa.new.willCompress")}
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
                    {t("agencyQa.new.removeAudio")}
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
                  <p className="text-sm font-medium">{t("agencyQa.new.pickAudio")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    .mp3 · .m4a · .wav · .webm · .ogg · .flac
                    <br />
                    {t("agencyQa.new.autoCompress")}
                  </p>
                </button>
              )}
              {errors.audio && (
                <p className="text-xs text-destructive">{errors.audio}</p>
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
                  {t("agencyQa.new.reanalyzeLast")}
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
                {submitting ? submitStage || t("agencyQa.processing") : t("agencyQa.new.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {lastSavedId && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="flex-1 space-y-0.5 text-sm">
              <p className="font-semibold">{t("agencyQa.new.registered", { id: lastSavedId.slice(0, 8) })}</p>
              <p className="text-muted-foreground">
                <ConFormato texto={t("agencyQa.new.registeredHint")} piezas={{ table: <code>qa_calls</code> }} />
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
  const { t } = useLanguage();
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
                ? t("common.loading")
                : options.length === 0
                  ? t("agencyQa.new.noEmployees")
                  : t("agencyQa.new.err.closer"))}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("agencyQa.new.searchCloser")} className="h-9" />
          <CommandList>
            {options.length === 0 ? (
              <CommandEmpty>{t("agencyQa.new.noEmployeesYet")}</CommandEmpty>
            ) : (
              <>
                <CommandEmpty />
                <CommandGroup>
                  {options.map((opt) => {
                    const label = opt.full_name?.trim() || t("agencyQa.noName");
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

/** Multi-select para closers de soporte que también participaron en la
 *  llamada. Se muestra debajo del closer principal. Cuando se cierra el
 *  popover y hay >=1 seleccionado, muestra los nombres como chips
 *  inline. Sin selección, sigue siendo el control compacto "Agregar
 *  closer de soporte". */
const SupportClosersPicker = ({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: Array<{ id: string; full_name: string | null }>;
}) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const selectedNames = options
    .filter((o) => value.includes(o.id))
    .map((o) => o.full_name?.trim() || t("agencyQa.noName"));

  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground font-normal"
          >
            <UserPlus className="h-3 w-3" />
            {selectedNames.length === 0
              ? t("agencyQa.new.addSupport")
              : t(selectedNames.length > 1 ? "agencyQa.new.supportsPl" : "agencyQa.new.supports", {
                  n: selectedNames.length,
                  names: selectedNames.join(", "),
                })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("agencyQa.new.searchCloser")} className="h-9" />
            <CommandList>
              <CommandEmpty />
              <CommandGroup>
                {options.map((opt) => {
                  const label = opt.full_name?.trim() || t("agencyQa.noName");
                  const checked = value.includes(opt.id);
                  return (
                    <CommandItem
                      key={opt.id}
                      value={label}
                      onSelect={() => toggle(opt.id)}
                      className="gap-2"
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span>{label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
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
  const { t } = useLanguage();
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
            {value || t("agencyQa.new.pickCountry")}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("agencyQa.new.searchCountry")} className="h-9" />
          <CommandList>
            <CommandEmpty />
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

// IgLookupBanner — card violeta-indigo estilo Maven que aparece bajo
// el input de IG cuando la modelo tipeada ya existe en otros módulos
// del sistema (scouter_leads, closer_creators, creator_prospects,
// leadgen_entries, qa_models). Informativo, no bloquea el form —
// solo avisa al closer. Match icons + colores se mapean por fuente
// para que la procedencia se reconozca de un vistazo.
import type { IgLookupResult, IgLookupMatch } from "@/hooks/useAgencyQa";
import { Activity, MessageCircle, Search, UserCheck, UserPlus } from "lucide-react";

interface IgLookupBannerProps {
  result: IgLookupResult | undefined;
  loading: boolean;
}

interface SourceConfig {
  key: keyof IgLookupResult["matches"];
  /** Clave del diccionario, o el nombre tal cual si es propio ("Scouter Assist", "Leadgen"). */
  label: TranslationKey | { fixed: string };
  Icon: typeof Activity;
  color: string;
}

const LOOKUP_SOURCES: SourceConfig[] = [
  { key: "qa_models", label: "agencyQa.new.src.previousQa", Icon: MessageCircle, color: "text-violet-400" },
  { key: "scouter_leads", label: { fixed: "Scouter Assist" }, Icon: Search, color: "text-amber-400" },
  { key: "closer_creators", label: "agencyQa.new.src.closerHired", Icon: UserCheck, color: "text-emerald-400" },
  { key: "creator_prospects", label: "agencyQa.new.src.prospect", Icon: UserPlus, color: "text-sky-400" },
  { key: "leadgen_entries", label: { fixed: "Leadgen" }, Icon: Activity, color: "text-rose-400" },
];

const IgLookupBanner = ({ result, loading }: IgLookupBannerProps) => {
  // Antes de los returns tempranos.
  const { t } = useLanguage();
  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("agencyQa.new.lookupSearching")}
        </span>
      </div>
    );
  }
  if (!result || result.total === 0) return null;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">
            {t("agencyQa.new.lookupTitle")}
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            <ConFormato
              texto={t("agencyQa.new.lookupBody", {
                n: result.total,
                matches: result.total === 1 ? t("agencyQa.new.match") : t("agencyQa.new.matches"),
              })}
              piezas={{
                handle: (
                  <code className="rounded bg-background/60 px-1.5 py-0.5 text-[10px]">
                    @{result.normalized_handle}
                  </code>
                ),
              }}
            />
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {LOOKUP_SOURCES.map((src) => {
          const items = result.matches[src.key];
          if (!items || items.length === 0) return null;
          return (
            <div
              key={src.key}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <src.Icon className={cn("h-3.5 w-3.5", src.color)} />
                <span className="text-xs font-semibold">
                  {typeof src.label === "string" ? t(src.label) : src.label.fixed}
                </span>
                <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <ul className="space-y-1 pl-5">
                {items.map((m: IgLookupMatch) => (
                  <li
                    key={m.id}
                    className="text-[11px] text-muted-foreground"
                  >
                    <span className="text-foreground/90">{m.label}</span>
                    {m.detail && (
                      <span className="ml-1.5 italic opacity-70">· {m.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};
