import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Save,
  Sparkles,
  MessageSquareQuote,
  ThumbsUp,
  ThumbsDown,
  Instagram as InstagramIcon,
  User,
  Calendar,
  Mail,
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
import {
  useQaCall,
  useQaAudioSignedUrl,
  OUTCOME_META,
  useQaHumanFeedback,
  useCreateQaHumanFeedback,
  useAnalyzeQaCall,
  useFireQaWebhook,
  useQaSectionFeedback,
  useUpsertQaSectionFeedback,
  useDeleteQaSectionFeedback,
  type CallAnalysis,
  type CallOutcome,
  type QaSectionFeedback,
  type QaSectionType,
} from "@/hooks/useAgencyQa";

// CallDetailPage — port directo de Kash (kash-call-qa/app/calls/[id]/page.tsx)
// con la paleta de colores de Maven: el dorado (--gold #c9a96e) se reemplaza
// por el primary purple de Maven (hsl(var(--primary))).

// ─── Helpers ─────────────────────────────────────────────────────
const PRIMARY = "hsl(var(--primary))";
const PRIMARY_SOFT = "hsl(var(--primary) / 0.12)";
// Gold accent — usado en labels chiquitos (Ficha rápida, etc.) para que
// se distingan del primary purple de los headers de sección. Mismo tono
// que --gold del diseño Kash original.
const GOLD = "#d4a942";

const fmtDate = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const fmtDateTime = (d: Date | string): string => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const scoreColorPct = (pct: number): string => {
  if (pct >= 80) return "#16a34a";
  if (pct >= 60) return "#ca8a04";
  if (pct >= 40) return "#ea580c";
  return "#dc2626";
};

const scoreColor10 = (s10: number): string => {
  if (s10 >= 8) return "#16a34a";
  if (s10 >= 6) return "#ca8a04";
  if (s10 >= 4) return "#ea580c";
  return "#dc2626";
};

const RED_FLAG_LABELS: Record<string, string> = {
  trato_low_ticket: "Trato low-ticket",
  script_rigido: "Script rígido",
  no_deja_hablar: "No deja hablar",
  ofrece_sin_diagnosticar: "Ofrece sin diagnosticar",
  promesas_irreales: "Promesas irreales",
  trato_invasivo: "Trato invasivo",
  tono_corporativo: "Tono corporativo",
  muletillas_excesivas: "Muletillas excesivas",
  velocidad_inapropiada: "Velocidad inapropiada",
  monologo_excesivo: "Monólogo excesivo",
  otro: "Otro",
};

// ─── Section feedback ───────────────────────────────────────────
type SectionFeedbackContext = {
  callId: string;
  feedbackByKey: Map<string, QaSectionFeedback>;
  evaluatorName: string;
};
const sectionKey = (type: QaSectionType, index: number) =>
  `${type}:${index}`;

// SectionThumbs — feedback humano para la IA, una pieza por sección.
// Comportamiento:
//   - Sin voto previo: muestra los DOS botones (👍 y 👎) para elegir
//   - 👍: simbólico, solo guarda el voto (no abre popup)
//   - 👎: guarda el voto Y abre la ventana de comentario
//   - Después de votar: solo muestra el botón seleccionado (re-click lo
//     deselecciona y vuelve a aparecer el otro)
// El popup permite escribir una nota explicando qué corregir + un score
// sugerido, que la IA usará en la próxima re-analización.
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
    existing?.suggested_score != null ? String(existing.suggested_score) : ""
  );
  const isUp = existing?.thumbs === 1;
  const isDown = existing?.thumbs === -1;
  const hasVote = isUp || isDown;
  const hasNote = !!existing?.note || existing?.suggested_score != null;

  const persistVote = async (vote: 1 | -1) => {
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
  };

  const handleUp = async () => {
    try {
      // Si ya estaba en up y no hay nota, lo deseleccionamos para mostrar
      // ambos botones de nuevo.
      if (isUp && !hasNote) {
        await remove.mutateAsync({
          call_id: ctx.callId,
          section_type: type,
          section_index: index,
        });
        return;
      }
      await persistVote(1);
    } catch (err) {
      toast.error("No se pudo guardar el voto", {
        description: (err as Error).message,
      });
    }
  };

  const handleDown = async () => {
    try {
      // Si ya estaba en down sin nota, deseleccionamos.
      if (isDown && !hasNote) {
        await remove.mutateAsync({
          call_id: ctx.callId,
          section_type: type,
          section_index: index,
        });
        return;
      }
      // Persiste el voto y abre el popup automáticamente para que el
      // usuario pueda explicar qué corregir.
      await persistVote(-1);
      setNoteDraft(existing?.note ?? "");
      setScoreDraft(
        existing?.suggested_score != null
          ? String(existing.suggested_score)
          : ""
      );
      setNoteOpen(true);
    } catch (err) {
      toast.error("No se pudo guardar el voto", {
        description: (err as Error).message,
      });
    }
  };

  const handleSaveNote = async () => {
    const trimmed = noteDraft.trim();
    const numericScore =
      scoreDraft.trim() === ""
        ? null
        : Math.max(0, Math.min(100, parseInt(scoreDraft, 10)));
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
        thumbs: existing?.thumbs ?? -1,
        note: trimmed || null,
        suggested_score: numericScore,
        evaluator_name: ctx.evaluatorName,
      });
      setNoteOpen(false);
      toast.success("Comentario guardado");
    } catch (err) {
      toast.error("No se pudo guardar el comentario", {
        description: (err as Error).message,
      });
    }
  };

  // Visibilidad: si no hay voto, ambos. Si votó up, solo up. Si votó down, solo down.
  const showUp = !hasVote || isUp;
  const showDown = !hasVote || isDown;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showUp && (
        <button
          type="button"
          onClick={handleUp}
          disabled={upsert.isPending || remove.isPending}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            isUp
              ? "bg-emerald-500/20 text-emerald-500"
              : "text-muted-foreground hover:bg-muted/50"
          )}
          title={isUp ? "Quitar 👍" : "Te gusta este análisis"}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
      )}
      {showDown && (
        <Popover open={noteOpen} onOpenChange={setNoteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={handleDown}
              disabled={upsert.isPending || remove.isPending}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                isDown
                  ? "bg-rose-500/20 text-rose-400"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
              title={isDown ? "Editar comentario" : "Marcar 👎 + comentar"}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-2 p-3" align="end">
            <div>
              <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                ¿Qué le corregirías a la IA?
              </Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tu feedback se guarda y la IA lo va a tener en cuenta en las
                próximas re-evaluaciones.
              </p>
            </div>
            <Textarea
              rows={4}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Ej: el score es muy bajo, en realidad el closer manejó bien la objeción de privacidad…"
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
              placeholder="ej. 75"
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
                Cerrar
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
      )}
    </div>
  );
};

