import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShieldCheck, Star, Loader2 } from "lucide-react";
import {
  useLeadFavoriteIds,
  useScouterLeads,
  useScouterStats,
  useToggleLeadFavorite,
  type ScouterLead,
} from "@/hooks/useScouterLeads";

// First real screen of Scouter Assist — replaces the "En migración" Home
// placeholder. Mirrors the kash-call-qa /scouter Home layout in three
// stacked sections:
//   1. Compact stats row (4 cards)
//   2. Filters (status + search)
//   3. Lead cards grid with IG photo / status / verified / category / score
//
// Out of scope for this slice (left for later):
//   - "Descubrir" button + live activity console (needs the worker + Apify)
//   - Editing leads from the drawer
//   - Favorites toggle (the star icon renders read-only)

// ─── Status palette ─────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string }> = {
  discovery:  { label: "Discovery",       dot: "#6366f1" },
  candidate:  { label: "Candidate",       dot: "#0ea5e9" },
  contacting: { label: "Contacting",      dot: "#fbbf24" },
  confirmed:  { label: "Confirmed",       dot: "#22c55e" },
  active:     { label: "Active",          dot: "#10b981" },
  rejected:   { label: "Cierre fallido",  dot: "#f87171" },
  discarded:  { label: "Descarte",        dot: "#a1a1aa" },
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "discovery",  label: "Discovery" },
  { value: "candidate",  label: "Candidate" },
  { value: "contacting", label: "Contacting" },
  { value: "confirmed",  label: "Confirmed" },
  { value: "active",     label: "Active" },
  { value: "rejected",   label: "Cierre fallido" },
  { value: "discarded",  label: "Descarte" },
  { value: "all",        label: "Todos" },
];

// ─── Visual helpers ─────────────────────────────────────────────────────
const formatFollowers = (n: number | null): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

const scoreColor = (score: number | null): string => {
  if (score == null) return "rgb(148 163 184)";
  if (score >= 8) return "rgb(34 197 94)";
  if (score >= 7) return "rgb(234 179 8)";
  if (score >= 6) return "rgb(249 115 22)";
  return "rgb(239 68 68)";
};

const initialsBg = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
};

