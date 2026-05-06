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
  Instagram,
  Tag,
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

// CallDetailPage — full-page view that replaces CallDetailDrawer.
// Kash-style layout: back button at top, header cards, large score circle,
// summary, Ficha Rápida, radar + audio metrics side-by-side, model signals,
// dimensions list, red flags, key moments, improvements, transcript,
// human feedback form.

const formatLevel = (lv: string) => lv.charAt(0).toUpperCase() + lv.slice(1);

const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const Avatar = ({
  name,
  dataUrl,
  size = 40,
}: {
  name: string;
  dataUrl: string | null;
  size?: number;
}) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white/90"
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

const OutcomeBadge = ({
  outcome,
}: {
  outcome: CallOutcome | undefined;
}) => {
  if (!outcome || !(outcome in OUTCOME_META)) return null;
  const c = OUTCOME_META[outcome as keyof typeof OUTCOME_META];
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-white"
      style={{ background: c.bg }}
    >
      <span aria-hidden>{c.icon}</span>
      {c.label}
    </span>
  );
};

// ─── Section thumbs ─────────────────────────────────────────────────
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
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isUp
            ? "bg-emerald-500/20 text-emerald-500"
            : "text-muted-foreground hover:bg-muted/50"
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
            ? "bg-rose-500/20 text-rose-400"
            : "text-muted-foreground hover:bg-muted/50"
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
                : "text-muted-foreground hover:bg-muted/50"
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

// ─── Styled section wrapper ─────────────────────────────────────────
const Section = ({
  title,
  children,
  hint,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}) => (
  <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
      </div>
      {hint && (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      )}
    </div>
    {children}
  </section>
);

