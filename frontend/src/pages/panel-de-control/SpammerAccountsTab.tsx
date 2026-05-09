import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  UserCog,
  Users as UsersIcon,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SpammerAccount,
  type SpammerAccountAiAnalysis,
  type SpammerAccountAiRedFlag,
  useRescanSpammerAccount,
  useSpammerAccounts,
} from "@/hooks/useSpammerAccounts";
import { useTenantProfiles } from "@/hooks/useAgencyQa";
import { toast } from "sonner";

// SpammerAccountsTab — vista del manager: lista de cuentas de IG que
// los spammers/scouters registraron, agrupadas por handle (cuando
// varios usan la misma cuenta, se muestra UNA card con la lista de
// closers que la operan). Cada card es clickeable y abre un popup
// con el análisis IA completo de credibilidad de agencia.

interface AggregatedAccount {
  // Datos agregados por handle (la representante es la fila más
  // reciente con scan completo, o cualquier una si ninguna scaneó).
  representative: SpammerAccount;
  // Lista de scouters / spammers que usan esta cuenta (deduplicada
  // por nombre).
  operators: Array<{ id: string; name: string }>;
  rowCount: number;
}

const SCORE_BUCKETS: Array<{
  label: string;
  test: (score: number) => boolean;
  bg: string;
  ring: string;
  text: string;
}> = [
  { label: "Alto", test: (s) => s >= 80, bg: "bg-emerald-500/15", ring: "ring-emerald-500/40", text: "text-emerald-400" },
  { label: "Bueno", test: (s) => s >= 65, bg: "bg-sky-500/15", ring: "ring-sky-500/40", text: "text-sky-400" },
  { label: "Medio", test: (s) => s >= 45, bg: "bg-amber-500/15", ring: "ring-amber-500/40", text: "text-amber-400" },
  { label: "Bajo", test: (s) => s >= 25, bg: "bg-orange-500/15", ring: "ring-orange-500/40", text: "text-orange-400" },
  { label: "Muy bajo", test: (_s) => true, bg: "bg-rose-500/15", ring: "ring-rose-500/40", text: "text-rose-400" },
];

const scoreCfg = (score: number | null) => {
  if (score == null) return { label: "Sin scan", bg: "bg-muted/40", ring: "ring-border", text: "text-muted-foreground" };
  return SCORE_BUCKETS.find((b) => b.test(score))!;
};

const fmtCount = (n: number | null | undefined): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("es");
};