// ─── Stat card ──────────────────────────────────────────────────────────
const StatCard = ({
  label,
  big,
  sub,
  color,
}: {
  label: string;
  big: string | number;
  sub?: string;
  color: string;
}) => (
  <div className="rounded-xl border border-border bg-muted/20 p-3">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
      {big}
    </div>
    {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
  </div>
);

// ─── Lead card ──────────────────────────────────────────────────────────
const LeadCard = ({
  lead,
  isFavorite,
  onClick,
  onToggleFavorite,
}: {
  lead: ScouterLead;
  isFavorite: boolean;
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:scale-[1.02] hover:border-primary/40"
    >
      {/* Photo area — square */}
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
        {/* Status dot — top-left */}
        <span
          className="absolute left-2 top-2 block h-[10px] w-[10px] rounded-full ring-1 ring-black/40"
          style={{ background: statusCfg.dot, boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}
          title={statusCfg.label}
        />
        {/* Verified — top-right */}
        {lead.verified && (
          <span
            className="absolute right-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/55"
            aria-label="Verified"
          >
            <ShieldCheck className="h-3 w-3" style={{ color: "rgb(14 165 233)" }} />
          </span>
        )}
        {/* Category pill — bottom-left */}
        {lead.category && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-sm">
            {lead.category}
          </span>
        )}
        {/* Favorite toggle — bottom-right; nested <span role="button"> so
            React doesn't complain about <button> inside <button>. */}
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

      {/* Body */}
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">@{lead.instagram_handle}</span>
          </span>
          {aiScore != null && (
            <span
              className="shrink-0 text-[13px] font-extrabold tabular-nums"
              style={{ color: scoreColor(aiScore) }}
            >
              {aiScore.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
          <span className="truncate">
            {[lead.country, lead.city].filter(Boolean).join(" · ") || "—"}
          </span>
          <span className="shrink-0 tabular-nums">{formatFollowers(lead.followers)}</span>
        </div>
      </div>
    </button>
  );
};

// ─── Lead drawer (read-only first slice) ────────────────────────────────
const LeadDrawer = ({
  lead,
  open,
  onOpenChange,
}: {
  lead: ScouterLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  if (!lead) return null;
  const fields: Array<[string, React.ReactNode]> = [
    ["Status", lead.status],
    ["AI score", lead.ai_score != null ? lead.ai_score.toFixed(1) : "—"],
    ["AI status", lead.ai_status ?? "—"],
    ["AI reason", lead.ai_reason ?? "—"],
    ["Categoría", lead.category ?? "—"],
    ["País / Ciudad", [lead.country, lead.city].filter(Boolean).join(" · ") || "—"],
    ["Seguidores", formatFollowers(lead.followers)],
    ["Plataforma", lead.platform ?? "—"],
    ["OnlyFans", lead.onlyfans_url ?? "—"],
    ["Link-in-bio", lead.link_in_bio_platform ?? "—"],
    ["Fuente", lead.discovery_source ?? "—"],
    ["Closer asignado", lead.assigned_closer ?? "—"],
    ["Notas", lead.notes ?? "—"],
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            @{lead.instagram_handle}
            {lead.verified && (
              <ShieldCheck className="h-4 w-4" style={{ color: "rgb(14 165 233)" }} />
            )}
          </SheetTitle>
          <SheetDescription>{lead.name || "Sin nombre"}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {lead.photo_data_url && (
            <img src={lead.photo_data_url} alt="" className="aspect-square w-full rounded-lg object-cover" />
          )}
          {lead.bio && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-line">
              {lead.bio}
            </div>
          )}
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {k}
                </dt>
                <dd className="text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Edición de campos llega en una slice próxima. Para marcar / desmarcar
            como favorito, usa la estrella sobre la foto del lead.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ─── Main ────────────────────────────────────────────────────────────────
interface ScouterHomeProps {
  /** When true, the screen filters to leads the current user has marked
   *  as favorite, hides the stats row (less noise), and defaults the
   *  status filter to "all" so all favorites show regardless of stage. */
  favoritesOnly?: boolean;
}

const ScouterHome = ({ favoritesOnly = false }: ScouterHomeProps) => {
  const [statusFilter, setStatusFilter] = useState<string>(
    favoritesOnly ? "all" : "discovery",
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const stats = useScouterStats();
  const leads = useScouterLeads({ status: statusFilter, search, favoritesOnly });
  const favoriteIdsQ = useLeadFavoriteIds();
  const favoriteIds = favoriteIdsQ.data ?? new Set<string>();
  const toggleFavorite = useToggleLeadFavorite();

  const visibleLeads = leads.data ?? [];
  const totalShown = visibleLeads.length;

  const statBlocks = useMemo(() => {
    const s = stats.data;
    return [
      {
        label: "Descubiertas 24h",
        big: s ? s.discovered24h : "—",
        sub: s ? `${s.discovered7d} en 7d` : "",
        color: "rgb(99 102 241)",
      },
      {
        label: "High fit 7d",
        big: s ? s.highFit7d : "—",
        sub: "con IA",
        color: "rgb(22 163 74)",
      },
      {
        label: "Pendientes IA",
        big: s ? s.pendingAi : "—",
        sub: "sin scorear",
        color: "rgb(234 179 8)",
      },
      {
        label: "Total leads",
        big: s ? s.total : "—",
        sub: s ? `${s.discovered30d} nuevos en 30d` : "",
        color: "rgb(148 163 184)",
      },
    ];
  }, [stats.data]);

  return (
    <div className="space-y-5">
      {/* Stats row — hidden in favoritesOnly mode since the numbers refer
          to global discovery, not the user's saved set. */}
      {!favoritesOnly && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {statBlocks.map((b) => (
            <StatCard key={b.label} {...b} />
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por handle, nombre, país…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {leads.isLoading
            ? "Cargando…"
            : `${totalShown} lead${totalShown === 1 ? "" : "s"} mostrad${totalShown === 1 ? "o" : "os"}`}
        </span>
      </div>

      {/* Grid */}
      {leads.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm font-medium">
            {favoritesOnly ? "Sin favoritos todavía" : "Sin leads para mostrar"}
          </p>
          <p className="text-xs text-muted-foreground">
            {favoritesOnly
              ? "Marca leads como favoritos desde el grid de Home tocando la estrella en la esquina inferior derecha."
              : "Cuando el bot descubra cuentas IG aparecerán aquí. (El botón Descubrir llega en la próxima iteración.)"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visibleLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isFavorite={favoriteIds.has(lead.id)}
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
      )}

      <LeadDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
};

export default ScouterHome;
