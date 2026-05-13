import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Search,
  Star,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  StopCircle,
  Plus,
  Hash,
  Terminal,
  Radar,
  AlertTriangle,
  Settings as SettingsIcon,
  Check,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import {
  useLeadFavoriteIds,
  useScouterLeads,
  useScouterCountries,
  useScouterCompanies,
  useToggleLeadFavorite,
  useScouterJobs,
  useEnqueueDiscoverySeed,
  useEnqueueDiscoveryHashtag,
  useCancelScouterJob,
  useScouterApifyBudget,
  useScouterAutopilot,
  useToggleScouterAutopilot,
  useSetAutopilotCompaniesFilter,
  useRecentDiscoveredLeads,
  useScouterJobCounts,
  type AiQualityFilter,
  type ScouterLead,
  type ScouterJob,
  type ConsoleLeadEvent,
} from "@/hooks/useScouterLeads";
import { supabase as sb } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  LeadDrawer,
  STATUS_META,
  STATUS_OPTIONS,
  VerifiedBadge,
  formatFollowers,
  initialsBg,
  scoreColor,
  countryToFlag,
} from "./leadShared";

// Mismas opciones de AI quality que Home — duplicadas acá para evitar
// import cruzado pesado entre rutas. Si suman opciones, tocar ambos.
const AI_QUALITY_OPTIONS: Array<{ value: AiQualityFilter; label: string }> = [
  { value: "approved", label: "✅ Aprobadas IA" },
  { value: "high_fit", label: "Solo high_fit" },
  { value: "scored", label: "Evaluadas (incluye low_fit)" },
  { value: "all", label: "Todas (sin filtro IA)" },
];

// ─── CSS Animations (injected once) ───────────────────────────────────
const DISCOVER_STYLES = `
@keyframes discover-pulse {
  0%   { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.2); opacity: 0; }
}
@keyframes discover-breathe {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.06); }
}
@keyframes discover-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes discover-dot {
  0%, 20% { opacity: 0; }
  50%     { opacity: 1; }
  100%    { opacity: 0; }
}
@keyframes discover-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0; }
}
`;

// Inject styles once
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = DISCOVER_STYLES;
  document.head.appendChild(style);
}

// ─── Types ────────────────────────────────────────────────────────────
type ScanState = "idle" | "scanning" | "paused";

// Lines have two shapes: plain (worker job events) y "lead_found" que
// pintamos rico con flag + handle + followers + score.
interface PlainLine {
  id: string;
  kind: "plain";
  tsKey: number; // epoch ms para ordenar
  ts: string;    // visible
  level: "ok" | "warn" | "error" | "info";
  text: string;
}
interface LeadFoundLine {
  id: string;
  kind: "lead_found";
  tsKey: number;
  ts: string;
  handle: string;
  name: string | null;
  country: string | null;
  flag: string;
  followers: number | null;
  aiScore: number | null;
  aiStatus: string | null;
  companySlug: string | null;
}
type ConsoleLine = PlainLine | LeadFoundLine;

const MAX_CONSOLE_LINES = 300;

const LEVEL_COLORS: Record<PlainLine["level"], string> = {
  ok: "#22c55e",
  warn: "#fbbf24",
  error: "#ef4444",
  info: "#71717a",
};

// Colores por ai_status para el chip de score en las líneas de lead.
const AI_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  high_fit: { bg: "rgba(16, 185, 129, 0.18)", text: "#34d399" },
  medium_fit: { bg: "rgba(245, 158, 11, 0.18)", text: "#fbbf24" },
  low_fit: { bg: "rgba(239, 68, 68, 0.18)", text: "#f87171" },
  approved: { bg: "rgba(16, 185, 129, 0.18)", text: "#34d399" },
};

// ─── Fallback hashtags (si ninguna compañía tiene search_config) ──────
const FALLBACK_HASHTAGS = [
  "onlyfansmodel",
  "contentcreator",
  "fansly",
  "linkinbio",
  "exclusivecontent",
];