const SpammerAccountsTab = () => {
  const accountsQ = useSpammerAccounts();
  const profilesQ = useTenantProfiles();
  const rescan = useRescanSpammerAccount();
  const [search, setSearch] = useState("");
  const [openHandle, setOpenHandle] = useState<string | null>(null);
  const [filterPending, setFilterPending] = useState(false);
  const [filterFailed, setFilterFailed] = useState(false);

  // Agrupar por handle — cuando varios spammers usan la misma cuenta,
  // se muestra UNA sola card con la lista de operators (los user_id
  // de la fila se resuelven contra profiles.full_name).
  const aggregated = useMemo<AggregatedAccount[]>(() => {
    const list = accountsQ.data ?? [];
    const profileNameById = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p) => {
      if (p.full_name) profileNameById.set(p.id, p.full_name);
    });
    const byHandle = new Map<string, SpammerAccount[]>();
    list.forEach((a) => {
      const arr = byHandle.get(a.instagram_handle) ?? [];
      arr.push(a);
      byHandle.set(a.instagram_handle, arr);
    });
    const aggArr: AggregatedAccount[] = [];
    byHandle.forEach((rows, handle) => {
      // Representative: la fila con scan_status="done" más reciente, o
      // la primera (más reciente) si ninguna escaneó.
      const sorted = [...rows].sort((a, b) => {
        if (a.scan_status === "done" && b.scan_status !== "done") return -1;
        if (b.scan_status === "done" && a.scan_status !== "done") return 1;
        return (b.last_scanned_at ?? b.created_at).localeCompare(
          a.last_scanned_at ?? a.created_at,
        );
      });
      const operators = Array.from(
        new Map(
          rows
            .filter((r) => r.user_id)
            .map((r) => [r.user_id, { id: r.user_id, name: profileNameById.get(r.user_id) ?? "(sin nombre)" }]),
        ).values(),
      );
      aggArr.push({
        representative: sorted[0],
        operators,
        rowCount: rows.length,
      });
      // Avoid lint about unused `handle`
      void handle;
    });
    // Ordenar por score desc (más altos primero), luego por handle.
    aggArr.sort((a, b) => {
      const sa = a.representative.ai_score ?? -1;
      const sb = b.representative.ai_score ?? -1;
      if (sa !== sb) return sb - sa;
      return a.representative.instagram_handle.localeCompare(b.representative.instagram_handle);
    });
    return aggArr;
  }, [accountsQ.data, profilesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aggregated.filter((a) => {
      const r = a.representative;
      // Filtros por status (clickeables en los stat boxes).
      if (filterPending && !(r.scan_status === "pending" || r.scan_status === "scanning")) return false;
      if (filterFailed && r.scan_status !== "failed") return false;
      if (!q) return true;
      return (
        r.instagram_handle.includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        a.operators.some((o) => o.name.toLowerCase().includes(q))
      );
    });
  }, [aggregated, search, filterPending, filterFailed]);

  const stats = useMemo(() => {
    const list = aggregated;
    const scanned = list.filter((a) => a.representative.ai_score != null);
    const avgScore =
      scanned.length === 0
        ? 0
        : Math.round(
            scanned.reduce((s, a) => s + (a.representative.ai_score ?? 0), 0) / scanned.length,
          );
    return {
      totalUnique: list.length,
      avgScore,
      pending: list.filter((a) => a.representative.scan_status === "pending" || a.representative.scan_status === "scanning").length,
      failed: list.filter((a) => a.representative.scan_status === "failed").length,
    };
  }, [aggregated]);

  const openAcc = openHandle
    ? aggregated.find((a) => a.representative.instagram_handle === openHandle)
    : null;

  const handleRescan = async (id: string) => {
    try {
      await rescan.mutateAsync(id);
      toast.success("Re-escaneo en marcha", {
        description: "Vuelve en unos segundos a ver el resultado.",
      });
    } catch (err) {
      toast.error("No se pudo re-escanear", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Header compacto en una sola fila — title + hint + search.
          Antes tenía un avatar grande + descripción de 3 líneas que
          quitaba espacio cuando había cards. Ahora es una sola línea. */}
      <div className="flex flex-wrap items-center gap-2">
        <Instagram className="h-4 w-4 text-pink-400 shrink-0" />
        <h2 className="text-sm font-semibold">Cuentas spammer</h2>
        <span
          className="text-[11px] text-muted-foreground"
          title="Cuentas de IG que los spammers/scouters usan para outreach. Cada cuenta nueva se escanea con IA (Sonnet 4.6) que evalúa qué tan creíble se ve para influencers grandes."
        >
          · IA escanea cada cuenta nueva — click en una card para ver el detalle
        </span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar handle, nombre, scouter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox
          label="Cuentas únicas"
          value={stats.totalUnique}
          icon={UsersIcon}
          color="indigo"
          active={!filterPending && !filterFailed}
          onClick={() => { setFilterPending(false); setFilterFailed(false); }}
        />
        <StatBox
          label="Score promedio"
          value={stats.avgScore || "—"}
          icon={TrendingUp}
          color={
            stats.avgScore >= 65 ? "emerald" :
            stats.avgScore >= 45 ? "amber" :
            stats.avgScore > 0   ? "rose" : "sky"
          }
        />
        <StatBox
          label="Esperando scan"
          value={stats.pending}
          icon={Loader2}
          color="amber"
          active={filterPending}
          onClick={() => { setFilterPending(!filterPending); setFilterFailed(false); }}
          spinning={stats.pending > 0}
        />
        <StatBox
          label="Fallidas"
          value={stats.failed}
          icon={XCircle}
          color="rose"
          active={filterFailed}
          onClick={() => { setFilterFailed(!filterFailed); setFilterPending(false); }}
        />
      </div>

      {accountsQ.isLoading ? (
        <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas…
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-12 text-center">
          <Instagram className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {aggregated.length === 0
              ? "Todavía no hay cuentas registradas"
              : "Sin resultados para esa búsqueda"}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {aggregated.length === 0
              ? "Cuando un scouter agregue su primera cuenta en Scouter Assist > Cuentas, aparecerá acá con su análisis IA."
              : "Probá con otro handle, nombre o scouter."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => (
            <SpammerCard
              key={a.representative.instagram_handle}
              account={a}
              onClick={() => setOpenHandle(a.representative.instagram_handle)}
            />
          ))}
        </div>
      )}

      <SpammerDetailDialog
        open={!!openAcc}
        onOpenChange={(o) => !o && setOpenHandle(null)}
        account={openAcc ?? null}
        onRescan={handleRescan}
        rescanning={rescan.isPending}
      />
    </div>
  );
};

