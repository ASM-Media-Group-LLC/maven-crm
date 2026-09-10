import { useEffect, useMemo, useState } from "react";
import { ManagerDashboard } from "@/components/scouter/ManagerDashboard";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Search, Star, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Activity } from "lucide-react";
import {
  useLeadFavoriteIds,
  useScouterLeads,
  useScouterStats,
  useScouterCompanies,
  useScouterCountries,
  useToggleLeadFavorite,
  type ScouterLead,
  type AiQualityFilter,
} from "@/hooks/useScouterLeads";
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

// ─── Stat card compacto — versión chica de KpiCard, optimizada para
// ahorrar vertical space en Home. Padding p-3 + icon 8x8 + value
// text-xl (vs p-4 / 10x10 / text-3xl de los KpiCard grandes).
// Mantenemos el gradient corner blur del mismo color del ícono así
// hereda el lenguaje visual del Panel de Control sin que la card
// crezca.
const StatCard = ({
  label,
  big,
  color,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  big: string | number;
  color: string;
  active?: boolean;
  icon?: typeof Activity;
  onClick?: () => void;
}) => {
  const IconEl = Icon ?? Activity;
  const baseCls = `group relative overflow-hidden rounded-lg border bg-card p-3 transition-colors ${
    active ? "border-primary ring-1 ring-primary/40" : "border-border"
  }`;
  const inner = (
    <>
      <div className="relative flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}>
          <IconEl className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground/70 font-semibold leading-none">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums leading-none">{big}</p>
        </div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseCls} text-left hover:border-primary/40`}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseCls}>{inner}</div>;
};

// ─── Lead card ──────────────────────────────────────────────────────────
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
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-transform hover:border-primary/40"
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
            <VerifiedBadge size={14} />
          </span>
        )}
        {/* Category pill — bottom-left */}
        {lead.category && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-sm">
            {lead.category}
          </span>
        )}
        {/* Favorite toggle — bottom-right */}
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
          className="absolute bottom-1.5 right-1.5 flex h-[24px] w-[24px] cursor-pointer items-center justify-center rounded-full bg-black/55 transition-transform"
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
              style={{ color: sc }}
            >
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
        {/* Company tag badges. Prioridad: target_companies (asignación
            manual + IA, multi-compañía) → company_id (discovery owner,
            fallback). Antes solo se mostraba company_id, así que los
            cambios manuales en el popup no se reflejaban en la card. */}
        {(() => {
          const targets = lead.target_companies ?? [];
          if (targets.length > 0) {
            return (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {targets.slice(0, 3).map((slug) => (
                  <span
                    key={slug}
                    className="rounded-full border border-amber-400/60 px-1.5 py-0 text-[8px] font-bold uppercase text-amber-400"
                  >
                    {slug}
                  </span>
                ))}
                {targets.length > 3 && (
                  <span className="text-[8px] text-muted-foreground self-center">
                    +{targets.length - 3}
                  </span>
                )}
              </div>
            );
          }
          if (companySlug) {
            return (
              <div className="flex flex-wrap gap-1 mt-0.5">
                <span className="rounded-full border border-amber-400/60 px-1.5 py-0 text-[8px] font-bold uppercase text-amber-400">
                  {companySlug}
                </span>
              </div>
            );
          }
          return null;
        })()}
        {/* Lookalike score — sólo si hay similitud computada contra
            algún seed de la compañía. Color por intensidad: verde alto,
            azul medio, gris bajo. */}
        {typeof lead.lookalike_score === "number" && lead.lookalike_seed_handle && (
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[8px] font-medium ${
                lead.lookalike_score >= 0.7
                  ? "border-emerald-400/60 text-emerald-400"
                  : lead.lookalike_score >= 0.5
                    ? "border-blue-400/60 text-blue-400"
                    : "border-border text-muted-foreground"
              }`}
              title={`Similar a @${lead.lookalike_seed_handle} (${Math.round((lead.lookalike_score ?? 0) * 100)}%)`}
            >
              <span>≈</span>
              <span className="truncate max-w-[80px]">@{lead.lookalike_seed_handle}</span>
              <span className="tabular-nums">{Math.round(lead.lookalike_score * 100)}%</span>
            </span>
          </div>
        )}
      </div>

      {/* Score progress bar at bottom */}
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

