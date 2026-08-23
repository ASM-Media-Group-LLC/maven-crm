import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Lightbulb,
  AlertTriangle,
  Star,
  Headphones,
  Save,
  Sparkles,
  MessageSquareQuote,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import {
  useQaCall,
  useQaAudioSignedUrl,
  scoreColor,
  useQaHumanFeedback,
  useCreateQaHumanFeedback,
  useAnalyzeQaCall,
  useQaSectionFeedback,
  useUpsertQaSectionFeedback,
  useDeleteQaSectionFeedback,
  type CallAnalysis,
  type QaSectionFeedback,
  type QaSectionType,
} from "@/hooks/useAgencyQa";
import OutcomeBadge from "@/components/agency-qa/OutcomeBadge";

// CallDetailDrawer — opens when a row is clicked in AgencyCalls.
// Reads claude_analysis (jsonb) and renders the full kash QA report:
// summary, call facts, dimensions radar, red flags, key moments,
// improvements, model signals, and (collapsible) the raw transcript.
//
// Every analysis field is optional — partial / legacy rows may have
// only some of them — so each section guards before rendering.
//
// Out of scope este slice (left for next):
//   - per-section thumbs (qa_section_feedback)
//   - resend email (Resend integration)

const formatLevel = (lv: string) => lv.charAt(0).toUpperCase() + lv.slice(1);

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};

const Avatar = ({ name, dataUrl, size = 36 }: { name: string; dataUrl: string | null; size?: number }) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white/90"
      style={{ width: size, height: size, background: bg }}
    >
      {dataUrl ? <img src={dataUrl} alt="" className="h-full w-full object-cover" /> : initial}
    </span>
  );
};

const Section = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
    {children}
  </section>
);

// ─── Section thumbs (per-item feedback wiring) ─────────────────────────
// Botones 👍/👎 al lado de cada dimension/red_flag/key_moment/improvement.
// Persiste en qa_section_feedback con UNIQUE(call_id,section_type,
// section_index) — al re-votar, upsert pisa la row anterior. Click sobre
// el voto activo lo borra (toggle off → "sin opinion").
//
// El popover de notas se abre desde un ícono de chat al costado: permite
// agregar texto + suggested_score sin romper el flow visual.
type SectionFeedbackContext = {
  callId: string;
  feedbackByKey: Map<string, QaSectionFeedback>;
  evaluatorName: string;
};

const sectionKey = (type: QaSectionType, index: number) => `${type}:${index}`;