// ─── Header info card ───────────────────────────────────────────────
const InfoCard = ({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) => (
  <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-semibold">{value}</div>
      {sub && (
        <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
      )}
    </div>
  </div>
);

// ─── Score circle ───────────────────────────────────────────────────
const ScoreCircle = ({ score }: { score: number }) => {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="130" height="130" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
};

// ─── Analysis sub-renderers ─────────────────────────────────────────
const DimensionsBlock = ({
  dimensions,
  ctx,
}: {
  dimensions: NonNullable<CallAnalysis["dimensions"]>;
  ctx?: SectionFeedbackContext;
}) => {
  if (dimensions.length === 0) return null;
  const radarData = dimensions.map((d) => ({
    name: d.name,
    score: d.score * 10,
    fullMark: 100,
  }));
  return (
    <Section title="Perfil Visual — Dimensiones">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="78%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="name"
                tick={{
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{
                  fontSize: 9,
                  fill: "hsl(var(--muted-foreground))",
                }}
              />
              <Radar
                dataKey="score"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.35}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-2">
          {dimensions.map((d, i) => (
            <li key={`${d.name}-${i}`} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{d.name}</span>
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold tabular-nums"
                    style={{ color: scoreColor(d.score * 10) }}
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
              <p className="text-xs leading-snug text-muted-foreground">
                {d.feedback}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
};

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

  const SPEAKER_COLORS = ["#6d28d9", "#2563eb", "#059669", "#d97706"];

  const barData = speakers.map((s, i) => ({
    name: s.label,
    words: s.word_count,
    duration: s.estimated_duration_s,
    ratio: Math.round(s.talk_ratio * 100),
    fill: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
  }));

  return (
    <Section title="Métricas de Audio">
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          Duración total:{" "}
          <strong className="text-foreground">
            {fmtDuration(totalDuration)}
          </strong>
        </span>
        <span>
          Speakers:{" "}
          <strong className="text-foreground">{metrics?.speaker_count ?? speakers.length}</strong>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Words per speaker */}
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Palabras por hablante
          </div>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Bar dataKey="words" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Talk ratio */}
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Proporción de habla
          </div>
          <div className="space-y-2">
            {barData.map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {s.ratio}%
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full rounded-full bg-muted/40">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${s.ratio}%`,
                      background: s.fill,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
          <li
            key={i}
            className="rounded-lg border border-border/60 bg-muted/10 p-3"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
              <span
                style={{
                  color:
                    m.kind === "positivo"
                      ? "rgb(22 163 74)"
                      : "rgb(220 38 38)",
                }}
              >
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
            <blockquote className="border-l-2 border-primary/30 pl-2.5 text-sm italic text-foreground/80">
              &ldquo;{m.quote}&rdquo;
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
    <Section
      title="Red flags"
      hint={`${flags.length}`}
      icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
    >
      <ul className="space-y-2">
        {flags.map((f, i) => (
          <li
            key={i}
            className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                {f.type.replace(/_/g, " ")}
              </span>
              {ctx && (
                <SectionThumbs ctx={ctx} type="red_flag" index={i} label={f.type} />
              )}
            </div>
            <p className="text-xs text-foreground/80">{f.description}</p>
            {f.quote && (
              <blockquote className="mt-1.5 border-l-2 border-rose-500/40 pl-2 text-xs italic text-muted-foreground">
                &ldquo;{f.quote}&rdquo;
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
          <li
            key={i}
            className="list-decimal text-foreground/90 marker:text-muted-foreground"
          >
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

const ModelSignalsBlock = ({
  signals,
}: {
  signals: NonNullable<CallAnalysis["model_signals"]>;
}) => (
  <Section title="Señales de la modelo">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <SignalCard
        label="Interés"
        level={signals.interest_level}
        reason={signals.interest_reason}
      />
      <SignalCard
        label="Complicidad"
        level={signals.complicity_level}
        reason={signals.complicity_reason}
      />
    </div>
    {signals.objections.length > 0 && (
      <div className="mt-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Objeciones ({signals.objections.length})
        </div>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Tema
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Descripción
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Cita
                </th>
              </tr>
            </thead>
            <tbody>
              {signals.objections.map((o, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className="px-3 py-2 font-medium">{o.topic}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {o.description}
                  </td>
                  <td className="px-3 py-2 italic text-muted-foreground">
                    &ldquo;{o.quote}&rdquo;
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    <p className="mt-2 text-xs italic text-muted-foreground">
      {signals.summary_of_model}
    </p>
  </Section>
);

const SignalCard = ({
  label,
  level,
  reason,
}: {
  label: string;
  level: string;
  reason: string;
}) => {
  const color =
    level === "alto"
      ? "rgb(22 163 74)"
      : level === "medio"
        ? "rgb(202 138 4)"
        : level === "bajo"
          ? "rgb(220 38 38)"
          : "rgb(148 163 184)";
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: color }}>
          {formatLevel(level)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-foreground/80">
        {reason}
      </p>
    </div>
  );
};

// ─── Feedback section ───────────────────────────────────────────────
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
    <Section title="Feedback humano" icon={<Lightbulb className="h-3.5 w-3.5 text-amber-400" />}>
      <p className="text-[11px] text-muted-foreground">
        Dejá feedback sobre el análisis (qué le faltó, qué interpretó mal).
        Después podés re-analizar y la IA lo va a tomar en cuenta.
      </p>

      {feedbackQ.isLoading ? (
        <div className="text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Cargando feedback…
        </div>
      ) : last ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
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
        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="space-y-1">
            <Label htmlFor="feedback-text" className="text-xs">
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
    </Section>
  );
};

// ─── Main page component ────────────────────────────────────────────
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

  // Section feedback
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Historial
      </button>

      {/* Header: cards + score */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: info cards */}
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
            <Avatar name={modelName} dataUrl={call.model?.avatar_data_url ?? null} size={44} />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Modelo
              </div>
              <div className="truncate text-sm font-semibold">{modelName}</div>
            </div>
          </div>
          <InfoCard
            icon={<User className="h-4 w-4" />}
            label="Closer"
            value={closerName}
            sub={`Evaluado por ${call.evaluator_name}`}
          />
          <InfoCard
            icon={<Calendar className="h-4 w-4" />}
            label="Fecha"
            value={fmtDate(call.call_date)}
            sub={
              outcome
                ? undefined
                : undefined
            }
          />
        </div>

        {/* Right: score circle + outcome */}
        <div className="flex flex-col items-center gap-2">
          <ScoreCircle score={call.claude_score} />
          <OutcomeBadge outcome={outcome} />
        </div>
      </div>

      {/* Outcome reason */}
      {a.call_outcome_reason && (
        <p className="rounded-xl border border-border/60 bg-card px-4 py-3 text-sm italic text-muted-foreground">
          {a.call_outcome_reason}
        </p>
      )}

      {/* Summary */}
      {a.summary && (
        <Section title="Resumen">
          <p className="text-sm leading-relaxed">{a.summary}</p>
        </Section>
      )}

      {/* Ficha Rápida */}
      {a.call_facts && (
        <Section title="Ficha Rápida">
          {a.call_facts.ubicacion && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{a.call_facts.ubicacion}</span>
            </div>
          )}
          <p className="text-sm font-medium">{a.call_facts.motivo_principal}</p>
          <ul className="space-y-1 pl-4 text-sm">
            {a.call_facts.observaciones_clave.map((o, i) => (
              <li
                key={i}
                className="list-disc text-foreground/85 marker:text-muted-foreground"
              >
                {o}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Dimensions radar + list */}
      {a.dimensions && a.dimensions.length > 0 && (
        <DimensionsBlock dimensions={a.dimensions} ctx={sectionCtx} />
      )}

      {/* Audio metrics */}
      {audioMetrics?.speakers && audioMetrics.speakers.length > 0 && (
        <AudioMetricsBlock metrics={audioMetrics} />
      )}

      {/* Model signals */}
      {a.model_signals && <ModelSignalsBlock signals={a.model_signals} />}

      {/* Key moments */}
      {a.key_moments && a.key_moments.length > 0 && (
        <KeyMomentsBlock moments={a.key_moments} ctx={sectionCtx} />
      )}

      {/* Red flags */}
      {a.red_flags && a.red_flags.length > 0 && (
        <RedFlagsBlock flags={a.red_flags} ctx={sectionCtx} />
      )}

      {/* Improvements */}
      {a.improvements && a.improvements.length > 0 && (
        <ImprovementsBlock improvements={a.improvements} ctx={sectionCtx} />
      )}

      {/* Audio playback */}
      {call.audio_path && (
        <Section title="Audio" icon={<Headphones className="h-3.5 w-3.5 text-muted-foreground" />}>
          {audioUrlQ.isLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generando link…
            </div>
          ) : audioUrlQ.data ? (
            <audio
              controls
              preload="metadata"
              src={audioUrlQ.data}
              className="w-full"
            >
              Tu navegador no soporta audio HTML5.
            </audio>
          ) : (
            <p className="text-xs text-muted-foreground">
              No se pudo cargar el audio (signed URL falló).
            </p>
          )}
        </Section>
      )}

      {/* Transcript */}
      <Section
        title="Transcript"
        hint={`${call.transcript.length.toLocaleString()} chars`}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowTranscript((s) => !s)}
          className="w-full justify-between"
        >
          <span>{showTranscript ? "Ocultar" : "Ver transcript completo"}</span>
          {showTranscript ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        {showTranscript && (
          <pre className="mt-2 max-h-[500px] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/20 p-4 text-xs leading-relaxed">
            {call.transcript}
          </pre>
        )}
      </Section>

      {/* Empty-analysis fallback */}
      {!a.summary && (!a.dimensions || a.dimensions.length === 0) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-400">
          <Star className="mr-1 inline h-3.5 w-3.5" />
          Esta llamada no tiene un análisis IA completo. Probablemente sea una
          entrada legacy o el análisis falló — usar &ldquo;Re-analizar&rdquo;
          abajo.
        </div>
      )}

      {/* Feedback + re-analyze */}
      <FeedbackSection callId={call.id} />
    </div>
  );
};

export default CallDetailPage;