// ─── Pagination ─────────────────────────────────────────────────────────
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

  // Sliding window of up to 10 pages
  const windowSize = 10;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1);
  }
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const btn =
    "h-8 w-8 rounded-md border text-xs font-medium tabular-nums inline-flex items-center justify-center transition-colors disabled:opacity-40";
  const activeClass = "border-amber-400 bg-amber-400/15 text-amber-400";

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={btn}
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          aria-label="Primera página"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
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
        <button
          type="button"
          className={btn}
          disabled={page === totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={btn}
          disabled={page === totalPages}
          onClick={() => onPageChange(totalPages)}
          aria-label="Última página"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </span>
    </div>
  );
};

// ─── AI quality filter options ──────────────────────────────────────────
const AI_QUALITY_OPTIONS: Array<{ value: AiQualityFilter; label: string }> = [
  { value: "approved",  label: "✅ Aprobadas IA" },
  { value: "high_fit",  label: "Solo high_fit" },
  { value: "scored",    label: "Evaluadas (incluye low_fit)" },
  { value: "all",       label: "Todas (sin filtro IA)" },
];

// ─── Main ────────────────────────────────────────────────────────────────
interface ScouterHomeProps {
  favoritesOnly?: boolean;
  // El header dinámico de /scouter-assist necesita saber qué compañía
  // está filtrada (para mostrar el logo). Por eso el state vive arriba
  // ahora — opcional para mantener compat con la card Favoritas.
  companyFilter?: string;
  setCompanyFilter?: (v: string) => void;
}