// ─── HeroAvatar ────────────────────────────────────────────────
const HeroAvatar = ({
  name,
  dataUrl,
  size = 72,
}: {
  name: string;
  dataUrl: string | null;
  size?: number;
}) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 60%, 55%) 0%, hsl(${(h + 60) % 360}, 70%, 35%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold text-white shadow-md ring-2 ring-white/10"
      style={{ width: size, height: size, background: bg }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
};

// ─── OutcomePill ───────────────────────────────────────────────
const OutcomePill = ({
  outcome,
  size = "default",
}: {
  outcome: CallOutcome | undefined;
  size?: "default" | "lg";
}) => {
  if (!outcome || !(outcome in OUTCOME_META)) return null;
  const c = OUTCOME_META[outcome as keyof typeof OUTCOME_META];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full font-bold text-white shadow-md",
        size === "lg" ? "h-9 px-4 text-sm" : "h-7 px-3 text-xs"
      )}
      style={{ background: c.bg }}
    >
      <span aria-hidden className="text-base">
        {c.icon}
      </span>
      {c.label}
    </span>
  );
};

// ─── ScoreGauge ─────────────────────────────────────────────────
const ScoreGauge = ({
  score,
  size = 180,
}: {
  score: number;
  size?: number;
}) => {
  const clamped = Math.max(0, Math.min(100, score));
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const color = scoreColorPct(clamped);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
        >
          {clamped}
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Score
        </span>
      </div>
    </div>
  );
};

// ─── FactCard ───────────────────────────────────────────────────
// Borde sutil dorado + zoom levísimo en hover para darle vida sin
// exagerar.
const FactCard = ({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) => (
  <div
    className="group flex flex-col gap-2 rounded-2xl border bg-muted/20 p-4 transition-all duration-200 hover:scale-[1.01] hover:bg-muted/30 hover:shadow-md"
    style={{ borderColor: `${GOLD}40` }}
  >
    <div className="flex items-center gap-2">
      <span className="text-lg" aria-hidden>
        {icon}
      </span>
      <span
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: PRIMARY }}
      >
        {label}
      </span>
    </div>
    <p className="text-sm font-medium leading-relaxed">{value}</p>
  </div>
);