// ─── DiscoverButton ──────────────────────────────────────────────────
const DiscoverButton = ({
  state,
  onStart,
  onStop,
}: {
  state: ScanState;
  onStart: () => void;
  onStop: () => void;
}) => {
  const isScanning = state === "scanning";
  const isPaused = state === "paused";

  // Colores y label varían: scanning = verde activo, paused = amber
  // (budget out), idle = gris.
  const tone = isScanning
    ? { border: "#22c55e", bg: "rgba(34, 197, 94, 0.08)", glow: "0 0 30px rgba(34, 197, 94, 0.2)", text: "#22c55e", icon: "#22c55e" }
    : isPaused
      ? { border: "#fbbf24", bg: "rgba(251, 191, 36, 0.08)", glow: "0 0 24px rgba(251, 191, 36, 0.15)", text: "#fbbf24", icon: "#fbbf24" }
      : { border: "#52525b", bg: "rgba(82, 82, 91, 0.08)", glow: "none", text: "#a1a1aa", icon: "#71717a" };

  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Button + pulse container */}
      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={isScanning ? undefined : onStart}
          className="relative z-10 flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            borderColor: tone.border,
            backgroundColor: tone.bg,
            boxShadow: tone.glow,
            animation: isScanning ? "discover-breathe 2s ease-in-out infinite" : "none",
            cursor: isScanning ? "default" : "pointer",
          }}
        >
          {/* Radar sweep overlay — only when scanning */}
          {isScanning && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.15) 60deg, transparent 120deg)",
                animation: "discover-spin 3s linear infinite",
              }}
            />
          )}

          <Radar
            className="h-6 w-6"
            style={{ color: tone.icon }}
          />
          <span
            className="mt-1 text-xs font-bold"
            style={{ color: tone.text }}
          >
            {isScanning ? (
              <span className="flex items-center gap-0.5">
                Escaneando
                <span style={{ animation: "discover-dot 1.4s infinite 0s" }}>.</span>
                <span style={{ animation: "discover-dot 1.4s infinite 0.2s" }}>.</span>
                <span style={{ animation: "discover-dot 1.4s infinite 0.4s" }}>.</span>
              </span>
            ) : isPaused ? (
              "Reanudar"
            ) : (
              "Descubrir"
            )}
          </span>
        </button>
      </div>

      {/* Stop button — only visible when scanning */}
      {isScanning && (
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-400/10 px-4 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/20"
        >
          <StopCircle className="h-3.5 w-3.5" />
          Detener
        </button>
      )}
    </div>
  );
};