const ScouterHome = ({ favoritesOnly = false, companyFilter: companyFilterProp, setCompanyFilter: setCompanyFilterProp }: ScouterHomeProps) => {
  // Spammers ven SOLO sus leads asignadas en Home — no el pool
  // completo del tenant. Admins/managers/supervisors siguen viendo
  // todo. Computamos el rol arriba porque el defaultStatus depende
  // de él (sin esto el spammer arrancaba con statusFilter="discovery"
  // y la grilla quedaba vacía aunque tuviera asignaciones).
  const { isAdmin, isSpammer } = useUserRole();
  const { dataScope } = usePermissions();
  // Ver el pool completo = "Permisos de datos" de Scouter Assist, no el nombre del
  // rol (08/09): con nombres literales, Operations Sales y Closer + no entraban
  // aunque tuvieran "Todos los datos".
  const isManagerLikeRole = isAdmin || dataScope("Scouter Assist") !== "self";
  const onlyAssignedToMe = isSpammer && !isManagerLikeRole;

  // Default del status filter:
  //   - favoritesOnly: "all" (todos los favoritos sin importar status).
  //   - spammer (sin manager): "all" — sus leads pueden estar en
  //     cualquier status (contacting, confirmed, etc).
  //   - resto: "discovery" — flujo de descubrimiento por defecto.
  const defaultStatus = favoritesOnly || onlyAssignedToMe ? "all" : "discovery";
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatus);
  // Visual highlight de la card seleccionada — independiente del
  // statusFilter porque varias cards mapean a status="all" y antes se
  // prendían las 3 al mismo tiempo. Default = "total".
  const [selectedCardKey, setSelectedCardKey] = useState<string>("total");
  const [search, setSearch] = useState("");
  // Si el padre pasó companyFilter via prop, usamos eso (state lifted).
  // Sino state local — pre-existente cuando Home era standalone.
  const [companyFilterLocal, setCompanyFilterLocal] = useState<string>("all");
  const companyFilter = companyFilterProp ?? companyFilterLocal;
  const setCompanyFilter = setCompanyFilterProp ?? setCompanyFilterLocal;
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [aiQuality, setAiQuality] = useState<AiQualityFilter>("all");
  const [page, setPage] = useState(1);
  const [managerDate, setManagerDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const pageSize = 60;
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, companyFilter, countryFilter, aiQuality]);

  const companies = useScouterCompanies();
  // Resolvemos slug acá temprano para pasarlo a stats + leads.
  const _activeCompanySlug =
    companyFilter !== "all"
      ? companies.data?.find((c) => c.id === companyFilter)?.slug
      : undefined;
  // Stats respeta los filtros visuales para que los conteos arriba
  // coincidan con la grilla abajo (antes mostraban totales globales).
  // statusFilter NO entra acá: las cards lo controlan ellas (un click
  // setea status=confirmed para Interesadas) — referencia circular.
  const stats = useScouterStats({
    company: companyFilter !== "all" ? companyFilter : undefined,
    companySlug: _activeCompanySlug,
    country: countryFilter !== "all" ? countryFilter : undefined,
    aiQuality,
  });
  // El dropdown de país ahora respeta status + aiQuality del filtro
  // activo, para que el conteo coincida con lo que ves en la grilla.
  // Antes mostraba "México 853" pero la grilla con filtros default
  // solo cargaba ~321 → confusión total.
  const countries = useScouterCountries({
    status: statusFilter,
    aiQuality,
  });
  // Slug de la compañía activa (reutilizado de _activeCompanySlug calculado
  // arriba para stats). Lo mantenemos como const local con el mismo nombre
  // para no romper el resto del componente.
  const activeCompanySlug = _activeCompanySlug;
  const leads = useScouterLeads({
    status: statusFilter,
    search,
    favoritesOnly,
    company: companyFilter !== "all" ? companyFilter : undefined,
    companySlug: activeCompanySlug,
    country: countryFilter !== "all" ? countryFilter : undefined,
    aiQuality,
    page,
    pageSize,
    onlyAssignedToMe,
  });
  const favoriteIdsQ = useLeadFavoriteIds();
  const favoriteIds = favoriteIdsQ.data ?? new Set<string>();
  const toggleFavorite = useToggleLeadFavorite();

  const result = leads.data ?? { leads: [], total: 0 };
  const visibleLeads = result.leads;
  const totalLeads = result.total;
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));

  // Build a company_id -> slug map for card badges
  const companyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies.data ?? []) {
      map.set(c.id, c.slug);
    }
    return map;
  }, [companies.data]);

  // Stat cards — rediseño 2026-05. Reemplazamos los 4 contadores legacy
  // (Activas / Contactando / Cierres fallidos / Descartes) por métricas
  // de outreach reales: Contactadas (interaction_history.comment),
  // Interesadas (status=confirmed), No responden (≥7 días sin marcar
  // confirmed/active). Total scouteadas se mantiene.
  const statBlocks = useMemo(() => {
    return [
      { key: "total", label: "Total scouteadas", big: stats.data?.total ?? 0, statusVal: "all" as const, color: "bg-blue-500" },
      { key: "contacted", label: "Contactadas", big: stats.data?.contactedDistinct ?? 0, statusVal: "all" as const, color: "bg-amber-500" },
      { key: "interested", label: "Interesadas", big: stats.data?.interested ?? 0, statusVal: "confirmed" as const, color: "bg-success" },
      { key: "noResponse", label: "No responden", big: stats.data?.noResponse ?? 0, statusVal: "all" as const, color: "bg-destructive" },
    ];
  }, [stats.data]);

  return (
    <div className="space-y-5">
      {/* Stats row — KpiCard estándar */}
      {!favoritesOnly && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statBlocks.map((b) => (
            <StatCard
              key={b.key}
              label={b.label}
              big={b.big}
              color={b.color}
              active={selectedCardKey === b.key}
              onClick={() => {
                setSelectedCardKey(b.key);
                setStatusFilter(b.statusVal);
              }}
            />
          ))}
        </div>
      )}

      {/* "Progreso del equipo" (ManagerDashboard) movido al tab Analytics
          para liberar Home. */}

      {/* Filters row */}
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
            ...(countries.data ?? []).map((c) => ({
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

        {/* Search — full width remaining */}
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

      <LeadDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
};

export default ScouterHome;