// ─── DimensionsRadar ────────────────────────────────────────────
const DimensionsRadar = ({
  dimensions,
}: {
  dimensions: NonNullable<CallAnalysis["dimensions"]>;
}) => {
  const fullByShort = new Map<string, string>();
  // Mostramos las dimensiones en escala 0-100 para que sea consistente
  // con el resto de la UI. El JSON de la IA viene en 0-10, lo
  // multiplicamos antes de pasárselo al chart.
  const data = dimensions.map((d) => {
    const short = d.name.length > 22 ? d.name.slice(0, 20) + "…" : d.name;
    fullByShort.set(short, d.name);
    return { dim: short, score: Math.round(d.score * 10) };
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="#888" strokeOpacity={0.35} />
          <PolarAngleAxis
            dataKey="dim"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "currentColor", fontSize: 10 }}
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke={PRIMARY}
            fill={PRIMARY}
            fillOpacity={0.35}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─── AudioMetricsChart ──────────────────────────────────────────
type SpeakerLike = {
  id: string;
  label: string;
  word_count: number;
  estimated_duration_s: number;
  talk_ratio: number;
};

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  color: "hsl(var(--foreground))",
};
const tooltipLabelStyle = {
  color: "hsl(var(--foreground))",
  fontWeight: 600,
  marginBottom: 4,
};
const tooltipItemStyle = {
  color: "hsl(var(--foreground))",
};

const interestScore = (level?: string): number => {
  switch (level) {
    case "alto":
      return 100;
    case "medio":
      return 66;
    case "bajo":
      return 33;
    case "ambiguo":
      return 50;
    default:
      return 0;
  }
};
const complicityScore = (level?: string): number => {
  switch (level) {
    case "alto":
      return 100;
    case "medio":
      return 66;
    case "bajo":
      return 33;
    default:
      return 0;
  }
};
const barColor = (v: number): string => {
  if (v >= 70) return "#16a34a";
  if (v >= 40) return "#ca8a04";
  return "#dc2626";
};