const SectionThumbs = ({
  ctx,
  type,
  index,
  label,
}: {
  ctx: SectionFeedbackContext;
  type: QaSectionType;
  index: number;
  label?: string | null;
}) => {
  const upsert = useUpsertQaSectionFeedback();
  const remove = useDeleteQaSectionFeedback();
  const existing = ctx.feedbackByKey.get(sectionKey(type, index)) ?? null;
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(existing?.note ?? "");
  const [scoreDraft, setScoreDraft] = useState(
    existing?.suggested_score != null ? String(existing.suggested_score) : "",
  );
  const isUp = existing?.thumbs === 1;
  const isDown = existing?.thumbs === -1;
  const hasNote = !!existing?.note || existing?.suggested_score != null;

  const handleVote = async (vote: 1 | -1) => {
    try {
      // Toggle off: si re-clickea su voto actual, borramos la row.
      if (existing && existing.thumbs === vote && !hasNote) {
        await remove.mutateAsync({
          call_id: ctx.callId,
          section_type: type,
          section_index: index,
        });
        return;
      }
      await upsert.mutateAsync({
        call_id: ctx.callId,
        section_type: type,
        section_index: index,
        section_label: label ?? null,
        thumbs: vote,
        note: existing?.note ?? null,
        suggested_score: existing?.suggested_score ?? null,
        evaluator_name: ctx.evaluatorName,
      });
    } catch (err) {
      toast.error("No se pudo guardar el voto", {
        description: (err as Error).message,
      });
    }
  };

  const handleSaveNote = async () => {
    const trimmed = noteDraft.trim();
    const numericScore =
      scoreDraft.trim() === "" ? null : Math.max(0, Math.min(100, parseInt(scoreDraft, 10)));
    if (scoreDraft.trim() !== "" && Number.isNaN(numericScore)) {
      toast.error("El score sugerido debe ser un número 0-100");
      return;
    }
    try {
      await upsert.mutateAsync({
        call_id: ctx.callId,
        section_type: type,
        section_index: index,
        section_label: label ?? null,
        // Si todavía no hay voto explícito, asumimos 👎 cuando hay nota
        // (es lo más común — querés explicar por qué algo está mal).
        thumbs: existing?.thumbs ?? -1,
        note: trimmed || null,
        suggested_score: numericScore,
        evaluator_name: ctx.evaluatorName,
      });
      setNoteOpen(false);
      toast.success("Nota guardada");
    } catch (err) {
      toast.error("No se pudo guardar la nota", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => handleVote(1)}
        disabled={upsert.isPending || remove.isPending}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isUp
            ? "bg-success/20 text-success"
            : "text-muted-foreground hover:bg-muted/50",
        )}
        title={isUp ? "Quitar 👍" : "Marcar 👍"}
      >
        <ThumbsUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => handleVote(-1)}
        disabled={upsert.isPending || remove.isPending}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isDown
            ? "bg-destructive/20 text-destructive"
            : "text-muted-foreground hover:bg-muted/50",
        )}
        title={isDown ? "Quitar 👎" : "Marcar 👎"}
      >
        <ThumbsDown className="h-3 w-3" />
      </button>
      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
              hasNote
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted/50",
            )}
            title={hasNote ? "Editar nota" : "Agregar nota"}
            onClick={() => {
              setNoteDraft(existing?.note ?? "");
              setScoreDraft(
                existing?.suggested_score != null ? String(existing.suggested_score) : "",
              );
            }}
          >
            <MessageSquare className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 p-3" align="end">
          <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Nota sobre esta sección
          </Label>
          <Textarea
            rows={3}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Por qué corriges esto, qué le faltó al análisis…"
            className="text-sm"
          />
          <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Score sugerido (opcional, 0-100)
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            placeholder="ej. 65"
            value={scoreDraft}
            onChange={(e) => setScoreDraft(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNoteOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveNote}
              disabled={upsert.isPending}
              className="gap-1.5"
            >
              {upsert.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Guardar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// ─── Analysis sub-renderers ────────────────────────────────────────────
const DimensionsBlock = ({
  dimensions,
  ctx,
}: {
  dimensions: NonNullable<CallAnalysis["dimensions"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (dimensions.length === 0) return null;
  // Las dimensiones vienen en escala 0-100 desde la IA → tal cual al chart
  // (domain 0-100). Antes venían en 0-10 y se multiplicaban ×10; el backend
  // cambió a 0-100 y esto quedó desfasado (mostraba ×10).
  const radarData = dimensions.map((d) => ({
    name: d.name,
    score: d.score,
    fullMark: 100,
  }));
  return (
    <Section title="Dimensiones (0–100)">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="78%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <Radar
              dataKey="score"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.35}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-2">
        {dimensions.map((d, i) => (
          <li key={`${d.name}-${i}`} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{d.name}</span>
              <div className="flex items-center gap-2">
                <span
                  className="font-bold tabular-nums"
                  style={{ color: scoreColor(d.score) }}
                >
                  {Math.round(d.score)}/100
                </span>
                {ctx && (
                  <SectionThumbs ctx={ctx} type="dimension" index={i} label={d.name} />
                )}
              </div>
            </div>
            <p className="text-xs leading-snug text-muted-foreground">{d.feedback}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
};

const KeyMomentsBlock = ({
  moments,
  ctx,
}: {
  moments: NonNullable<CallAnalysis["key_moments"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (moments.length === 0) return null;
  return (
    <Section title="Momentos clave">
      <ul className="space-y-2">
        {moments.map((m, i) => (
          <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
              <span style={{ color: m.kind === "positivo" ? "rgb(22 163 74)" : "rgb(220 38 38)" }}>
                {m.kind === "positivo" ? "✓ Positivo" : "✗ Negativo"}
              </span>
              {ctx && (
                <SectionThumbs
                  ctx={ctx}
                  type="key_moment"
                  index={i}
                  label={m.quote.slice(0, 60)}
                />
              )}
            </div>
            <blockquote className="border-l-2 border-border pl-2 text-xs italic text-foreground/80">
              "{m.quote}"
            </blockquote>
            <p className="mt-1.5 text-xs text-muted-foreground">{m.why}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
};

const RedFlagsBlock = ({
  flags,
  ctx,
}: {
  flags: NonNullable<CallAnalysis["red_flags"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (flags.length === 0) return null;
  return (
    <Section title="Red flags" hint={`${flags.length}`}>
      <ul className="space-y-2">
        {flags.map((f, i) => (
          <li key={i} className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                  {f.type.replace(/_/g, " ")}
                </span>
              </div>
              {ctx && <SectionThumbs ctx={ctx} type="red_flag" index={i} label={f.type} />}
            </div>
            <p className="text-xs text-foreground/80">{f.description}</p>
            {f.quote && (
              <blockquote className="mt-1 border-l-2 border-destructive/50 pl-2 text-xs italic text-muted-foreground">
                "{f.quote}"
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
};

const ImprovementsBlock = ({
  improvements,
  ctx,
}: {
  improvements: string[];
  ctx?: SectionFeedbackContext;
}) => {
  if (improvements.length === 0) return null;
  return (
    <Section title="Acciones de mejora">
      <ol className="space-y-1.5 pl-4 text-sm leading-relaxed">
        {improvements.map((s, i) => (
          <li key={i} className="list-decimal text-foreground/90 marker:text-muted-foreground">
            <div className="flex items-start justify-between gap-2">
              <span className="ml-1">{s}</span>
              {ctx && (
                <SectionThumbs
                  ctx={ctx}
                  type="improvement"
                  index={i}
                  label={s.slice(0, 60)}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
};

const ModelSignalsBlock = ({ signals }: { signals: NonNullable<CallAnalysis["model_signals"]> }) => (
  <Section title="Señales de la modelo">
    <div className="grid grid-cols-2 gap-2">
      <SignalCard label="Interés" level={signals.interest_level} reason={signals.interest_reason} />
      <SignalCard label="Complicidad" level={signals.complicity_level} reason={signals.complicity_reason} />
    </div>
    {signals.objections.length > 0 && (
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Objeciones ({signals.objections.length})
        </div>
        <ul className="space-y-1.5">
          {signals.objections.map((o, i) => (
            <li key={i} className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs">
              <div className="font-semibold">{o.topic}</div>
              <p className="text-muted-foreground">{o.description}</p>
              <blockquote className="mt-1 border-l-2 border-border pl-2 italic">"{o.quote}"</blockquote>
            </li>
          ))}
        </ul>
      </div>
    )}
    <p className="text-xs italic text-muted-foreground">{signals.summary_of_model}</p>
  </Section>
);

const SignalCard = ({ label, level, reason }: { label: string; level: string; reason: string }) => {
  const color =
    level === "alto"
      ? "rgb(22 163 74)"
      : level === "medio"
      ? "rgb(202 138 4)"
      : level === "bajo"
      ? "rgb(220 38 38)"
      : "rgb(148 163 184)";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-bold" style={{ color }}>
          {formatLevel(level)}
        </span>
      </div>
      <p className="mt-1 text-xs text-foreground/80">{reason}</p>
    </div>
  );
};

// ─── Main drawer ───────────────────────────────────────────────────────
const CallDetailDrawer = ({
  callId,
  open,
  onOpenChange,
}: {
  callId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const callQ = useQaCall(callId);
  const [showTranscript, setShowTranscript] = useState(false);
  const call = callQ.data;
  const a = call?.claude_analysis ?? {};
  const audioUrlQ = useQaAudioSignedUrl(call?.audio_path ?? null);

  // Section feedback context — un solo fetch por call, todos los blocks
  // lo comparten. evaluator_name viene del perfil/auth para que cada
  // upsert quede atribuído a quien votó.
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const sectionFeedbackQ = useQaSectionFeedback(callId);
  const evaluatorName =
    profileQ.data?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "Sin nombre";
  const feedbackByKey = new Map<string, QaSectionFeedback>();
  for (const fb of sectionFeedbackQ.data ?? []) {
    feedbackByKey.set(sectionKey(fb.section_type, fb.section_index), fb);
  }
  const sectionCtx: SectionFeedbackContext | undefined = call
    ? { callId: call.id, feedbackByKey, evaluatorName }
    : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-xl overflow-y-auto sm:max-w-2xl">
        {callQ.isLoading || !call ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-1">
              <div className="flex items-center gap-3">
                {call.model && <Avatar name={call.model.name} dataUrl={call.model.avatar_data_url} size={40} />}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">
                    {call.model?.name ?? "Sin modelo"} · {call.closer?.name ?? "Sin closer"}
                  </SheetTitle>
                  <SheetDescription>
                    {fmtDate(call.call_date)} · evaluado por {call.evaluator_name}
                  </SheetDescription>
                </div>
                <span
                  className="shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums text-white"
                  style={{ background: scoreColor(call.claude_score) }}
                >
                  {call.claude_score}
                </span>
              </div>
              <div className="pt-1.5">
                <OutcomeBadge outcome={a.call_outcome} size="md" />
                {a.call_outcome_reason && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{a.call_outcome_reason}</p>
                )}
              </div>
            </SheetHeader>

            <div className="mt-4 space-y-3">
              {/* Summary + facts */}
              {a.summary && (
                <Section title="Resumen">
                  <p className="text-sm leading-relaxed">{a.summary}</p>
                </Section>
              )}

              {a.call_facts && (
                <Section title="Datos de la llamada">
                  {a.call_facts.ubicacion && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{a.call_facts.ubicacion}</span>
                    </div>
                  )}
                  <p className="text-sm font-medium">{a.call_facts.motivo_principal}</p>
                  <ul className="space-y-1 pl-4 text-sm">
                    {a.call_facts.observaciones_clave.map((o, i) => (
                      <li key={i} className="list-disc text-foreground/85 marker:text-muted-foreground">
                        {o}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {a.dimensions && a.dimensions.length > 0 && (
                <DimensionsBlock dimensions={a.dimensions} ctx={sectionCtx} />
              )}
              {a.key_moments && a.key_moments.length > 0 && (
                <KeyMomentsBlock moments={a.key_moments} ctx={sectionCtx} />
              )}
              {a.red_flags && a.red_flags.length > 0 && (
                <RedFlagsBlock flags={a.red_flags} ctx={sectionCtx} />
              )}
              {a.improvements && a.improvements.length > 0 && (
                <ImprovementsBlock improvements={a.improvements} ctx={sectionCtx} />
              )}
              {a.model_signals && <ModelSignalsBlock signals={a.model_signals} />}

              {/* Audio playback */}
              {call.audio_path && (
                <Section title="Audio">
                  {audioUrlQ.isLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generando link…
                    </div>
                  ) : audioUrlQ.data ? (
                    <div className="flex items-center gap-2">
                      <Headphones className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <audio
                        controls
                        preload="metadata"
                        src={audioUrlQ.data}
                        className="w-full"
                      >
                        Tu navegador no soporta audio HTML5.
                      </audio>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No se pudo cargar el audio (signed URL falló).
                    </p>
                  )}
                </Section>
              )}

              {/* Transcript */}
              <Section title="Transcript" hint={`${call.transcript.length.toLocaleString()} chars`}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTranscript((s) => !s)}
                  className="w-full justify-between"
                >
                  <span>{showTranscript ? "Ocultar" : "Ver transcript completo"}</span>
                  {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                {showTranscript && (
                  <pre className="mt-2 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
                    {call.transcript}
                  </pre>
                )}
              </Section>

              {/* Empty-analysis fallback */}
              {!a.summary && (!a.dimensions || a.dimensions.length === 0) && (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                  <Star className="mr-1 inline h-3.5 w-3.5" />
                  Esta llamada no tiene un análisis IA completo. Probablemente sea
                  una entrada legacy o el análisis falló — usar el botón
                  "Re-analizar" para reintentar.
                </div>
              )}

              {/* Human feedback + Re-analyze (port del humanContext de kash) */}
              <FeedbackSection callId={call.id} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ─── Feedback section (qa_human_feedback + re-analyze with feedback) ─
// Permite al supervisor dejar una observación libre + un score humano
// opcional. El botón "Re-analizar con feedback" dispara qa-analyze con
// el flag with_feedback, y la edge function inyecta la última row de
// qa_human_feedback en el prompt como [FEEDBACK DEL SUPERVISOR] —
// equivalente al humanContext de kash.
const FeedbackSection = ({ callId }: { callId: string }) => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const feedbackQ = useQaHumanFeedback(callId);
  const createFeedback = useCreateQaHumanFeedback();
  const analyze = useAnalyzeQaCall();

  const defaultEvaluator =
    profileQ.data?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "";

  const [draft, setDraft] = useState("");
  const [score, setScore] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const last = feedbackQ.data ?? null;

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("Escribe algo de feedback antes de guardar");
      return;
    }
    const numericScore =
      score.trim() === "" ? null : Math.max(0, Math.min(100, parseInt(score, 10)));
    if (score.trim() !== "" && Number.isNaN(numericScore)) {
      toast.error("El score humano debe ser un número 0-100");
      return;
    }
    try {
      await createFeedback.mutateAsync({
        call_id: callId,
        evaluator_name: defaultEvaluator || "Sin nombre",
        feedback_text: trimmed,
        human_score: numericScore,
      });
      toast.success("Feedback guardado", {
        description: "Puedes re-analizar la QA para que la IA lo considere.",
      });
      setDraft("");
      setScore("");
    } catch (err) {
      toast.error("No se pudo guardar el feedback", {
        description: (err as Error).message,
      });
    }
  };

  const handleReanalyzeWithFeedback = async () => {
    if (!last && !draft.trim()) {
      toast.error("Primero guarda un feedback humano");
      return;
    }
    try {
      const result = await analyze.mutateAsync({ callId, withFeedback: true });
      toast.success(`Re-análisis listo · score ${result.score}/100`, {
        description: "El análisis ahora incorpora tu feedback humano.",
      });
    } catch (err) {
      toast.error("Re-análisis falló", {
        description: (err as Error).message,
      });
    }
  };

  const handleReanalyzePlain = async () => {
    try {
      const result = await analyze.mutateAsync({ callId, withFeedback: false });
      toast.success(`Re-análisis listo · score ${result.score}/100`);
    } catch (err) {
      toast.error("Re-análisis falló", {
        description: (err as Error).message,
      });
    }
  };

  const fmtTs = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("es-AR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Section title="Feedback humano">
      <p className="text-[11px] text-muted-foreground">
        <Lightbulb className="mr-1 inline h-3 w-3" />
        Deja feedback sobre el análisis (qué le faltó, qué interpretó mal).
        Después puedes re-analizar y la IA lo va a tomar en cuenta.
      </p>

      {feedbackQ.isLoading ? (
        <div className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Cargando feedback…
        </div>
      ) : last ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MessageSquareQuote className="h-3 w-3" />
              <span className="font-medium text-foreground/85">
                {last.evaluator_name}
              </span>
              <span>·</span>
              <span>{fmtTs(last.created_at)}</span>
            </div>
            {typeof last.human_score === "number" && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums text-white"
                style={{ background: scoreColor(last.human_score) }}
              >
                humano {last.human_score}
              </span>
            )}
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">
            {last.feedback_text}
          </p>
          <button
            type="button"
            className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowHistory((s) => !s)}
          >
            {showHistory ? "Ocultar nuevo feedback" : "Agregar otro feedback"}
          </button>
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Todavía no hay feedback humano para esta QA.
        </p>
      )}

      {(showHistory || !last) && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="space-y-1">
            <Label htmlFor="feedback-text" className="text-xs">
              Feedback (qué corregir / agregar)
            </Label>
            <Textarea
              id="feedback-text"
              rows={3}
              placeholder="Ej: la IA no detectó el cierre suave al final, la modelo aceptó la propuesta entre líneas. El score real es más alto."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="human-score" className="text-xs">
                Score humano (opcional, 0-100)
              </Label>
              <Input
                id="human-score"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                placeholder="ej. 85"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={createFeedback.isPending || !draft.trim()}
                className="w-full gap-1.5"
              >
                {createFeedback.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Guardar feedback
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleReanalyzePlain}
          disabled={analyze.isPending}
          className="gap-1.5"
        >
          {analyze.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Re-analizar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleReanalyzeWithFeedback}
          disabled={analyze.isPending || !last}
          title={!last ? "Primero guarda feedback humano" : undefined}
          className="gap-1.5"
        >
          {analyze.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquareQuote className="h-3.5 w-3.5" />
          )}
          Re-analizar con feedback
        </Button>
      </div>
    </Section>
  );
};

export default CallDetailDrawer;