// Renderer rico para el evento "lead encontrado" — flag + handle bold
// + followers + chip de ai_status. Click al handle abre IG en otra
// pestaña. Compacto pero más vivo que una línea plain con texto.
const LeadFoundRow = ({ line }: { line: LeadFoundLine }) => {
  const aiCfg = line.aiStatus ? AI_STATUS_COLORS[line.aiStatus] : null;
  return (
    <div className="flex items-center gap-2 group">
      <span className="shrink-0 text-zinc-600 select-none tabular-nums">{line.ts}</span>
      <span className="text-emerald-400 select-none">✓</span>
      <span className="shrink-0">{line.flag}</span>
      <a
        href={`https://www.instagram.com/${line.handle}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-white font-semibold hover:text-emerald-300 truncate"
      >
        @{line.handle}
      </a>
      {line.followers != null && (
        <span className="text-zinc-500 tabular-nums shrink-0">
          {formatFollowers(line.followers)}
        </span>
      )}
      {line.country && (
        <span className="text-zinc-500 truncate hidden md:inline">· {line.country}</span>
      )}
      {line.companySlug && (
        <span className="text-violet-400/80 truncate hidden md:inline">
          · {line.companySlug}
        </span>
      )}
      {line.aiScore != null && aiCfg && (
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums shrink-0"
          style={{ background: aiCfg.bg, color: aiCfg.text }}
        >
          {line.aiScore.toFixed(1)}
        </span>
      )}
    </div>
  );
};

// ─── ScoutConsole ────────────────────────────────────────────────────
const ScoutConsole = ({ lines }: { lines: ConsoleLine[] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScroll = useRef(true);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isAutoScroll.current) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  // Detect user scroll (if they scroll up, stop auto-scroll)
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    isAutoScroll.current = atBottom;
  }, []);

  return (
    <div className="rounded-xl border border-border bg-[#0a0a0a] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-xs font-semibold text-emerald-400/90">Scout Console</span>
        <span className="text-[10px] text-zinc-500 ml-auto tabular-nums">
          {lines.length} líneas
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[280px] min-h-[160px] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-[1.6]"
      >
        {lines.length === 0 ? (
          <div className="flex items-center gap-1.5 text-zinc-600 py-4">
            <span
              className="inline-block h-2 w-2 rounded-full bg-zinc-600"
              style={{ animation: "discover-blink 1s step-end infinite" }}
            />
            Esperando actividad del worker…
          </div>
        ) : (
          lines.map((line) =>
            line.kind === "plain" ? (
              <div key={line.id} className="flex gap-2">
                <span className="shrink-0 text-zinc-600 select-none">{line.ts}</span>
                <span style={{ color: LEVEL_COLORS[line.level] }}>{line.text}</span>
              </div>
            ) : (
              <LeadFoundRow key={line.id} line={line} />
            ),
          )
        )}
      </div>
    </div>
  );
};

// ─── StopConfirmModal ────────────────────────────────────────────────
const StopConfirmModal = ({
  open,
  onCancel,
  onConfirm,
  runningCount,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  runningCount: number;
}) => (
  <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Detener escaneo
        </DialogTitle>
        <DialogDescription>
          {runningCount > 0
            ? `Hay ${runningCount} job${runningCount > 1 ? "s" : ""} en curso. ¿Cancelar todos?`
            : "¿Detener el escaneo? Los jobs encolados se cancelarán."}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter className="gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Volver
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          <StopCircle className="h-4 w-4 mr-1.5" />
          Detener
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── NewSeedModal ────────────────────────────────────────────────────
const NewSeedModal = ({
  open,
  onClose,
  companies,
  onSubmitSeed,
  onSubmitHashtag,
}: {
  open: boolean;
  onClose: () => void;
  companies: Array<{ id: string; slug: string; name: string }>;
  onSubmitSeed: (seeds: string[], companyId: string | null) => void;
  onSubmitHashtag: (hashtag: string, companyId: string | null) => void;
}) => {
  const [mode, setMode] = useState<"seed" | "hashtag">("seed");
  const [input, setInput] = useState("");
  const [companyId, setCompanyId] = useState<string>("none");

  const handleSubmit = () => {
    const cId = companyId === "none" ? null : companyId;
    if (mode === "seed") {
      const seeds = input
        .split(/[\n,]+/)
        .map((s) => s.trim().replace(/^@/, ""))
        .filter(Boolean);
      if (seeds.length === 0) return;
      onSubmitSeed(seeds, cId);
    } else {
      const tag = input.trim().replace(/^#/, "");
      if (!tag) return;
      onSubmitHashtag(tag, cId);
    }
    setInput("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo escaneo</DialogTitle>
          <DialogDescription>
            Agrega semillas (handles IG) o un hashtag para que el bot descubra perfiles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "seed" ? "default" : "ghost"}
              onClick={() => setMode("seed")}
              className="gap-1.5"
            >
              <Search className="h-3.5 w-3.5" />
              Semillas
            </Button>
            <Button
              size="sm"
              variant={mode === "hashtag" ? "default" : "ghost"}
              onClick={() => setMode("hashtag")}
              className="gap-1.5"
            >
              <Hash className="h-3.5 w-3.5" />
              Hashtag
            </Button>
          </div>
          {mode === "seed" ? (
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={"@handle1\n@handle2\n@handle3"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          ) : (
            <Input
              placeholder="#hashtag"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          )}
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Compañía (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin compañía</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            <Plus className="h-4 w-4 mr-1.5" />
            Encolar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─── Lead card (compact, reused from ScouterHome) ───────────────────
const LeadCard = ({
  lead,
  isFavorite,
  companySlug,
  onClick,
  onToggleFavorite,
}: {
  lead: ScouterLead;
  isFavorite: boolean;
  companySlug?: string;
  onClick: () => void;
  onToggleFavorite: () => void;
}) => {
  const statusCfg = STATUS_META[lead.status] ?? STATUS_META.discovery;
  const initial = (
    lead.name?.trim().charAt(0) ||
    lead.instagram_handle.charAt(0) ||
    "?"
  ).toUpperCase();
  const aiScore = lead.ai_score;
  const sc = scoreColor(aiScore);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:scale-[1.02] hover:border-primary/40"
    >
      <div
        className="relative w-full"
        style={{ aspectRatio: "1 / 1", background: initialsBg(lead.instagram_handle) }}
      >
        {lead.photo_data_url ? (
          <img
            src={lead.photo_data_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="block h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-bold uppercase text-white/90"
            style={{ fontSize: "clamp(36px, 6vw, 56px)", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
          >
            {initial}
          </div>
        )}
        <span
          className="absolute left-2 top-2 block h-[10px] w-[10px] rounded-full ring-1 ring-black/40"
          style={{ background: statusCfg.dot, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}
          title={statusCfg.label}
        />
        {lead.verified && (
          <span className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55">
            <VerifiedBadge size={14} />
          </span>
        )}
        {lead.category && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-sm">
            {lead.category}
          </span>
        )}
        <span
          role="button"
          tabIndex={0}
          aria-label={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }
          }}
          className="absolute bottom-1.5 right-1.5 flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-full bg-black/55 transition-transform hover:scale-110"
        >
          <Star
            className="h-3.5 w-3.5"
            fill={isFavorite ? "rgb(251 191 36)" : "transparent"}
            stroke={isFavorite ? "rgb(251 191 36)" : "rgba(255,255,255,0.85)"}
            strokeWidth={2}
          />
        </span>
      </div>
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">@{lead.instagram_handle}</span>
          </span>
          {aiScore != null && (
            <span className="shrink-0 text-[13px] font-extrabold tabular-nums" style={{ color: sc }}>
              {aiScore.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">
            {[lead.country, lead.city].filter(Boolean).join(" · ") || "—"}
          </span>
          <span className="shrink-0 tabular-nums">
            {countryToFlag(lead.country)} {formatFollowers(lead.followers)}
          </span>
        </div>
        {companySlug && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            <span className="rounded-full border border-amber-400/60 px-1.5 py-0 text-[8px] font-bold uppercase text-amber-400">
              {companySlug}
            </span>
          </div>
        )}
      </div>
      <div className="w-full h-[3px] bg-muted/20 mt-auto">
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.min((aiScore ?? 0) * 10, 100)}%`,
            backgroundColor: sc,
          }}
        />
      </div>
    </button>
  );
};