const CloserBars = ({ closer }: { closer: SpeakerLike }) => {
  const data = [
    {
      name: "% habla",
      value: Math.round(closer.talk_ratio * 100),
      color: "#6366f1",
    },
    {
      name: "Palabras",
      value: closer.word_count,
      color: "#10b981",
    },
    {
      name: "Duración (s)",
      value: Math.round(closer.estimated_duration_s),
      color: "#f59e0b",
    },
  ];
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}>
          <CartesianGrid stroke="#888" strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <YAxis tick={{ fill: "currentColor", fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const ModelBars = ({
  signals,
}: {
  signals: NonNullable<CallAnalysis["model_signals"]>;
}) => {
  const interest = interestScore(signals.interest_level);
  const complicity = complicityScore(signals.complicity_level);
  const objectionsCount = signals.objections?.length ?? 0;

  const data = [
    { name: "Interés", value: interest, color: barColor(interest) },
    { name: "Complicidad", value: complicity, color: barColor(complicity) },
    { name: "Objeciones", value: objectionsCount, color: "#ca8a04" },
  ];
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 6 }}>
          <CartesianGrid stroke="#888" strokeOpacity={0.2} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "currentColor", fontSize: 11 }}
          />
          <YAxis tick={{ fill: "currentColor", fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const AudioMetricsChart = ({
  metrics,
  modelSignals,
}: {
  metrics: { speakers: SpeakerLike[]; total_duration_s?: number };
  modelSignals: CallAnalysis["model_signals"] | null | undefined;
}) => {
  if (!metrics.speakers?.length) return null;
  // Identify the closer/model — Maven's transcribe doesn't tag, so we
  // treat first speaker as closer, second as model. If only 1 speaker,
  // we just show closer.
  const closer = metrics.speakers[0];
  const model = metrics.speakers[1] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              🎯
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: PRIMARY }}
            >
              Closer
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {Math.round(closer.estimated_duration_s)}s ·{" "}
              {closer.word_count} palabras
            </span>
          </div>
          <CloserBars closer={closer} />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              👤
            </span>
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: PRIMARY }}
            >
              Modelo
            </span>
            {model && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {Math.round(model.estimated_duration_s)}s ·{" "}
                {model.word_count} palabras
              </span>
            )}
          </div>
          {modelSignals ? (
            <ModelBars signals={modelSignals} />
          ) : (
            <div className="flex h-72 w-full items-center justify-center text-center text-sm text-muted-foreground">
              Sin señales de la modelo. Re-analiza para calcular interés,
              complicidad y objeciones.
            </div>
          )}
        </div>
      </div>

      {modelSignals && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed">
          <div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: PRIMARY }}
            >
              Interés
            </span>{" "}
            <span className="text-muted-foreground">
              — {modelSignals.interest_reason}
            </span>
          </div>
          <div>
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: PRIMARY }}
            >
              Complicidad
            </span>{" "}
            <span className="text-muted-foreground">
              — {modelSignals.complicity_reason}
            </span>
          </div>
          {modelSignals.summary_of_model && (
            <div>
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: PRIMARY }}
              >
                Global
              </span>{" "}
              <span className="text-muted-foreground">
                — {modelSignals.summary_of_model}
              </span>
            </div>
          )}
          {modelSignals.objections && modelSignals.objections.length > 0 && (
            <div className="mt-1">
              <div
                className="mb-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: PRIMARY }}
              >
                Objeciones ({modelSignals.objections.length})
              </div>
              <ul className="flex flex-col gap-2">
                {modelSignals.objections.map((o, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2"
                  >
                    <span
                      className="self-start whitespace-normal rounded-md px-2 py-1 text-[10px] font-bold uppercase leading-tight sm:max-w-[200px] sm:shrink-0"
                      style={{
                        background: "rgba(202,138,4,0.18)",
                        color: "#ca8a04",
                      }}
                    >
                      {o.topic}
                    </span>
                    <span className="flex-1 text-xs">
                      {o.description}{" "}
                      <span className="italic text-muted-foreground">
                        — &ldquo;{o.quote}&rdquo;
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Collapsible (analysis sections) ────────────────────────────
// Hover sutil: el borde se tinta de primary y el fondo se ilumina apenas,
// para que el card "responda" cuando el cursor pasa sin ser estridente.
const Collapsible = ({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <details
    open={defaultOpen}
    className="group overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
  >
    <summary className="flex cursor-pointer items-center justify-between gap-3 border-b border-transparent px-5 py-4 transition-colors hover:bg-primary/5 group-open:border-border">
      <div className="flex items-center gap-3">
        <h2
          className="text-base font-semibold tracking-wide"
          style={{ color: PRIMARY }}
        >
          {title}
        </h2>
        {typeof badge === "number" && (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums"
            style={{ background: PRIMARY_SOFT, color: PRIMARY }}
          >
            {badge}
          </span>
        )}
      </div>
      <ChevronDown
        className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
        style={{ color: PRIMARY }}
      />
    </summary>
    <div className="px-5 pb-5">{children}</div>
  </details>
);

// ─── Dimensions grouped (Puntos fuertes / mejorar / débiles) ────
type DimensionGroup = {
  title: string;
  caption: string;
  color: string;
  bg: string;
  items: NonNullable<CallAnalysis["dimensions"]>;
};
const groupDimensions = (
  dimensions: NonNullable<CallAnalysis["dimensions"]>
): DimensionGroup[] => {
  const fuertes = dimensions.filter((d) => d.score >= 8);
  const mejorar = dimensions.filter((d) => d.score >= 6 && d.score < 8);
  const debiles = dimensions.filter((d) => d.score < 6);
  return [
    {
      title: "Puntos fuertes",
      caption: "Score ≥ 80/100",
      color: "#16a34a",
      bg: "rgba(22,163,74,0.08)",
      items: fuertes,
    },
    {
      title: "Puntos a mejorar",
      caption: "Score 60–79/100",
      color: "#ca8a04",
      bg: "rgba(202,138,4,0.10)",
      items: mejorar,
    },
    {
      title: "Puntos débiles",
      caption: "Score < 60/100",
      color: "#dc2626",
      bg: "rgba(220,38,38,0.08)",
      items: debiles,
    },
  ];
};

const AnalysisSections = ({
  analysis,
  ctx,
}: {
  analysis: CallAnalysis;
  ctx?: SectionFeedbackContext;
}) => {
  const dimensions = analysis.dimensions ?? [];
  const redFlags = analysis.red_flags ?? [];
  const keyMoments = analysis.key_moments ?? [];
  const improvements = analysis.improvements ?? [];

  const groups = groupDimensions(dimensions);
  const dimensionIndex = new Map<string, number>(
    dimensions.map((d, i) => [d.name, i])
  );

  return (
    <div className="flex flex-col gap-6">
      {dimensions.length > 0 && (
        <Collapsible
          title="Evaluación por categorías"
          badge={dimensions.length}
        >
          <div className="flex flex-col gap-4 pt-4">
            {groups.map((g) => (
              <div
                key={g.title}
                className="overflow-hidden rounded-2xl border border-border bg-muted/20"
              >
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{
                    background: g.bg,
                    borderLeft: `4px solid ${g.color}`,
                  }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span
                      className="text-base font-semibold tracking-wide"
                      style={{ color: g.color }}
                    >
                      {g.title}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {g.caption}
                    </span>
                  </div>
                  <span
                    className="inline-flex h-8 min-w-8 items-center justify-center rounded-full px-3 text-sm font-bold text-white"
                    style={{ background: g.color }}
                  >
                    {g.items.length}
                  </span>
                </div>

                {g.items.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-muted-foreground">
                    Ninguna dimensión cae en este grupo.
                  </p>
                ) : (
                  <ul>
                    {g.items.map((d, i) => {
                      const originalIdx = dimensionIndex.get(d.name) ?? i;
                      return (
                        <li
                          key={i}
                          className={cn(
                            "flex flex-col gap-3 px-5 py-5",
                            i > 0 && "border-t border-border"
                          )}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div
                                className="text-base font-semibold"
                                style={{ color: PRIMARY }}
                              >
                                {d.name}
                              </div>
                              <p className="text-[15px] leading-relaxed">
                                {d.feedback}
                              </p>
                            </div>
                            <div className="flex items-start gap-3 self-start">
                              <div
                                className="inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-bold tabular-nums text-white"
                                style={{ background: scoreColor10(d.score) }}
                              >
                                {Math.round(d.score * 10)}/100
                              </div>
                              {ctx && (
                                <SectionThumbs
                                  ctx={ctx}
                                  type="dimension"
                                  index={originalIdx}
                                  label={d.name}
                                />
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {redFlags.length > 0 && (
        <Collapsible title="Red flags detectados" badge={redFlags.length}>
          <div className="flex flex-col gap-3 pt-4">
            {redFlags.map((rf, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4"
                style={{ borderLeft: "4px solid #dc2626" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div
                      className="flex items-center gap-2 text-sm font-semibold"
                      style={{ color: "#dc2626" }}
                    >
                      <span>⚑</span>
                      <span>
                        {RED_FLAG_LABELS[rf.type] ?? rf.type}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{rf.description}</p>
                    {rf.quote && (
                      <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
                        &ldquo;{rf.quote}&rdquo;
                      </blockquote>
                    )}
                  </div>
                  {ctx && (
                    <SectionThumbs
                      ctx={ctx}
                      type="red_flag"
                      index={i}
                      label={RED_FLAG_LABELS[rf.type] ?? rf.type}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {keyMoments.length > 0 && (
        <Collapsible title="Momentos clave" badge={keyMoments.length}>
          <div className="flex flex-col gap-3 pt-4">
            {keyMoments.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card p-4"
                style={{
                  borderLeft: `4px solid ${
                    m.kind === "positivo" ? "#16a34a" : "#dc2626"
                  }`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{
                        color: m.kind === "positivo" ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {m.kind}
                    </div>
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic">
                      &ldquo;{m.quote}&rdquo;
                    </blockquote>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {m.why}
                    </p>
                  </div>
                  {ctx && (
                    <SectionThumbs
                      ctx={ctx}
                      type="key_moment"
                      index={i}
                      label={`${m.kind}: ${m.quote.slice(0, 60)}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {improvements.length > 0 && (
        <Collapsible
          title="Acciones concretas de mejora"
          badge={improvements.length}
        >
          <ol className="flex flex-col gap-2 pt-4">
            {improvements.map((action, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: PRIMARY }}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-sm leading-relaxed">
                  {action}
                </span>
                {ctx && (
                  <SectionThumbs
                    ctx={ctx}
                    type="improvement"
                    index={i}
                    label={action.slice(0, 80)}
                  />
                )}
              </li>
            ))}
          </ol>
        </Collapsible>
      )}
    </div>
  );
};

// ─── Transcript collapse ────────────────────────────────────────
const TranscriptCollapse = ({ transcript }: { transcript: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Transcript
        </h2>
        <span className="text-sm text-muted-foreground">
          {open ? "Ocultar" : "Mostrar"}
        </span>
      </button>
      {open && (
        <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed">
          {transcript}
        </pre>
      )}
    </div>
  );
};

// ─── Reanalyze button ───────────────────────────────────────────
const ReanalyzeButton = ({ callId }: { callId: string }) => {
  const analyze = useAnalyzeQaCall();
  const handleClick = async () => {
    try {
      const r = await analyze.mutateAsync({ callId, withFeedback: false });
      toast.success(`Re-análisis listo · score ${r.score}/100`);
    } catch (err) {
      toast.error("Re-análisis falló", {
        description: (err as Error).message,
      });
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={handleClick}
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
  );
};

// ─── HumanFeedbackForm ──────────────────────────────────────────
const HumanFeedbackForm = ({ callId }: { callId: string }) => {
  const { user } = useAuth();
  const profileQ = useMyProfile();
  const create = useCreateQaHumanFeedback();
  const analyze = useAnalyzeQaCall();

  const defaultEvaluator =
    profileQ.data?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "";

  const [draft, setDraft] = useState("");
  const [score, setScore] = useState("");

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("Escribí algo de feedback antes de guardar");
      return;
    }
    const numericScore =
      score.trim() === ""
        ? null
        : Math.max(0, Math.min(100, parseInt(score, 10)));
    if (score.trim() !== "" && Number.isNaN(numericScore)) {
      toast.error("El score humano debe ser un número 0-100");
      return;
    }
    try {
      await create.mutateAsync({
        call_id: callId,
        evaluator_name: defaultEvaluator || "Sin nombre",
        feedback_text: trimmed,
        human_score: numericScore,
      });
      toast.success("Feedback guardado");
      setDraft("");
      setScore("");
    } catch (err) {
      toast.error("No se pudo guardar el feedback", {
        description: (err as Error).message,
      });
    }
  };

  const handleReanalyzeWithFeedback = async () => {
    if (!draft.trim()) {
      toast.error("Primero escribí un feedback");
      return;
    }
    try {
      await create.mutateAsync({
        call_id: callId,
        evaluator_name: defaultEvaluator || "Sin nombre",
        feedback_text: draft.trim(),
        human_score:
          score.trim() === ""
            ? null
            : Math.max(0, Math.min(100, parseInt(score, 10))),
      });
      const r = await analyze.mutateAsync({ callId, withFeedback: true });
      toast.success(`Re-análisis con feedback listo · score ${r.score}/100`);
      setDraft("");
      setScore("");
    } catch (err) {
      toast.error("Re-análisis falló", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-text" className="text-xs">
          Tu feedback (qué corregir / agregar al análisis IA)
        </Label>
        <Textarea
          id="feedback-text"
          rows={3}
          placeholder="Ej: la IA no detectó el cierre suave al final, la modelo aceptó la propuesta entre líneas."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="human-score" className="text-xs">
            Score humano (0-100)
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
            className="h-9 text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={create.isPending || !draft.trim()}
            className="h-9 w-full gap-1.5"
          >
            {create.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Guardar feedback
          </Button>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            onClick={handleReanalyzeWithFeedback}
            disabled={analyze.isPending || !draft.trim()}
            className="h-9 w-full gap-1.5"
          >
            {analyze.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquareQuote className="h-3.5 w-3.5" />
            )}
            Guardar y re-analizar
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Main page ──────────────────────────────────────────────────
const CallDetailPage = ({
  callId,
  onBack,
}: {
  callId: string;
  onBack: () => void;
}) => {
  const callQ = useQaCall(callId);
  const audioUrlQ = useQaAudioSignedUrl(callQ.data?.audio_path ?? null);
  const fireWebhook = useFireQaWebhook();
  // El borrado vive en QA History (no acá); el server-side RLS sigue
  // protegiendo los DELETE igualmente.

  const { user } = useAuth();
  const profileQ = useMyProfile();
  const sectionFeedbackQ = useQaSectionFeedback(callId);
  const feedbackHistoryQ = useQaHumanFeedback(callId);

  const evaluatorName =
    profileQ.data?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "Sin nombre";

  if (callQ.isLoading || !callQ.data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const call = callQ.data;
  const analysis = call.claude_analysis ?? {};
  const audioMetrics = call.audio_metrics as
    | { speakers?: SpeakerLike[]; total_duration_s?: number }
    | null;

  const feedbackByKey = new Map<string, QaSectionFeedback>();
  for (const fb of sectionFeedbackQ.data ?? []) {
    feedbackByKey.set(sectionKey(fb.section_type, fb.section_index), fb);
  }
  const sectionCtx: SectionFeedbackContext = {
    callId: call.id,
    feedbackByKey,
    evaluatorName,
  };

  const hasDimensions = (analysis.dimensions?.length ?? 0) > 0;
  const hasAudioMetrics =
    audioMetrics?.speakers && audioMetrics.speakers.length > 0;

  const lastFb = feedbackHistoryQ.data;

  const handleResend = async () => {
    try {
      await fireWebhook.mutateAsync({ callId: call.id });
      toast.success("Email reenviado");
    } catch (err) {
      toast.error("No se pudo reenviar el email", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="w-full">
      {/* Back button */}
      <div className="flex items-center justify-between pb-5">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-muted/20 px-4 text-sm font-medium transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-4 w-4" />
          Historial
        </button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResend}
            disabled={fireWebhook.isPending}
            className="gap-1.5"
          >
            {fireWebhook.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            Reenviar email
          </Button>
        </div>
      </div>

      {/* HERO HEADER — gradient con nombre + outcome pill + score circle */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card shadow-lg">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: `${scoreColorPct(call.claude_score)}20` }}
        />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: avatar + nombre + outcome + meta */}
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-start">
              {/* Avatar + IG icon (ambos linkean al mismo perfil de IG si
                  existe). Click en la foto = abrir IG. Click en el ícono
                  abajo de la foto también. */}
              {(() => {
                const igUrl = (
                  call.model as { ig_url?: string | null } | null
                )?.ig_url ?? null;
                const inner = (
                  <HeroAvatar
                    name={call.model?.name ?? "—"}
                    dataUrl={call.model?.avatar_data_url ?? null}
                    size={72}
                  />
                );
                return (
                  <div className="flex shrink-0 flex-col items-center gap-1.5">
                    {igUrl ? (
                      <a
                        href={igUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block transition-transform hover:scale-105"
                        title="Ver Instagram"
                      >
                        {inner}
                      </a>
                    ) : (
                      inner
                    )}
                    {igUrl && (
                      <a
                        href={igUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver Instagram"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 text-white shadow-md transition-transform hover:scale-110"
                      >
                        <InstagramIcon className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })()}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ModelNameLink
                    modelId={call.model?.id ?? null}
                    name={call.model?.name ?? "Sin modelo"}
                    igUrl={
                      (call.model as { ig_url?: string | null } | null)?.ig_url ?? null
                    }
                  />
                  <OutcomePill outcome={analysis.call_outcome} size="lg" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Closer:{" "}
                    <strong className="text-foreground/90">
                      {call.closer?.name ?? "—"}
                    </strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {fmtDate(call.call_date)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Evaluado por{" "}
                    <strong className="text-foreground/90">
                      {call.evaluator_name}
                    </strong>
                  </span>
                </div>
                {analysis.call_outcome_reason && (
                  <p className="mt-2 max-w-xl rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs italic leading-relaxed text-muted-foreground">
                    &ldquo;{analysis.call_outcome_reason}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Right: score circle + label */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <ScoreGauge score={call.claude_score} size={150} />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Score IA
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-row: Instagram link + Re-analyze + análisis generado */}
      <section className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {(() => {
            const igUrl = (
              call.model as { ig_url?: string | null } | null
            )?.ig_url;
            return igUrl ? (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-pink-500/40 bg-pink-500/10 px-3 py-1 text-xs font-semibold text-pink-400 transition-colors hover:bg-pink-500/20"
              >
                <InstagramIcon className="h-3.5 w-3.5" />
                Ver Instagram
              </a>
            ) : null;
          })()}
          {call.model?.category && (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: PRIMARY_SOFT, color: PRIMARY }}
            >
              Categoría: {call.model.category}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Análisis: {fmtDateTime(call.created_at)}
          </span>
        </div>
        <ReanalyzeButton callId={call.id} />
      </section>

      {/* Audio player (Maven extra — Kash no lo tenía aquí) */}
      {call.audio_path && (
        <section className="mt-3 rounded-2xl border border-border bg-card p-4">
          <h2
            className="mb-3 text-base font-semibold uppercase tracking-wide"
            style={{ color: PRIMARY, letterSpacing: "0.08em" }}
          >
            Audio de la llamada
          </h2>
          {audioUrlQ.isLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generando link…
            </div>
          ) : audioUrlQ.data ? (
            <AudioWithCaptions
              src={audioUrlQ.data}
              words={
                (call.audio_metrics as { words?: WordTiming[] } | null)?.words ?? null
              }
            />
          ) : (
            <p className="text-xs italic text-muted-foreground">
              No se pudo cargar el audio.
            </p>
          )}
        </section>
      )}

      {/* Ficha rápida */}
      <section className="mt-3 rounded-2xl border border-border bg-card p-4">
        <h2
          className="mb-3 text-base font-semibold uppercase tracking-wide"
          style={{ color: PRIMARY, letterSpacing: "0.08em" }}
        >
          Ficha rápida
        </h2>
        {analysis.call_facts ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FactCard
                icon="🎯"
                label="Motivo principal"
                value={analysis.call_facts.motivo_principal}
              />
              {analysis.call_facts.ubicacion && (
                <FactCard
                  icon="📍"
                  label="Ubicación"
                  value={analysis.call_facts.ubicacion}
                />
              )}
            </div>
            <div
              className="rounded-2xl border bg-muted/20 p-4 transition-all duration-200 hover:scale-[1.005] hover:bg-muted/30 hover:shadow-md"
              style={{ borderColor: `${GOLD}40` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg" aria-hidden>
                  💡
                </span>
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: PRIMARY }}
                >
                  Observaciones clave
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {analysis.call_facts.observaciones_clave.map((obs, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: GOLD }}
                    />
                    <span className="flex-1">{obs}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {analysis.summary}
            </p>
            <p className="text-xs text-muted-foreground">
              Este análisis se generó con el formato anterior. Usa
              &ldquo;Re-analizar&rdquo; arriba para obtener la ficha rápida
              estructurada.
            </p>
          </div>
        )}
      </section>

      {/* Charts row — radar + audio */}
      {(hasDimensions || hasAudioMetrics) && (
        <div className="mt-3 flex flex-col gap-3 lg:flex-row">
          {hasDimensions && (
            <section className="flex-1 rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Perfil visual
              </h2>
              <DimensionsRadar dimensions={analysis.dimensions!} />
            </section>
          )}

          {hasAudioMetrics && audioMetrics && (
            <section className="flex-1 rounded-2xl border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Métricas de audio
              </h2>
              <AudioMetricsChart
                metrics={
                  audioMetrics as {
                    speakers: SpeakerLike[];
                    total_duration_s?: number;
                  }
                }
                modelSignals={analysis.model_signals ?? null}
              />
              {audioMetrics.total_duration_s && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Duración total: {Math.round(audioMetrics.total_duration_s)}s
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Analysis sections (dimensions grouped, red flags, key moments, improvements) */}
      <section className="mt-3">
        <AnalysisSections analysis={analysis} ctx={sectionCtx} />
      </section>

      {/* Transcript */}
      {call.transcript && (
        <section className="mt-3 rounded-2xl border border-border bg-card p-4">
          <TranscriptCollapse transcript={call.transcript} />
        </section>
      )}

      {/* Human feedback */}
      <section className="mt-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Feedback humano
        </h2>
        {lastFb && (
          <ul className="mb-4 flex flex-col gap-3">
            <li className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {lastFb.evaluator_name}
                </span>
                <span>{fmtDateTime(lastFb.created_at)}</span>
              </div>
              {typeof lastFb.human_score === "number" && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Score humano:{" "}
                  <strong className="text-foreground">
                    {lastFb.human_score}
                  </strong>
                </div>
              )}
              <p className="mt-2 whitespace-pre-wrap">
                {lastFb.feedback_text}
              </p>
            </li>
          </ul>
        )}
        <HumanFeedbackForm callId={call.id} />
      </section>
    </div>
  );
};

// ModelNameLink — el nombre del modelo siempre es link. Si la modelo
// tiene ig_url cargado, abre directo. Si no (caso de QAs viejas
// subidas antes de hacer required el campo IG), abre una búsqueda de
// Google "<nombre> instagram" — funciona como fallback útil para que
// el manager encuentre la cuenta en una pestaña sin pasar por dialogs.
//
// El form de subida QA ahora tiene IG required (validación en
// AgencyNewQa.tsx), así que las QAs nuevas siempre van a entrar al
// path con ig_url directo. El fallback de Google es para data legacy.
const ModelNameLink = ({
  name,
  igUrl,
}: {
  modelId: string | null;
  name: string;
  igUrl: string | null;
}) => {
  const targetUrl =
    igUrl ??
    `https://www.google.com/search?q=${encodeURIComponent(`${name} instagram`)}`;
  const isFallback = !igUrl;
  return (
    <a
      href={targetUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="truncate text-2xl font-black tracking-tight transition-colors hover:text-pink-400"
      title={isFallback ? `Buscar a ${name} en Instagram` : "Ver Instagram"}
    >
      {name}
    </a>
  );
};

export default CallDetailPage;

// AudioWithCaptions — wrapper sobre <audio> que sincroniza captions
// en vivo a partir de los word-timings persistidos en audio_metrics.words.
// Se actualiza con cada `timeupdate` del player (HTML5 dispara ~4 veces
// por segundo). Para calls viejas que no tienen words[], se renderiza
// solo el audio sin caja de captions.
interface WordTiming {
  text: string;
  start: number;
  end: number;
  speaker_label: string | null;
}

const AudioWithCaptions = ({
  src,
  words,
}: {
  src: string;
  words: WordTiming[] | null;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(-1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !words || words.length === 0) return;
    const onTimeUpdate = () => {
      const t = audio.currentTime;
      // Búsqueda binaria por palabra activa: la primera con end > t.
      let lo = 0;
      let hi = words.length - 1;
      let idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (words[mid].end <= t) {
          lo = mid + 1;
        } else {
          idx = mid;
          hi = mid - 1;
        }
      }
      // Si la palabra todavía no empezó, mostramos como activa la
      // anterior (estamos en silencio entre palabras).
      if (idx >= 0 && words[idx].start > t) {
        idx = idx - 1;
      }
      setActiveIdx(idx);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [words]);

  const hasCaptions = !!words && words.length > 0;

  // Render: ventana de ~14 palabras alrededor de la activa para que el
  // ojo siga el flujo sin scroll. Si no arrancó (activeIdx = -1), mostramos
  // las primeras 14.
  const window = useMemo(() => {
    if (!hasCaptions || !words) return [] as Array<{ idx: number; w: WordTiming }>;
    const pivot = activeIdx >= 0 ? activeIdx : 0;
    const start = Math.max(0, pivot - 4);
    const end = Math.min(words.length, start + 14);
    const realStart = Math.max(0, end - 14);
    return words.slice(realStart, end).map((w, i) => ({ idx: realStart + i, w }));
  }, [words, activeIdx, hasCaptions]);

  return (
    <div className="space-y-3">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={src}
        className="w-full"
      >
        Tu navegador no soporta audio HTML5.
      </audio>
      {hasCaptions && (
        <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent p-4">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-400">
            Captions en vivo
          </p>
          <p className="text-sm leading-relaxed text-foreground/80">
            {window.length === 0 ? (
              <span className="italic text-muted-foreground">
                Apretá play para ver el texto sincronizarse con el audio.
              </span>
            ) : (
              window.map(({ idx, w }) => {
                const isActive = idx === activeIdx;
                return (
                  <span
                    key={idx}
                    className={cn(
                      "transition-colors",
                      isActive
                        ? "rounded bg-violet-500/30 px-1 font-semibold text-foreground"
                        : "",
                    )}
                  >
                    {w.text}
                    {!w.text.endsWith(" ") && " "}
                  </span>
                );
              })
            )}
          </p>
        </div>
      )}
    </div>
  );
};
