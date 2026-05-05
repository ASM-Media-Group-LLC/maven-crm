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
} from "lucide-react";
import {
  useLeadFavoriteIds,
  useScouterLeads,
  useScouterCompanies,
  useToggleLeadFavorite,
  useScouterJobs,
  useEnqueueDiscoverySeed,
  useEnqueueDiscoveryHashtag,
  useCancelScouterJob,
  useScouterApifyBudget,
  type ScouterLead,
  type ScouterJob,
} from "@/hooks/useScouterLeads";
import {
  LeadDrawer,
  STATUS_META,
  VerifiedBadge,
  formatFollowers,
  initialsBg,
  scoreColor,
  countryToFlag,
} from "./leadShared";

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

interface ConsoleLine {
  id: number;
  ts: string;
  level: "ok" | "warn" | "error" | "info";
  text: string;
}

const MAX_CONSOLE_LINES = 300;

const LEVEL_COLORS: Record<ConsoleLine["level"], string> = {
  ok: "#22c55e",
  warn: "#fbbf24",
  error: "#ef4444",
  info: "#71717a",
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

  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Button + pulse container */}
      <div className="relative flex items-center justify-center">
        {/* Pulse rings — only when scanning */}
        {/* Subtle glow ring — no expanding pulse to avoid overlap */}

        <button
          type="button"
          onClick={isScanning ? undefined : onStart}
          className="relative z-10 flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            borderColor: isScanning ? "#22c55e" : "#52525b",
            backgroundColor: isScanning
              ? "rgba(34, 197, 94, 0.08)"
              : "rgba(82, 82, 91, 0.08)",
            boxShadow: isScanning
              ? "0 0 30px rgba(34, 197, 94, 0.2)"
              : "none",
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
            style={{ color: isScanning ? "#22c55e" : "#71717a" }}
          />
          <span
            className="mt-1 text-xs font-bold"
            style={{ color: isScanning ? "#22c55e" : "#a1a1aa" }}
          >
            {isScanning ? (
              <span className="flex items-center gap-0.5">
                Escaneando
                <span style={{ animation: "discover-dot 1.4s infinite 0s" }}>.</span>
                <span style={{ animation: "discover-dot 1.4s infinite 0.2s" }}>.</span>
                <span style={{ animation: "discover-dot 1.4s infinite 0.4s" }}>.</span>
              </span>
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
          lines.map((line) => (
            <div key={line.id} className="flex gap-2">
              <span className="shrink-0 text-zinc-600 select-none">{line.ts}</span>
              <span style={{ color: LEVEL_COLORS[line.level] }}>{line.text}</span>
            </div>
          ))
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
let lineCounter = 0;

function jobToConsoleLines(job: ScouterJob): ConsoleLine[] {
  const ts = new Date(job.created_at).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const lines: ConsoleLine[] = [];

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
      id: ++lineCounter,
      ts,
      level: "info",
      text: `[${kind}] encolado — ${detail}`,
    });
  } else if (job.status === "running") {
    lines.push({
      id: ++lineCounter,
      ts: job.started_at
        ? new Date(job.started_at).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : ts,
      level: "ok",
      text: `[${kind}] ejecutando… — ${detail}`,
    });
  } else if (job.status === "done") {
    lines.push({
      id: ++lineCounter,
      ts: job.completed_at
        ? new Date(job.completed_at).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : ts,
      level: "ok",
      text: `[${kind}] ✔ completado — ${detail}`,
    });
  } else if (job.status === "failed") {
    lines.push({
      id: ++lineCounter,
      ts: job.completed_at
        ? new Date(job.completed_at).toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : ts,
      level: job.last_error?.includes("Cancelado") ? "warn" : "error",
      text: `[${kind}] ✗ ${job.last_error ?? "error desconocido"}`,
    });
  }
  return lines;
}