// ─── Pagination ─────────────────────────────────────────────────────
const Pagination = ({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) => {
  if (totalPages <= 1) return null;
  const windowSize = 10;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  const btn =
    "h-8 w-8 rounded-md border text-xs font-medium tabular-nums inline-flex items-center justify-center transition-colors disabled:opacity-40";
  const activeClass = "border-amber-400 bg-amber-400/15 text-amber-400";

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page === 1} onClick={() => onPageChange(1)}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`${btn} ${p === page ? activeClass : "hover:bg-muted"}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button type="button" className={btn} disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </span>
    </div>
  );
};

// ─── Helper: jobs → console lines ────────────────────────────────────
const fmtTs = (iso: string): string =>
  new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function jobToConsoleLines(job: ScouterJob): PlainLine[] {
  const ts = fmtTs(job.created_at);
  const tsKey = new Date(job.created_at).getTime();
  const lines: PlainLine[] = [];

  const kind =
    job.kind === "discover_seed"
      ? "seed"
      : job.kind === "discover_hashtag"
        ? "hashtag"
        : job.kind === "score_lead"
          ? "score"
          : job.kind;

  const payload = job.payload ?? {};
  const detail =
    job.kind === "discover_seed"
      ? `seeds=[${((payload.seeds as string[]) ?? []).slice(0, 3).join(", ")}${((payload.seeds as string[]) ?? []).length > 3 ? "…" : ""}]`
      : job.kind === "discover_hashtag"
        ? `#${payload.hashtag ?? "?"}`
        : job.kind === "score_lead"
          ? `lead=${(payload.leadId as string)?.slice(0, 8) ?? "?"}…`
          : JSON.stringify(payload).slice(0, 60);

  if (job.status === "queued") {
    lines.push({
      id: `job-${job.id}-queued`,
      kind: "plain",
      tsKey,
      ts,
      level: "info",
      text: `[${kind}] encolado — ${detail}`,
    });
  } else if (job.status === "running") {
    const startTs = job.started_at ?? job.created_at;
    lines.push({
      id: `job-${job.id}-running`,
      kind: "plain",
      tsKey: new Date(startTs).getTime(),
      ts: fmtTs(startTs),
      level: "ok",
      text: `[${kind}] ejecutando… — ${detail}`,
    });
  } else if (job.status === "done") {
    const endTs = job.completed_at ?? job.created_at;
    lines.push({
      id: `job-${job.id}-done`,
      kind: "plain",
      tsKey: new Date(endTs).getTime(),
      ts: fmtTs(endTs),
      level: "ok",
      text: `[${kind}] ✔ completado — ${detail}`,
    });
  } else if (job.status === "failed") {
    const endTs = job.completed_at ?? job.created_at;
    lines.push({
      id: `job-${job.id}-failed`,
      kind: "plain",
      tsKey: new Date(endTs).getTime(),
      ts: fmtTs(endTs),
      level: job.last_error?.includes("Cancelado") ? "warn" : "error",
      text: `[${kind}] ✗ ${job.last_error ?? "error desconocido"}`,
    });
  }
  return lines;
}

// Convierte un lead recientemente descubierto en una línea LeadFoundLine
// para la consola. Usa la heurística de bandera del país canónico.
function leadToConsoleLine(
  lead: ConsoleLeadEvent,
  companySlug: string | null,
): LeadFoundLine {
  return {
    id: `lead-${lead.id}`,
    kind: "lead_found",
    tsKey: new Date(lead.created_at).getTime(),
    ts: fmtTs(lead.created_at),
    handle: lead.instagram_handle,
    name: lead.name,
    country: lead.country,
    flag: countryToFlag(lead.country),
    followers: lead.followers,
    aiScore: lead.ai_score,
    aiStatus: lead.ai_status,
    companySlug,
  };
}