// ─── Card ───────────────────────────────────────────────────────────

const SpammerCard = ({
  account,
  onClick,
}: {
  account: AggregatedAccount;
  onClick: () => void;
}) => {
  const r = account.representative;
  const cfg = scoreCfg(r.ai_score);
  const isScanning = r.scan_status === "pending" || r.scan_status === "scanning";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all duration-200 hover:scale-[1.015] hover:border-primary/40 hover:shadow-lg"
    >
      {/* Header: avatar + score circle */}
      <div className="flex items-start gap-3 p-4">
        <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-sm font-semibold">@{r.instagram_handle}</span>
            {r.is_verified && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {r.display_name ?? "—"}
          </p>
        </div>
        <ScoreBadge score={r.ai_score} cfg={cfg} />
      </div>

      {/* Métricas IG */}
      <div className="grid grid-cols-3 gap-1 px-4 pb-3 text-center">
        <Metric label="Followers" value={fmtCount(r.followers_count)} />
        <Metric label="Following" value={fmtCount(r.following_count)} />
        <Metric label="Posts" value={fmtCount(r.posts_count)} />
      </div>

      {/* Summary IA + estado */}
      <div className="border-t border-border/60 bg-muted/20 p-3">
        {isScanning ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Escaneando con IA…
          </div>
        ) : r.scan_status === "failed" ? (
          <div className="flex items-start gap-1.5 text-xs text-rose-400">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{r.scan_error ?? "Scan fallido"}</span>
          </div>
        ) : r.ai_analysis ? (
          <p className="line-clamp-2 text-xs leading-snug text-foreground/85">
            {r.ai_analysis.summary}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground">Sin análisis todavía.</p>
        )}
      </div>

      {/* Footer: operators */}
      <div className="flex items-center gap-1.5 border-t border-border/60 bg-card px-4 py-2 text-[11px] text-muted-foreground">
        <UserCog className="h-3 w-3" />
        {account.operators.length === 0 ? (
          <span className="italic">Sin scouter asignado</span>
        ) : account.operators.length === 1 ? (
          <span className="truncate">{account.operators[0].name}</span>
        ) : (
          <span className="truncate">
            {account.operators.length} scouters la usan
          </span>
        )}
      </div>
    </button>
  );
};

const Avatar = ({ src, fallback, size = 48 }: { src: string | null; fallback: string; size?: number }) => {
  const initial = fallback.charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm ring-2 ring-violet-500/20"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          src={src}
          alt={fallback}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="text-base font-semibold">{initial}</span>
      )}
    </span>
  );
};

const ScoreBadge = ({
  score,
  cfg,
}: {
  score: number | null;
  cfg: { bg: string; ring: string; text: string; label: string };
}) => (
  <div
    className={cn(
      "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full ring-2",
      cfg.bg,
      cfg.ring,
    )}
  >
    <span className={cn("text-base font-bold tabular-nums", cfg.text)}>
      {score != null ? score : "—"}
    </span>
    <span className={cn("text-[8px] font-bold uppercase tracking-wider", cfg.text)}>
      {score != null ? "score" : "n/a"}
    </span>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/40 bg-background/40 py-1">
    <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-xs font-semibold tabular-nums">{value}</div>
  </div>
);