// ─── Main component ──────────────────────────────────────────────────
const ScouterDiscover = () => {
  useEffect(() => injectStyles(), []);

  // ── State
  const [showNewSeed, setShowNewSeed] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 48;

  // ── Data hooks
  const companies = useScouterCompanies();
  const enqueueSeed = useEnqueueDiscoverySeed();
  const enqueueHashtag = useEnqueueDiscoveryHashtag();
  const cancelJob = useCancelScouterJob();
  const budget = useScouterApifyBudget();

  // Jobs — poll active jobs faster (3s) and all recent jobs for console
  const activeJobs = useScouterJobs({ status: ["queued", "running"], limit: 20, refetchInterval: 3_000 });
  const recentJobs = useScouterJobs({ limit: 50, refetchInterval: 5_000 });

  // Leads — only discovery status, approved AI, newest first
  const leads = useScouterLeads({
    status: "discovery",
    aiQuality: "approved",
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

  // ── Scan state derived from jobs
  const activeJobList = activeJobs.data ?? [];
  const runningCount = activeJobList.filter((j) => j.status === "running").length;
  const queuedCount = activeJobList.filter((j) => j.status === "queued").length;
  const scanState: ScanState =
    runningCount > 0 ? "scanning" : queuedCount > 0 ? "scanning" : "idle";

  // ── Console lines from recent jobs
  const consoleLines = useMemo(() => {
    const jobs = recentJobs.data ?? [];
    // Generate lines from jobs, most recent first (but we want oldest at top)
    const allLines: ConsoleLine[] = [];
    for (const job of [...jobs].reverse()) {
      allLines.push(...jobToConsoleLines(job));
    }
    return allLines.slice(-MAX_CONSOLE_LINES);
  }, [recentJobs.data]);

  // ── Handlers
  const handleStart = useCallback(() => {
    // Encolar automáticamente todos los tipos de búsqueda sin preguntar.
    // Por cada compañía activa: encolar sus hashtags + seeds del search_config.
    // Si ninguna tiene config, usar fallbacks.
    const companyList = companies.data ?? [];
    let enqueued = false;

    for (const company of companyList) {
      const cfg = (company as any).search_config ?? {};
      const hashtags: string[] = cfg.hashtags ?? [];
      const seeds: string[] = cfg.seed_accounts ?? [];

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

    // Fallback: si ninguna compañía tenía config, usar hashtags genéricos
    if (!enqueued) {
      const fallbackCompanyId = companyList[0]?.id ?? null;
      for (const tag of FALLBACK_HASHTAGS) {
        enqueueHashtag.mutate({
          hashtag: tag,
          company_id: fallbackCompanyId,
          maxLeads: 30,
        });
      }
    }

    // Bonus: si hay leads existentes, usar como seeds adicionales
    const existingHandles = (leads.data?.leads ?? [])
      .slice(0, 10)
      .map((l) => l.instagram_handle)
      .filter(Boolean);
    if (existingHandles.length > 0) {
      enqueueSeed.mutate({
        seeds: existingHandles,
        company_id: companyList[0]?.id ?? null,
        maxLeads: existingHandles.length,
      });
    }
  }, [companies.data, leads.data, enqueueHashtag, enqueueSeed]);

  const handleStop = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const handleStopConfirm = useCallback(async () => {
    setShowStopConfirm(false);
    // Cancel all queued + running jobs
    for (const job of activeJobList) {
      try {
        await cancelJob.mutateAsync(job.id);
      } catch {
        // ignore individual failures
      }
    }
  }, [activeJobList, cancelJob]);

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
          <DiscoverButton
            state={scanState}
            onStart={handleStart}
            onStop={handleStop}
          />
          {/* Queue stats */}
          <div className="text-center text-[11px] text-muted-foreground space-y-0.5">
            {scanState === "scanning" && (
              <div className="font-medium text-emerald-400">
                {runningCount} ejecutando · {queuedCount} en cola
              </div>
            )}
            {budgetText && (
              <div className="text-[10px]">Apify hoy: {budgetText}</div>
            )}
          </div>
          {/* Manual seed button — secondary, always visible */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowNewSeed(true)}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar semilla manual
          </Button>
        </div>

        {/* Right: Console */}
        <ScoutConsole lines={consoleLines} />
      </div>

      {/* ── Separator ── */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Recién descubiertas · Aprobadas IA
        </span>
        <div className="h-px flex-1 bg-border" />
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
    </div>
  );
};

export default ScouterDiscover;