// ─── Main component ──────────────────────────────────────────────────
const ScouterDiscover = () => {
  useEffect(() => injectStyles(), []);
  const navigate = useNavigate();

  // ── State
  const [showNewSeed, setShowNewSeed] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  // Picker de compañías sobre las que correr el discovery. "all" =
  // todas las activas (comportamiento original). Persistido en
  // localStorage para que el setting no se resetee al recargar.
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[] | "all">(
    () => {
      try {
        const raw = window.localStorage.getItem("maven.scouter.discoveryScope");
        if (raw === "all" || raw === null) return "all";
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : "all";
      } catch {
        return "all";
      }
    },
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "maven.scouter.discoveryScope",
        selectedCompanyIds === "all" ? "all" : JSON.stringify(selectedCompanyIds),
      );
    } catch {
      /* no-op */
    }
    // Persisto también el scope en scouter_autopilot — el RPC del
    // autopilot lo lee y filtra las compañías a encolar. Antes vivía
    // solo en localStorage y el trigger encolaba para TODAS las
    // compañías activas del tenant, ignorando el picker.
    setAutopilotFilter.mutate(
      selectedCompanyIds === "all" ? null : (selectedCompanyIds as string[]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyIds]);
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 48;

  // ── Filtros de la grid (mismos que Home pero el sort siempre es
  //    created_at DESC — orden de descubrimiento, lo que el user vio
  //    primero arriba). Status default "discovery" (lo que el bot acaba
  //    de traer y aún no fue tocado por nadie); AI quality "approved"
  //    para mostrar leads buenos. El user puede aflojar a "all" para
  //    ver TODO incluyendo low_fit y unscored.
  const [statusFilter, setStatusFilter] = useState<string>("discovery");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [aiQuality, setAiQuality] = useState<AiQualityFilter>("approved");
  const [search, setSearch] = useState("");

  // Reset page cuando cambian filtros
  useEffect(() => {
    setPage(1);
  }, [statusFilter, companyFilter, countryFilter, aiQuality, search]);

  // ── Data hooks
  const companies = useScouterCompanies();
  const enqueueSeed = useEnqueueDiscoverySeed();
  const enqueueHashtag = useEnqueueDiscoveryHashtag();
  const cancelJob = useCancelScouterJob();
  const budget = useScouterApifyBudget();
  const { isAdmin, isManager } = useUserRole();
  // El toggle del autopilot pausa el Scouter para TODO el CRM, no por
  // user. Lo ocultamos a roles operativos (closer, spammer, LLG, etc) —
  // solo admin/manager pueden activar/desactivar. Backend tiene RLS
  // que enforcea esto a nivel DB también (defensa en profundidad).
  const canControlAutopilot = isAdmin || isManager;
  const autopilot = useScouterAutopilot();
  const toggleAutopilot = useToggleScouterAutopilot();
  const setAutopilotFilter = useSetAutopilotCompaniesFilter();
  const recentLeads = useRecentDiscoveredLeads(40);

  // Jobs — usamos useScouterJobs solo para la consola (slice 50 más
  // recientes). Para el contador "X ejecutando · Y en cola" usamos
  // useScouterJobCounts que devuelve el número exacto sin traer rows.
  // Antes el contador estaba limitado a 20 jobs y mentía cuando la
  // cola real era mayor.
  const activeJobs = useScouterJobs({ status: ["queued", "running"], limit: 50, refetchInterval: 3_000 });
  const recentJobs = useScouterJobs({ limit: 50, refetchInterval: 5_000 });
  const jobCounts = useScouterJobCounts();

  // Companies + slug del seleccionado (para que el filtro matchee
  // también target_companies, no solo company_id de discovery).
  const activeCompanySlug =
    companyFilter !== "all"
      ? companies.data?.find((c) => c.id === companyFilter)?.slug
      : undefined;

  // Países dinámicos respetando los otros filtros (igual que Home).
  const countriesQ = useScouterCountries({
    status: statusFilter,
    aiQuality,
  });

  // Leads — sort por created_at DESC (orden de descubrimiento) siempre.
  // Filtros: si están en "all" no se aplican.
  const leads = useScouterLeads({
    status: statusFilter,
    search,
    company: companyFilter !== "all" ? companyFilter : undefined,
    companySlug: activeCompanySlug,
    country: countryFilter !== "all" ? countryFilter : undefined,
    aiQuality,
    page,
    pageSize,
  });

  const favoriteIdsQ = useLeadFavoriteIds();
  const favoriteIds = favoriteIdsQ.data ?? new Set<string>();
  const toggleFavorite = useToggleLeadFavorite();

  const result = leads.data ?? { leads: [], total: 0 };
  const visibleLeads = result.leads;
  const totalLeads = result.total;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));

  // Company map for badges
  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies.data ?? []) map.set(c.id, c.slug);
    return map;
  }, [companies.data]);

  // ── Scan state — usa el count exacto del DB para que el contador no
  //    mienta cuando la cola supera el limit del fetch. Counts vienen
  //    de useScouterJobCounts (head + exact, sin traer rows).
  const activeJobList = activeJobs.data ?? [];
  const runningCount = jobCounts.data?.running ?? 0;
  const queuedCount = jobCounts.data?.queued ?? 0;
  const queuedByKind = jobCounts.data?.queuedByKind ?? { discover: 0, score: 0, enrich: 0 };
  const autopilotActive = autopilot.data?.active ?? true;
  const autopilotPaused = autopilot.data?.paused_reason === "budget";
  const scanState: ScanState =
    runningCount > 0 || queuedCount > 0
      ? "scanning"
      : autopilotActive && !autopilotPaused
        ? "scanning"
        : autopilotPaused
          ? "paused"
          : "idle";

  // ── Console lines — mergeo jobs + leads encontrados, ordenados por
  // timestamp ascendente (oldest at top, newest at bottom — natural
  // log feel).
  const consoleLines = useMemo(() => {
    const lines: ConsoleLine[] = [];
    const jobs = recentJobs.data ?? [];
    for (const job of jobs) lines.push(...jobToConsoleLines(job));
    const leads = recentLeads.data ?? [];
    for (const lead of leads) {
      const slug = lead.company_id ? companyMap.get(lead.company_id) ?? null : null;
      lines.push(leadToConsoleLine(lead, slug));
    }
    lines.sort((a, b) => a.tsKey - b.tsKey);
    return lines.slice(-MAX_CONSOLE_LINES);
  }, [recentJobs.data, recentLeads.data, companyMap]);

  // ── Handlers
  const handleStart = useCallback(() => {
    // Click manual al botón → siempre activamos autopilot. La intención
    // del user es "arrancar el bot". Si ya estaba activo, lo refrescamos
    // (limpia paused_reason si lo había) y disparamos un batch. Si ya
    // hay jobs activos, sigue corriendo y el trigger encadena el resto.
    toggleAutopilot.mutate(true);
    // Encolar búsquedas para las compañías seleccionadas. El scope:
    //   · selectedCompanyIds === "all" → todas las compañías activas;
    //     además corremos el pool global pick_discovery_seeds porque la
    //     intención es "buscar lo más amplio posible".
    //   · lista específica → SOLO las elegidas. NO mezclamos con el pool
    //     global (el user quiere búsqueda dirigida por seeds de esa
    //     compañía). Si ninguna de las elegidas tiene seeds ni hashtags,
    //     mostramos alerta clara con CTA hacia Settings.
    const allCompanies = companies.data ?? [];
    const isAllScope = selectedCompanyIds === "all";
    const companyList = isAllScope
      ? allCompanies
      : allCompanies.filter((c) => selectedCompanyIds.includes(c.id));

    // Detectamos compañías sin config — para la alerta cuando el user
    // elige específicas. Almacenamos los nombres para mostrarlos.
    const companiesWithoutConfig: string[] = [];
    let enqueued = false;

    for (const company of companyList) {
      const cfg = (company as any).search_config ?? {};
      const hashtags: string[] = cfg.hashtags ?? [];
      const seeds: string[] = cfg.seed_accounts ?? [];

      if (hashtags.length === 0 && seeds.length === 0) {
        companiesWithoutConfig.push(company.name ?? "(sin nombre)");
        continue;
      }

      // Hashtag jobs por compañía
      for (const tag of hashtags) {
        enqueueHashtag.mutate({
          hashtag: tag.replace(/^#/, ""),
          company_id: company.id,
          maxLeads: 30,
        });
        enqueued = true;
      }

      // Seed jobs por compañía
      if (seeds.length > 0) {
        enqueueSeed.mutate({
          seeds: seeds.map((s) => s.replace(/^@/, "")),
          company_id: company.id,
          maxLeads: seeds.length,
        });
        enqueued = true;
      }
    }

    // Caso búsqueda dirigida (scope específico) y NINGUNA tenía config:
    // alerta clara con CTA hacia Settings — no corremos fallback genérico
    // porque eso traería leads random no alineados con la(s) compañía(s).
    if (!isAllScope && !enqueued && companyList.length > 0) {
      const names = companiesWithoutConfig.join(", ");
      toast.error("Las compañías elegidas no tienen seeds ni hashtags configurados", {
        description: `${names} — agregá al menos un @handle o #hashtag en Settings → Compañías → Editar.`,
        action: {
          label: "Abrir Settings",
          onClick: () => navigate("/scouter/settings?sub=companies"),
        },
        duration: 10_000,
      });
      return;
    }

    // Si una compañía específica corrió pero otras no tenían config,
    // damos un warning informativo (no bloqueante).
    if (!isAllScope && enqueued && companiesWithoutConfig.length > 0) {
      toast.warning(
        `Algunas compañías no se buscaron por falta de config: ${companiesWithoutConfig.join(", ")}`,
        { duration: 7_000 },
      );
    }

    // Fallback scope="all" sin ninguna config en ninguna compañía:
    // hashtags genéricos para arrancar.
    if (isAllScope && !enqueued) {
      const fallbackCompanyId = companyList[0]?.id ?? null;
      for (const tag of FALLBACK_HASHTAGS) {
        enqueueHashtag.mutate({
          hashtag: tag,
          company_id: fallbackCompanyId,
          maxLeads: 30,
        });
      }
    }

    // Weighted seed pool global — SOLO en scope "all". RPC
    // pick_discovery_seeds devuelve ~30 handles distribuidos: 50%
    // creators firmadas, 30% leadgen quality A/A+, 20% scouter_leads
    // validadas. Cuando el user elige compañías específicas, NO usamos
    // este pool porque traería seeds de otras compañías y rompe la
    // búsqueda dirigida que pidió.
    if (isAllScope) {
      void (async () => {
        const { data: seedRows, error: seedErr } = await sb.rpc(
          "pick_discovery_seeds",
          { p_total: 30 },
        );
        if (seedErr) {
          console.warn("pick_discovery_seeds error", seedErr.message);
          return;
        }
        const handles = ((seedRows ?? []) as Array<{ out_handle: string }>)
          .map((r) => r.out_handle)
          .filter(Boolean);
        if (handles.length === 0) return;
        enqueueSeed.mutate({
          seeds: handles,
          company_id: companyList[0]?.id ?? null,
          maxLeads: handles.length,
        });
      })();
    }
  }, [companies.data, enqueueHashtag, enqueueSeed, selectedCompanyIds, navigate]);

  const handleStop = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const handleStopConfirm = useCallback(async () => {
    setShowStopConfirm(false);
    // Apaga el autopilot ANTES de cancelar — sino cuando el último job
    // se cancela, el trigger podría re-encolar.
    toggleAutopilot.mutate(false);
    // Cancel all queued + running jobs
    for (const job of activeJobList) {
      try {
        await cancelJob.mutateAsync(job.id);
      } catch {
        // ignore individual failures
      }
    }
  }, [activeJobList, cancelJob, toggleAutopilot]);

  const handleSubmitSeed = useCallback(
    (seeds: string[], companyId: string | null) => {
      enqueueSeed.mutate({
        seeds,
        company_id: companyId,
        maxLeads: seeds.length,
      });
    },
    [enqueueSeed],
  );

  const handleSubmitHashtag = useCallback(
    (hashtag: string, companyId: string | null) => {
      enqueueHashtag.mutate({
        hashtag,
        company_id: companyId,
        maxLeads: 30,
      });
    },
    [enqueueHashtag],
  );

  // Budget display
  const budgetRow = budget.data;
  const budgetText = budgetRow
    ? `$${budgetRow.est_spend_usd.toFixed(2)} · ${budgetRow.runs_count} runs · ${budgetRow.items_processed} items`
    : null;

  return (
    <div className="space-y-6">
      {/* ── Header: Discover Button + Console ── */}
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        {/* Left: button + stats */}
        <div className="flex flex-col items-center gap-3">
          {canControlAutopilot && (
            <DiscoverButton
              state={scanState}
              onStart={handleStart}
              onStop={handleStop}
            />
          )}
          {/* Queue stats + autopilot status */}
          <div className="text-center text-[11px] text-muted-foreground space-y-0.5">
            {(runningCount > 0 || queuedCount > 0) && (
              <div className="font-medium text-emerald-400">
                {runningCount} ejecutando · {queuedCount} en cola
                {queuedCount > 0 && (
                  <div className="text-[10px] opacity-75 mt-0.5">
                    {queuedByKind.discover > 0 && `${queuedByKind.discover} discover`}
                    {queuedByKind.score > 0 && (queuedByKind.discover > 0 ? " · " : "") + `${queuedByKind.score} score`}
                    {queuedByKind.enrich > 0 && ((queuedByKind.discover > 0 || queuedByKind.score > 0) ? " · " : "") + `${queuedByKind.enrich} enrich`}
                  </div>
                )}
              </div>
            )}
            {autopilotActive && !autopilotPaused && runningCount === 0 && queuedCount === 0 && (
              <div className="text-emerald-400/80">
                Autopilot activo · esperando próxima ronda
              </div>
            )}
            {autopilotPaused && (
              <div className="text-amber-400">
                Autopilot pausado: budget agotado, vuelve mañana
              </div>
            )}
            {budgetText && (
              <div className="text-[10px]">Apify hoy: {budgetText}</div>
            )}
          </div>
          {/* Picker de compañías — reemplaza el botón "Agregar semilla
              manual" anterior. El user decide para cuáles compañías
              correr el discovery (o todas). El setting persiste en
              localStorage. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCompanyPicker(true)}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            Compañías ({selectedCompanyIds === "all"
              ? "todas"
              : `${selectedCompanyIds.length}`})
          </Button>
        </div>

        {/* Right: Console */}
        <ScoutConsole lines={consoleLines} />
      </div>

      {/* ── Separator ── */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recién descubiertas
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* ── Filtros (mismos que Home) — el sort sigue siendo por
          orden de descubrimiento (created_at DESC). Los filtros solo
          acotan qué se ve. ── */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect
          value={companyFilter}
          onValueChange={setCompanyFilter}
          placeholder="Compañía"
          searchPlaceholder="Buscar compañía…"
          triggerClassName="w-[180px] h-9 text-xs"
          options={[
            { value: "all", label: `Todas (${companies.data?.length ?? 0})` },
            ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <SearchableSelect
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="Status"
          searchPlaceholder="Buscar status…"
          triggerClassName="w-[160px] h-9 text-xs"
          options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        <SearchableSelect
          value={countryFilter}
          onValueChange={setCountryFilter}
          placeholder="País"
          searchPlaceholder="Buscar país…"
          triggerClassName="w-[180px] h-9 text-xs"
          options={[
            { value: "all", label: "Todos los países" },
            ...(countriesQ.data ?? []).map((c) => ({
              value: c.country,
              label: `${countryToFlag(c.country)} ${c.country} (${c.count})`,
              searchAdditional: c.country,
            })),
          ]}
        />

        <SearchableSelect
          value={aiQuality}
          onValueChange={(v) => setAiQuality(v as AiQualityFilter)}
          placeholder="Calidad IA"
          searchPlaceholder="Buscar calidad…"
          triggerClassName="w-[220px] h-9 text-xs"
          options={AI_QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por handle, nombre, país…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {leads.isLoading
            ? "Cargando…"
            : `${totalLeads} lead${totalLeads === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* ── Recently discovered leads grid ── */}
      {leads.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm font-medium">Sin descubrimientos recientes</p>
          <p className="text-xs text-muted-foreground">
            Cuando el bot descubra cuentas IG y la IA las apruebe, aparecerán aquí.
            Presioná "Nueva semilla" o "Descubrir" para comenzar.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {visibleLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isFavorite={favoriteIds.has(lead.id)}
                companySlug={companyMap.get(lead.company_id)}
                onClick={() => {
                  setSelected(lead);
                  setDrawerOpen(true);
                }}
                onToggleFavorite={() =>
                  toggleFavorite.mutate({
                    leadId: lead.id,
                    isFavorite: favoriteIds.has(lead.id),
                  })
                }
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* ── Modals ── */}
      <LeadDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
      <NewSeedModal
        open={showNewSeed}
        onClose={() => setShowNewSeed(false)}
        companies={(companies.data ?? []).map((c) => ({ id: c.id, slug: c.slug, name: c.name }))}
        onSubmitSeed={handleSubmitSeed}
        onSubmitHashtag={handleSubmitHashtag}
      />
      <StopConfirmModal
        open={showStopConfirm}
        onCancel={() => setShowStopConfirm(false)}
        onConfirm={handleStopConfirm}
        runningCount={runningCount}
      />
      <CompanyPickerModal
        open={showCompanyPicker}
        onClose={() => setShowCompanyPicker(false)}
        companies={(companies.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
        selected={selectedCompanyIds}
        onChange={setSelectedCompanyIds}
      />
    </div>
  );
};

// ─── Company picker modal ─────────────────────────────────────────────
// Reemplaza el botón "Agregar semilla manual" del header de búsquedas.
// El user marca para qué compañías quiere que corra el scouter (o todas).
// El scope persiste en localStorage del componente padre.
const CompanyPickerModal = ({
  open,
  onClose,
  companies,
  selected,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  companies: Array<{ id: string; name: string }>;
  selected: string[] | "all";
  onChange: (next: string[] | "all") => void;
}) => {
  const allMode = selected === "all";
  // Cuando estamos en allMode, internamente todas las compañías están
  // marcadas — el set tiene que reflejarlo para que los checkmarks
  // individuales se vean activos en la UI.
  const set = allMode
    ? new Set(companies.map((c) => c.id))
    : new Set(selected as string[]);

  const toggle = (id: string) => {
    if (allMode) {
      // Click en una compañía estando en "Todas" → la intuición es
      // "elegir solo esta", no "todas excepto esta". El user lo
      // confirmó: "si selecciono una sola, me muestra todas menos la
      // que quise seleccionar".
      onChange([id]);
      return;
    }
    const arr = selected as string[];
    if (arr.includes(id)) {
      const next = arr.filter((x) => x !== id);
      // Si quedó vacío, volvemos a "all" (sino el bot no busca nada).
      onChange(next.length === 0 ? "all" : next);
    } else {
      const next = [...arr, id];
      // Si quedaron TODAS marcadas, volvemos al modo "all" canónico
      if (next.length === companies.length) onChange("all");
      else onChange(next);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Compañías para el discovery</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">
          Tickeá las compañías para las que querés que el scouter corra
          búsquedas. Si dejás "Todas" marcado, corre para todas las activas.
        </p>
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => onChange("all")}
            className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
              allMode
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/40"
            }`}
          >
            <span className="font-semibold">Todas las compañías</span>
            {allMode && <Check className="h-4 w-4 text-primary" />}
          </button>
          <div className="h-px bg-border/40 my-1" />
          {companies.map((c) => {
            const isOn = set.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  isOn
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <span>{c.name}</span>
                {isOn && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScouterDiscover;