// StatBox — mismo estilo que las hero cards del subtab "Reclutamiento
// modelos" del Panel de control: borde 2px coloreado, blur orb en
// la esquina, hover lift + glow. Si tiene onClick, además es interactivo
// y soporta estado active (highlight más fuerte).
//
// Paletas predefinidas para los 4 colores que usamos.
const COLOR_STYLES: Record<
  "indigo" | "cyan" | "emerald" | "amber" | "rose" | "sky",
  {
    border: string;
    borderActive: string;
    borderHover: string;
    bg: string;
    iconBg: string;
    glow: string;
  }
> = {
  indigo: {
    border: "border-indigo-500/30",
    borderActive: "border-indigo-500/70",
    borderHover: "hover:border-indigo-500/60",
    bg: "bg-indigo-500",
    iconBg: "bg-indigo-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.4)]",
  },
  cyan: {
    border: "border-cyan-500/30",
    borderActive: "border-cyan-500/70",
    borderHover: "hover:border-cyan-500/60",
    bg: "bg-cyan-500",
    iconBg: "bg-cyan-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.4)]",
  },
  emerald: {
    border: "border-emerald-500/30",
    borderActive: "border-emerald-500/70",
    borderHover: "hover:border-emerald-500/60",
    bg: "bg-emerald-500",
    iconBg: "bg-emerald-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.4)]",
  },
  amber: {
    border: "border-amber-500/30",
    borderActive: "border-amber-500/70",
    borderHover: "hover:border-amber-500/60",
    bg: "bg-amber-500",
    iconBg: "bg-amber-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.4)]",
  },
  rose: {
    border: "border-rose-500/30",
    borderActive: "border-rose-500/70",
    borderHover: "hover:border-rose-500/60",
    bg: "bg-rose-500",
    iconBg: "bg-rose-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(244,63,94,0.4)]",
  },
  sky: {
    border: "border-sky-500/30",
    borderActive: "border-sky-500/70",
    borderHover: "hover:border-sky-500/60",
    bg: "bg-sky-500",
    iconBg: "bg-sky-500",
    glow: "hover:shadow-[0_0_24px_-4px_rgba(14,165,233,0.4)]",
  },
};

const StatBox = ({
  label,
  value,
  icon: Icon,
  color,
  onClick,
  active,
  spinning,
}: {
  label: string;
  value: number | string;
  icon: typeof UsersIcon;
  color: keyof typeof COLOR_STYLES;
  onClick?: () => void;
  active?: boolean;
  spinning?: boolean;
}) => {
  const cfg = COLOR_STYLES[color];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card px-3 py-2.5 text-left transition-all duration-200",
        active ? cfg.borderActive : cfg.border,
        onClick && "cursor-pointer hover:scale-[1.015]",
        onClick && cfg.borderHover,
        onClick && cfg.glow,
        active && "shadow-[0_0_16px_-4px_rgba(255,255,255,0.15)]",
      )}
    >
      <div
        className={cn(
          "absolute -right-8 -top-8 h-20 w-20 rounded-full blur-2xl opacity-30 transition-opacity",
          cfg.bg,
          onClick && "group-hover:opacity-50",
          active && "opacity-50",
        )}
      />
      <div className="relative flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
            cfg.iconBg,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
        </div>
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-foreground/70 font-semibold leading-tight">
            {label}
          </p>
          <p className="text-base font-bold tabular-nums leading-tight">
            {value}
          </p>
        </div>
      </div>
    </Tag>
  );
};

// ─── Detail dialog ─────────────────────────────────────────────────

const SEVERITY_STYLE: Record<SpammerAccountAiRedFlag["severity"], string> = {
  low: "bg-amber-500/15 text-amber-400",
  medium: "bg-orange-500/15 text-orange-400",
  high: "bg-rose-500/15 text-rose-400",
};

