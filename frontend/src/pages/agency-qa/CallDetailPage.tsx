import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
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
  Calendar,
  User,
  Quote,
  TrendingUp,
  Target,
  Heart,
  Zap,
  CheckCircle2,
  XCircle,
  Mic,
  FileText,
  ArrowUpRight,
  ListChecks,
  BarChart3,
  Activity,
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
  OUTCOME_META,
  useQaHumanFeedback,
  useCreateQaHumanFeedback,
  useAnalyzeQaCall,
  useQaSectionFeedback,
  useUpsertQaSectionFeedback,
  useDeleteQaSectionFeedback,
  type CallAnalysis,
  type CallOutcome,
  type QaSectionFeedback,
  type QaSectionType,
} from "@/hooks/useAgencyQa";

// CallDetailPage — modern, polished QA call detail view.
// Visual hierarchy: gradient hero header with score circle → outcome banner →
// content sections in a 2-column grid where possible, with colored accents,
// icons, progress bars, and consistent card styling.

const formatLevel = (lv: string) =>
  lv.charAt(0).toUpperCase() + lv.slice(1);

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// ─── Avatar ─────────────────────────────────────────────────────────
const Avatar = ({
  name,
  dataUrl,
  size = 48,
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

// ─── Section feedback context ──────────────────────────────────────
type SectionFeedbackContext = {
  callId: string;
  feedbackByKey: Map<string, QaSectionFeedback>;
  evaluatorName: string;
};

const sectionKey = (type: QaSectionType, index: number) =>
  `${type}:${index}`;

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
  const hasNote = !!existing?.note || existing?.suggested_score != null;

  const handleVote = async (vote: 1 | -1) => {
    try {
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
          "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
          isUp
            ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
            : "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground"
        )}
        title={isUp ? "Quitar 👍" : "Marcar 👍"}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => handleVote(-1)}
        disabled={upsert.isPending || remove.isPending}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
          isDown
            ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40"
            : "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground"
        )}
        title={isDown ? "Quitar 👎" : "Marcar 👎"}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-all",
              hasNote
                ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground"
            )}
            title={hasNote ? "Editar nota" : "Agregar nota"}
            onClick={() => {
              setNoteDraft(existing?.note ?? "");
              setScoreDraft(
                existing?.suggested_score != null
                  ? String(existing.suggested_score)
                  : ""
              );
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
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
            placeholder="Por qué corregís esto, qué le faltó al análisis…"
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

// ─── SectionCard: a polished section wrapper with header + body ────
const SectionCard = ({
  title,
  icon,
  iconBg,
  hint,
  accent,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  hint?: string;
  accent?: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <section
    className={cn(
      "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:shadow-md",
      className
    )}
  >
    {accent && (
      <div className="h-1 w-full" style={{ background: accent }} />
    )}
    <div className="border-b border-border/40 bg-muted/20 px-5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm"
            style={{ background: iconBg }}
          >
            {icon}
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">
            {title}
          </h3>
        </div>
        {hint && (
          <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
    </div>
    <div className="space-y-3 p-5">{children}</div>
  </section>
);

// ─── ScoreCircle ───────────────────────────────────────────────────
const ScoreCircle = ({
  score,
  size = 160,
}: {
  score: number;
  size?: number;
}) => {
  const color = scoreColor(score);
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <defs>
          <linearGradient
            id={`scoreGrad-${score}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
          opacity="0.3"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#scoreGrad-${score})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="flex flex-col items-center justify-center">
        <span
          className="text-4xl font-black leading-none tabular-nums tracking-tight"
          style={{ color }}
        >
          {score}
        </span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
};

// ─── Outcome Pill ──────────────────────────────────────────────────
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
        size === "lg"
          ? "h-9 px-4 text-sm"
          : "h-7 px-3 text-xs"
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

// ─── Dimensions block with progress bars ──────────────────────────
const DimensionsBlock = ({
  dimensions,
  ctx,
}: {
  dimensions: NonNullable<CallAnalysis["dimensions"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (dimensions.length === 0) return null;
  const radarData = dimensions.map((d) => ({
    name: d.name.length > 14 ? d.name.slice(0, 14) + "…" : d.name,
    score: d.score * 10,
    fullMark: 100,
  }));
  const avgScore =
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  return (
    <SectionCard
      title="Perfil Visual — Dimensiones"
      icon={<BarChart3 className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #6366f1 0%, #4338ca 100%)"
      accent="linear-gradient(90deg, #6366f1 0%, #4338ca 100%)"
      hint={`Promedio ${(avgScore * 10).toFixed(0)}/100`}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[400px_1fr]">
        {/* Radar */}
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{
                    fontSize: 9,
                    fill: "hsl(var(--muted-foreground))",
                  }}
                />
                <Radar
                  dataKey="score"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Dimension list with progress bars */}
        <ul className="space-y-3">
          {dimensions.map((d, i) => {
            const pct = d.score * 10;
            const color = scoreColor(pct);
            return (
              <li
                key={`${d.name}-${i}`}
                className="rounded-lg border border-border/40 bg-muted/5 p-3 transition-colors hover:bg-muted/15"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-bold tabular-nums text-white"
                      style={{ background: color }}
                    >
                      {d.score}/10
                    </span>
                    {ctx && (
                      <SectionThumbs
                        ctx={ctx}
                        type="dimension"
                        index={i}
                        label={d.name}
                      />
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${color}80 0%, ${color} 100%)`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {d.feedback}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
};

// ─── AudioMetricsBlock ─────────────────────────────────────────────
const AudioMetricsBlock = ({
  metrics,
}: {
  metrics: {
    total_duration_s?: number;
    speaker_count?: number;
    speakers?: Array<{
      id: string;
      label: string;
      word_count: number;
      estimated_duration_s: number;
      talk_ratio: number;
    }>;
  };
}) => {
  const speakers = metrics?.speakers ?? [];
  if (speakers.length === 0) return null;
  const totalDuration = metrics?.total_duration_s ?? 0;
  const fmtDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const SPEAKER_COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b"];
  const maxWords = Math.max(...speakers.map((s) => s.word_count));

  return (
    <SectionCard
      title="Métricas de Audio"
      icon={<Activity className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)"
      accent="linear-gradient(90deg, #06b6d4 0%, #0e7490 100%)"
      hint={`${fmtDuration(totalDuration)} · ${speakers.length} speakers`}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {speakers.map((s, i) => {
          const color = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
          const wordsPct = (s.word_count / maxWords) * 100;
          const ratioPct = Math.round(s.talk_ratio * 100);
          return (
            <div
              key={s.id}
              className="rounded-xl border border-border/40 bg-muted/5 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-sm font-bold">{s.label}</span>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
                  style={{ background: color }}
                >
                  {ratioPct}%
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Palabras</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {s.word_count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${wordsPct}%`, background: color }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Duración</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {fmtDuration(s.estimated_duration_s)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

// ─── KeyMomentsBlock ──────────────────────────────────────────────
const KeyMomentsBlock = ({
  moments,
  ctx,
}: {
  moments: NonNullable<CallAnalysis["key_moments"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (moments.length === 0) return null;
  const positivos = moments.filter((m) => m.kind === "positivo").length;
  const negativos = moments.filter((m) => m.kind === "negativo").length;
  return (
    <SectionCard
      title="Momentos clave"
      icon={<Star className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
      accent="linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"
      hint={`${positivos} ✓ · ${negativos} ✗`}
    >
      <ul className="space-y-3">
        {moments.map((m, i) => {
          const isPositive = m.kind === "positivo";
          const color = isPositive ? "#10b981" : "#ef4444";
          return (
            <li
              key={i}
              className="overflow-hidden rounded-xl border border-border/40 bg-muted/5"
            >
              <div
                className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-2"
                style={{ background: `${color}15` }}
              >
                <div className="flex items-center gap-1.5">
                  {isPositive ? (
                    <CheckCircle2 className="h-4 w-4" style={{ color }} />
                  ) : (
                    <XCircle className="h-4 w-4" style={{ color }} />
                  )}
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color }}
                  >
                    {isPositive ? "Positivo" : "Negativo"}
                  </span>
                </div>
                {ctx && (
                  <SectionThumbs
                    ctx={ctx}
                    type="key_moment"
                    index={i}
                    label={m.quote.slice(0, 60)}
                  />
                )}
              </div>
              <div className="space-y-2 p-4">
                <blockquote
                  className="border-l-3 pl-3 text-sm italic leading-relaxed text-foreground/90"
                  style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                >
                  &ldquo;{m.quote}&rdquo;
                </blockquote>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {m.why}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
};

// ─── RedFlagsBlock ────────────────────────────────────────────────
const RedFlagsBlock = ({
  flags,
  ctx,
}: {
  flags: NonNullable<CallAnalysis["red_flags"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (flags.length === 0) return null;
  return (
    <SectionCard
      title="Red flags"
      icon={<AlertTriangle className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)"
      accent="linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)"
      hint={`${flags.length}`}
    >
      <ul className="space-y-3">
        {flags.map((f, i) => (
          <li
            key={i}
            className="overflow-hidden rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-rose-500/5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-rose-500/20 bg-rose-500/10 px-4 py-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-rose-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                  {f.type.replace(/_/g, " ")}
                </span>
              </div>
              {ctx && (
                <SectionThumbs
                  ctx={ctx}
                  type="red_flag"
                  index={i}
                  label={f.type}
                />
              )}
            </div>
            <div className="space-y-2 p-4">
              <p className="text-sm leading-relaxed text-foreground/90">
                {f.description}
              </p>
              {f.quote && (
                <blockquote className="border-l-3 border-l-rose-500/50 pl-3 text-xs italic text-muted-foreground" style={{ borderLeftWidth: 3 }}>
                  &ldquo;{f.quote}&rdquo;
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
};

// ─── ImprovementsBlock ────────────────────────────────────────────
const ImprovementsBlock = ({
  improvements,
  ctx,
}: {
  improvements: string[];
  ctx?: SectionFeedbackContext;
}) => {
  if (improvements.length === 0) return null;
  return (
    <SectionCard
      title="Acciones de mejora"
      icon={<ListChecks className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #10b981 0%, #047857 100%)"
      accent="linear-gradient(90deg, #10b981 0%, #047857 100%)"
      hint={`${improvements.length} ${improvements.length === 1 ? "acción" : "acciones"}`}
    >
      <ol className="space-y-2.5">
        {improvements.map((s, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/5 p-3 transition-colors hover:bg-muted/15"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
              {i + 1}
            </span>
            <div className="flex flex-1 items-start justify-between gap-2">
              <span className="text-sm leading-relaxed text-foreground/90">
                {s}
              </span>
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
    </SectionCard>
  );
};

// ─── SignalCard ──────────────────────────────────────────────────
const SignalCard = ({
  label,
  level,
  reason,
  icon,
}: {
  label: string;
  level: string;
  reason: string;
  icon: React.ReactNode;
}) => {
  const levelMap = {
    alto: { color: "#10b981", bg: "from-emerald-500/15 to-emerald-500/5" },
    medio: { color: "#f59e0b", bg: "from-amber-500/15 to-amber-500/5" },
    bajo: { color: "#ef4444", bg: "from-rose-500/15 to-rose-500/5" },
    ambiguo: { color: "#6b7280", bg: "from-slate-500/15 to-slate-500/5" },
  } as const;
  const lv = (levelMap[level as keyof typeof levelMap] ?? levelMap.ambiguo);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-gradient-to-br p-4",
        lv.bg
      )}
      style={{ borderColor: `${lv.color}40` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
            style={{ background: lv.color }}
          >
            {icon}
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-sm"
          style={{ background: lv.color }}
        >
          {formatLevel(level)}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground/85">{reason}</p>
    </div>
  );
};

// ─── ModelSignalsBlock ───────────────────────────────────────────
const ModelSignalsBlock = ({
  signals,
}: {
  signals: NonNullable<CallAnalysis["model_signals"]>;
}) => (
  <SectionCard
    title="Señales de la modelo"
    icon={<Heart className="h-4 w-4" />}
    iconBg="linear-gradient(135deg, #ec4899 0%, #be185d 100%)"
    accent="linear-gradient(90deg, #ec4899 0%, #be185d 100%)"
  >
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <SignalCard
        label="Interés"
        level={signals.interest_level}
        reason={signals.interest_reason}
        icon={<TrendingUp className="h-3.5 w-3.5" />}
      />
      <SignalCard
        label="Complicidad"
        level={signals.complicity_level}
        reason={signals.complicity_reason}
        icon={<Heart className="h-3.5 w-3.5" />}
      />
    </div>

    {signals.objections.length > 0 && (
      <div className="space-y-2">
        <div className="flex items-center gap-2 pt-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
            <Target className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Objeciones ({signals.objections.length})
          </span>
        </div>
        <div className="space-y-2">
          {signals.objections.map((o, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/40 bg-muted/10 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  {o.topic}
                </span>
              </div>
              <p className="text-sm text-foreground/90">{o.description}</p>
              {o.quote && (
                <blockquote className="mt-2 rounded-md border-l-2 border-l-amber-500/50 bg-muted/20 px-3 py-2 text-xs italic text-muted-foreground">
                  &ldquo;{o.quote}&rdquo;
                </blockquote>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    {signals.summary_of_model && (
      <div className="rounded-xl border border-border/40 bg-gradient-to-br from-pink-500/10 to-rose-500/5 p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Quote className="h-3.5 w-3.5 text-pink-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-pink-400">
            Perfil de la modelo
          </span>
        </div>
        <p className="text-sm italic leading-relaxed text-foreground/85">
          {signals.summary_of_model}
        </p>
      </div>
    )}
  </SectionCard>
);

// ─── FeedbackSection ─────────────────────────────────────────────
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
      await createFeedback.mutateAsync({
        call_id: callId,
        evaluator_name: defaultEvaluator || "Sin nombre",
        feedback_text: trimmed,
        human_score: numericScore,
      });
      toast.success("Feedback guardado", {
        description: "Podés re-analizar la QA para que la IA lo considere.",
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
      toast.error("Primero guardá un feedback humano");
      return;
    }
    try {
      const result = await analyze.mutateAsync({
        callId,
        withFeedback: true,
      });
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
      const result = await analyze.mutateAsync({
        callId,
        withFeedback: false,
      });
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
    <SectionCard
      title="Feedback humano"
      icon={<Lightbulb className="h-4 w-4" />}
      iconBg="linear-gradient(135deg, #eab308 0%, #a16207 100%)"
      accent="linear-gradient(90deg, #eab308 0%, #a16207 100%)"
    >
      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-400/90">
        💡 Dejá feedback sobre el análisis (qué le faltó, qué interpretó mal).
        Después podés re-analizar y la IA lo va a tomar en cuenta.
      </p>

      {feedbackQ.isLoading ? (
        <div className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Cargando feedback…
        </div>
      ) : last ? (
        <div className="rounded-xl border border-border/40 bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                {(last.evaluator_name?.[0] ?? "?").toUpperCase()}
              </span>
              <span className="font-semibold text-foreground/90">
                {last.evaluator_name}
              </span>
              <span className="text-muted-foreground">
                · {fmtTs(last.created_at)}
              </span>
            </div>
            {typeof last.human_score === "number" && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white"
                style={{ background: scoreColor(last.human_score) }}
              >
                Humano {last.human_score}
              </span>
            )}
          </div>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {last.feedback_text}
          </p>
          <button
            type="button"
            className="mt-3 text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={() => setShowHistory((s) => !s)}
          >
            {showHistory ? "Ocultar nuevo feedback" : "+ Agregar otro feedback"}
          </button>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border/60 bg-muted/5 px-3 py-3 text-center text-xs italic text-muted-foreground">
          Todavía no hay feedback humano para esta QA.
        </p>
      )}

      {(showHistory || !last) && (
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/5 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="feedback-text" className="text-xs font-semibold">
              Feedback (qué corregir / agregar)
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="human-score" className="text-xs font-semibold">
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
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={createFeedback.isPending || !draft.trim()}
                className="h-9 w-full gap-1.5 sm:w-auto"
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

      <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
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
          title={!last ? "Primero guardá feedback humano" : undefined}
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
    </SectionCard>
  );
};

// ─── Main page ───────────────────────────────────────────────────
const CallDetailPage = ({
  callId,
  onBack,
}: {
  callId: string;
  onBack: () => void;
}) => {
  const callQ = useQaCall(callId);
  const [showTranscript, setShowTranscript] = useState(false);
  const call = callQ.data;
  const a = call?.claude_analysis ?? {};
  const audioUrlQ = useQaAudioSignedUrl(call?.audio_path ?? null);
  const audioMetrics = (call?.audio_metrics ?? {}) as {
    total_duration_s?: number;
    speaker_count?: number;
    speakers?: Array<{
      id: string;
      label: string;
      word_count: number;
      estimated_duration_s: number;
      talk_ratio: number;
    }>;
  };

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

  if (callQ.isLoading || !call) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outcome = a.call_outcome;
  const modelName = call.model?.name ?? "Sin modelo";
  const closerName = call.closer?.name ?? "Sin closer";
  const score = call.claude_score;
  const scoreClr = scoreColor(score);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Volver al historial
      </button>

      {/* HERO HEADER — gradient with score circle */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card shadow-lg">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div
          className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full blur-3xl"
          style={{ background: `${scoreClr}20` }}
        />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: model + closer + date */}
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar
                name={modelName}
                dataUrl={call.model?.avatar_data_url ?? null}
                size={72}
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-black tracking-tight">
                    {modelName}
                  </h1>
                  <OutcomePill outcome={outcome} size="lg" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Closer:{" "}
                    <strong className="text-foreground/90">
                      {closerName}
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
                {a.call_outcome_reason && (
                  <p className="mt-2 max-w-xl rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs italic leading-relaxed text-muted-foreground">
                    &ldquo;{a.call_outcome_reason}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Right: big score circle */}
            <div className="flex shrink-0 flex-col items-center gap-2">
              <ScoreCircle score={score} size={150} />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Score IA
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY + FICHA RAPIDA — 2 columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {a.summary && (
          <div className="lg:col-span-3">
            <SectionCard
              title="Resumen ejecutivo"
              icon={<FileText className="h-4 w-4" />}
              iconBg="linear-gradient(135deg, #6366f1 0%, #4338ca 100%)"
              accent="linear-gradient(90deg, #6366f1 0%, #4338ca 100%)"
              className="h-full"
            >
              <div className="rounded-xl border-l-4 border-l-primary bg-gradient-to-br from-primary/5 to-transparent p-4">
                <p className="text-sm leading-relaxed text-foreground/90">
                  {a.summary}
                </p>
              </div>
            </SectionCard>
          </div>
        )}

        {a.call_facts && (
          <div className={a.summary ? "lg:col-span-2" : "lg:col-span-5"}>
            <SectionCard
              title="Ficha rápida"
              icon={<Zap className="h-4 w-4" />}
              iconBg="linear-gradient(135deg, #f59e0b 0%, #b45309 100%)"
              accent="linear-gradient(90deg, #f59e0b 0%, #b45309 100%)"
              className="h-full"
            >
              {a.call_facts.ubicacion && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/20 px-3 py-2 text-xs">
                  <MapPin className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-medium">
                    {a.call_facts.ubicacion}
                  </span>
                </div>
              )}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Motivo principal
                </div>
                <p className="text-sm font-semibold leading-snug text-foreground/95">
                  {a.call_facts.motivo_principal}
                </p>
              </div>
              {a.call_facts.observaciones_clave.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Observaciones clave
                  </div>
                  <ul className="space-y-1.5">
                    {a.call_facts.observaciones_clave.map((o, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
                      >
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </div>

      {/* DIMENSIONS */}
      {a.dimensions && a.dimensions.length > 0 && (
        <DimensionsBlock dimensions={a.dimensions} ctx={sectionCtx} />
      )}

      {/* AUDIO METRICS */}
      {audioMetrics?.speakers && audioMetrics.speakers.length > 0 && (
        <AudioMetricsBlock metrics={audioMetrics} />
      )}

      {/* MODEL SIGNALS */}
      {a.model_signals && <ModelSignalsBlock signals={a.model_signals} />}

      {/* KEY MOMENTS + RED FLAGS — 2 columns when both exist */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {a.key_moments && a.key_moments.length > 0 && (
          <KeyMomentsBlock moments={a.key_moments} ctx={sectionCtx} />
        )}
        {a.red_flags && a.red_flags.length > 0 && (
          <RedFlagsBlock flags={a.red_flags} ctx={sectionCtx} />
        )}
      </div>

      {/* IMPROVEMENTS */}
      {a.improvements && a.improvements.length > 0 && (
        <ImprovementsBlock
          improvements={a.improvements}
          ctx={sectionCtx}
        />
      )}

      {/* AUDIO + TRANSCRIPT — 2 columns */}
      {(call.audio_path || call.transcript) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {call.audio_path && (
            <SectionCard
              title="Audio de la llamada"
              icon={<Headphones className="h-4 w-4" />}
              iconBg="linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
              accent="linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)"
            >
              {audioUrlQ.isLoading ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted/20 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generando link…
                </div>
              ) : audioUrlQ.data ? (
                <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Mic className="h-4 w-4 text-purple-400" />
                    <span className="text-xs font-semibold text-purple-300">
                      Reproducir grabación
                    </span>
                  </div>
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
                <p className="rounded-lg border border-dashed border-border/60 bg-muted/5 p-4 text-center text-xs italic text-muted-foreground">
                  No se pudo cargar el audio.
                </p>
              )}
            </SectionCard>
          )}

          {call.transcript && (
            <SectionCard
              title="Transcript"
              icon={<FileText className="h-4 w-4" />}
              iconBg="linear-gradient(135deg, #64748b 0%, #334155 100%)"
              accent="linear-gradient(90deg, #64748b 0%, #334155 100%)"
              hint={`${call.transcript.length.toLocaleString()} chars`}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTranscript((s) => !s)}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {showTranscript ? "Ocultar transcript" : "Ver transcript completo"}
                </span>
                {showTranscript ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              {showTranscript && (
                <pre className="max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/10 p-4 text-xs leading-relaxed">
                  {call.transcript}
                </pre>
              )}
            </SectionCard>
          )}
        </div>
      )}

      {/* Empty-analysis fallback */}
      {!a.summary && (!a.dimensions || a.dimensions.length === 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-400">
                Análisis incompleto
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-400/80">
                Esta llamada no tiene un análisis IA completo. Probablemente
                sea una entrada legacy o el análisis falló. Usá
                &ldquo;Re-analizar&rdquo; abajo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* FEEDBACK */}
      <FeedbackSection callId={call.id} />
    </div>
  );
};

export default CallDetailPage;