const WOULD_RESPOND_STYLE: Record<NonNullable<SpammerAccountAiAnalysis["would_respond"]>, { label: string; cls: string }> = {
  si: { label: "Sí respondería", cls: "bg-emerald-500/15 text-emerald-400" },
  tal_vez: { label: "Tal vez respondería", cls: "bg-amber-500/15 text-amber-400" },
  no: { label: "No respondería", cls: "bg-rose-500/15 text-rose-400" },
};

const SpammerDetailDialog = ({
  open,
  onOpenChange,
  account,
  onRescan,
  rescanning,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AggregatedAccount | null;
  onRescan: (id: string) => void;
  rescanning: boolean;
}) => {
  if (!account) return null;
  const r = account.representative;
  const a = r.ai_analysis;
  const cfg = scoreCfg(r.ai_score);
  const wr = a?.would_respond ? WOULD_RESPOND_STYLE[a.would_respond] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <Avatar src={r.profile_pic_url} fallback={r.instagram_handle} size={56} />
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2">
                <a
                  href={r.instagram_url || `https://instagram.com/${r.instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-base hover:text-pink-400 transition-colors"
                >
                  @{r.instagram_handle}
                </a>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                {r.is_verified && (
                  <CheckCircle2 className="h-4 w-4 text-sky-400" title="Verificada" />
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {r.display_name ?? "Sin nombre visible"} · {fmtCount(r.followers_count)} followers ·{" "}
                {fmtCount(r.following_count)} following · {fmtCount(r.posts_count)} posts
              </DialogDescription>
            </div>
            <ScoreBadge score={r.ai_score} cfg={cfg} />
          </div>
        </DialogHeader>

        {/* Bio */}
        {r.bio && (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs italic text-foreground/80">
            "{r.bio}"
          </div>
        )}

        {/* Analysis */}
        {a ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {wr && (
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", wr.cls)}>
                  {wr.label}
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", cfg.bg, cfg.text)}>
                <Sparkles className="h-3 w-3" />
                {cfg.label}
              </span>
              {r.last_scanned_at && (
                <span className="text-[11px] text-muted-foreground">
                  Escaneado {new Date(r.last_scanned_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mr-2">Resumen</span>
              {a.summary}
            </p>

            {a.would_respond === "no" && a.why_not && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                  Por qué NO respondería
                </div>
                <p className="text-sm">{a.why_not}</p>
              </div>
            )}

            {a.urgent_improvements && a.urgent_improvements.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                  Mejoras urgentes
                </div>
                <ul className="space-y-1 pl-4 list-disc text-sm marker:text-amber-400">
                  {a.urgent_improvements.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {a.strengths.length > 0 && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2">
                    Fortalezas
                  </div>
                  <ul className="space-y-1 pl-4 list-disc text-xs marker:text-emerald-400">
                    {a.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {a.red_flags.length > 0 && (
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Red flags
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {a.red_flags.map((rf, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", SEVERITY_STYLE[rf.severity])}>
                          {rf.severity}
                        </span>
                        <span>{rf.signal}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {a.recommendations.length > 0 && (
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Recomendaciones a mediano plazo
                </div>
                <ul className="space-y-1 pl-4 list-disc text-xs marker:text-muted-foreground">
                  {a.recommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs italic text-muted-foreground">
            {r.scan_status === "failed"
              ? `Scan fallido: ${r.scan_error ?? "error desconocido"}`
              : r.scan_status === "scanning" || r.scan_status === "pending"
                ? "Escaneo en curso… vuelve en unos segundos."
                : "Sin análisis IA disponible para esta cuenta."}
          </div>
        )}

        {/* Operators */}
        <div className="rounded-md border border-border/40 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Scouters que la usan ({account.operators.length})
          </div>
          {account.operators.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Sin scouter asignado.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {account.operators.map((op) => (
                <li
                  key={op.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-1 text-xs"
                >
                  <UserCog className="h-3 w-3 text-muted-foreground" />
                  {op.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRescan(r.id)}
            disabled={rescanning || r.scan_status === "scanning"}
            className="gap-1.5"
          >
            {rescanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Re-escanear ahora
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SpammerAccountsTab;
