import { useState, useEffect, useMemo } from "react";
import { startOfMonth, endOfMonth, startOfDay, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users,
  Phone,
  PhoneCall,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  TrendingUp,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Crown,
  Instagram,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  useOperationsDashboard,
  useMetricDetails,
  useLeadDetail,
  useBestCloser,
  CATEGORY_ORDER,
  type MetricKey,
  type DashboardRange,
  type DetailRow,
} from "@/hooks/useOperationsDashboard";
import { cn } from "@/lib/utils";
import { ListRow } from "@/components/ui/list-row";
import { OUTCOME_META } from "@/hooks/useAgencyQa";
import SpammerAccountsTab from "./panel-de-control/SpammerAccountsTab";
import ControlGastoTab from "./panel-de-control/ControlGastoTab";
import ChattersRecruitmentTab from "./panel-de-control/ChattersRecruitmentTab";
import BestCloserMonthlyDialog from "@/components/dashboard/BestCloserMonthlyDialog";

// ─── KPI card ──────────────────────────────────────────────────────────

interface KpiCardProps {
  metricKey: MetricKey;
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  hint?: string;
  loading: boolean;
  onClick: () => void;
}

const KpiCard = ({
  label,
  value,
  icon,
  gradient,
  hint,
  loading,
  onClick,
}: KpiCardProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className={cn(
      "group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left",
      "transition-all duration-200 ease-out",
      "hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)]",
      "active:scale-[0.99]",
      "disabled:cursor-not-allowed disabled:opacity-70",
    )}
  >
    {/* Gradient corner accent */}
    <div
      className={cn(
        "absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25",
        "transition-opacity group-hover:opacity-50",
        gradient,
      )}
    />

    <div className="relative space-y-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", gradient)}>
        {icon}
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-9 w-24" />
        ) : (
          <p className="text-3xl font-bold tabular-nums leading-tight">
            {value.toLocaleString("es")}
          </p>
        )}
        {hint && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
            {hint}
          </p>
        )}
      </div>
    </div>
  </button>
);

// ─── Detail dialog ─────────────────────────────────────────────────────

// Paleta por categoría — Elite=oro, A+=violeta intenso, etc. Hace que
// el popup deje de verse "negro, soso" como reportó el user. Cada
// header de grupo toma su tono del map; "Sin categoría" cae a gris.
const CATEGORY_TONES: Record<
  string,
  { bg: string; text: string; badge: string; ring: string; line: string; iconBg: string }
> = {
  Elite: {
    bg: "bg-gradient-to-r from-amber-500/20 to-amber-400/10",
    text: "text-amber-400",
    badge: "bg-amber-500/30 text-amber-200",
    ring: "ring-1 ring-amber-400/30",
    line: "bg-gradient-to-r from-amber-400/40 to-transparent",
    iconBg: "bg-amber-500/10 group-hover:bg-amber-500/20",
  },
  "A+": {
    bg: "bg-gradient-to-r from-violet-500/20 to-violet-400/10",
    text: "text-violet-300",
    badge: "bg-violet-500/30 text-violet-100",
    ring: "ring-1 ring-violet-400/30",
    line: "bg-gradient-to-r from-violet-400/40 to-transparent",
    iconBg: "bg-violet-500/10 group-hover:bg-violet-500/20",
  },
  A: {
    bg: "bg-gradient-to-r from-blue-500/20 to-blue-400/10",
    text: "text-blue-300",
    badge: "bg-blue-500/30 text-blue-100",
    ring: "ring-1 ring-blue-400/30",
    line: "bg-gradient-to-r from-blue-400/40 to-transparent",
    iconBg: "bg-blue-500/10 group-hover:bg-blue-500/20",
  },
  "B+": {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  B: {
    bg: "bg-gradient-to-r from-teal-500/20 to-teal-400/10",
    text: "text-teal-300",
    badge: "bg-teal-500/30 text-teal-100",
    ring: "ring-1 ring-teal-400/30",
    line: "bg-gradient-to-r from-teal-400/40 to-transparent",
    iconBg: "bg-teal-500/10 group-hover:bg-teal-500/20",
  },
  "C+": {
    bg: "bg-gradient-to-r from-orange-500/20 to-orange-400/10",
    text: "text-orange-300",
    badge: "bg-orange-500/30 text-orange-100",
    ring: "ring-1 ring-orange-400/30",
    line: "bg-gradient-to-r from-orange-400/40 to-transparent",
    iconBg: "bg-orange-500/10 group-hover:bg-orange-500/20",
  },
  C: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
};
const DEFAULT_TONE = {
  bg: "bg-muted/40",
  text: "text-muted-foreground",
  badge: "bg-muted-foreground/20 text-muted-foreground",
  ring: "",
  line: "bg-border",
  iconBg: "bg-muted/40 group-hover:bg-muted",
};

// Tones para badges (status / source / outcome) cuando agrupamos por
// badge en vez de categoría (la mayoría de leadgen_entries tienen
// category_code=null, entonces agrupamos por status). Cada valor de
// badge mapea a un tono visual coherente.
const BADGE_TONES: Record<string, typeof DEFAULT_TONE> = {
  // Sources
  leadgen: {
    bg: "bg-gradient-to-r from-indigo-500/20 to-indigo-400/10",
    text: "text-indigo-300",
    badge: "bg-indigo-500/30 text-indigo-100",
    ring: "ring-1 ring-indigo-400/30",
    line: "bg-gradient-to-r from-indigo-400/40 to-transparent",
    iconBg: "bg-indigo-500/10 group-hover:bg-indigo-500/20",
  },
  scouter: {
    bg: "bg-gradient-to-r from-pink-500/20 to-pink-400/10",
    text: "text-pink-300",
    badge: "bg-pink-500/30 text-pink-100",
    ring: "ring-1 ring-pink-400/30",
    line: "bg-gradient-to-r from-pink-400/40 to-transparent",
    iconBg: "bg-pink-500/10 group-hover:bg-pink-500/20",
  },
  // Status closer
  Nuevo: {
    bg: "bg-gradient-to-r from-blue-500/20 to-blue-400/10",
    text: "text-blue-300",
    badge: "bg-blue-500/30 text-blue-100",
    ring: "ring-1 ring-blue-400/30",
    line: "bg-gradient-to-r from-blue-400/40 to-transparent",
    iconBg: "bg-blue-500/10 group-hover:bg-blue-500/20",
  },
  Asignada: {
    bg: "bg-gradient-to-r from-violet-500/20 to-violet-400/10",
    text: "text-violet-300",
    badge: "bg-violet-500/30 text-violet-100",
    ring: "ring-1 ring-violet-400/30",
    line: "bg-gradient-to-r from-violet-400/40 to-transparent",
    iconBg: "bg-violet-500/10 group-hover:bg-violet-500/20",
  },
  Confirmada: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  Completada: {
    bg: "bg-gradient-to-r from-teal-500/20 to-teal-400/10",
    text: "text-teal-300",
    badge: "bg-teal-500/30 text-teal-100",
    ring: "ring-1 ring-teal-400/30",
    line: "bg-gradient-to-r from-teal-400/40 to-transparent",
    iconBg: "bg-teal-500/10 group-hover:bg-teal-500/20",
  },
  "No interesada": {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
  // QA outcomes
  cerro: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  en_espera: {
    bg: "bg-gradient-to-r from-amber-500/20 to-amber-400/10",
    text: "text-amber-300",
    badge: "bg-amber-500/30 text-amber-100",
    ring: "ring-1 ring-amber-400/30",
    line: "bg-gradient-to-r from-amber-400/40 to-transparent",
    iconBg: "bg-amber-500/10 group-hover:bg-amber-500/20",
  },
  no_cerro: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
  // CRM movement
  alta: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  baja: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
};

const categoryTone = (cat: string) =>
  CATEGORY_TONES[cat] ?? BADGE_TONES[cat] ?? DEFAULT_TONE;

const DetailDialog = ({
  open,
  onOpenChange,
  metric,
  metricLabel,
  range,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  metric: MetricKey | null;
  metricLabel: string;
  range: DashboardRange;
}) => {
  const navigate = useNavigate();
  const { data: result, isLoading } = useMetricDetails(
    metric ?? "contacted",
    range,
    open && !!metric,
  );
  const data = result?.rows ?? [];
  const totalCount = result?.totalCount ?? 0;
  // Lead detail nested dialog: cuando el user clickea una fila con
  // leadSource (lead o creator), abrimos un segundo dialog encima
  // con TODA la info del row.
  const [detailLead, setDetailLead] = useState<{
    source: "leadgen" | "scouter" | "creator";
    id: string;
    title: string;
  } | null>(null);

  // SIEMPRE agrupamos por category. Si la row no tiene category,
  // cae al bucket "Sin categoría" al final del orden canónico
  // (Elite → A+ → A → B+ → B → C+ → C → Sin categoría). El user
  // pidió: "filtra por categorías Elite, A+, no por leadgen". Antes
  // la heurística cambiaba a agrupar por badge (leadgen/scouter)
  // cuando ningún row tenía category — confuso. Ahora siempre por
  // category, los sin clasificar quedan al final visibles.
  const groups = useMemo(() => {
    if (!data || data.length === 0) {
      return { hasCategory: false, list: [] as Array<{ cat: string; rows: DetailRow[] }> };
    }
    const map = new Map<string, DetailRow[]>();
    for (const r of data) {
      const key = r.category ?? "Sin categoría";
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      const sa = CATEGORY_ORDER[a] ?? 999;
      const sb = CATEGORY_ORDER[b] ?? 999;
      if (sa !== sb) return sa - sb;
      return a.localeCompare(b);
    });
    return {
      hasCategory: true,
      list: sortedKeys.map((cat) => ({ cat, rows: map.get(cat)! })),
    };
  }, [data]);

  // Default: TODO colapsado EXCEPTO la primera categoría con datos
  // (el user lo pidió: si la primera es Elite, solo Elite expandido).
  // Se recomputa cada vez que cambia el metric o se reabre el dialog.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open || !groups.hasCategory || groups.list.length === 0) {
      setCollapsed(new Set());
      return;
    }
    const allCats = groups.list.map((g) => g.cat);
    const first = allCats[0];
    setCollapsed(new Set(allCats.filter((c) => c !== first)));
  }, [open, metric, groups.hasCategory, groups.list]);
  const toggleCat = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header con gradiente sutil + número grande del total real.
            El user reportó: "card dice 3174 pero popup muestra 50" — ahora
            el header siempre muestra totalCount aunque rows tenga max 100. */}
        <DialogHeader className="px-6 pt-5 pb-4 pr-14 border-b border-border/40 bg-gradient-to-r from-primary/5 via-primary/0 to-primary/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight flex items-center gap-3">
                {metricLabel || "Detalle"}
                {!isLoading && (
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-bold text-primary tabular-nums">
                    {totalCount.toLocaleString("es")}
                  </span>
                )}
              </DialogTitle>
              {!isLoading && data.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {totalCount > data.length
                    ? `Mostrando los ${data.length} más recientes de ${totalCount.toLocaleString("es")} totales`
                    : `${data.length.toLocaleString("es")} ${data.length === 1 ? "registro" : "registros"}`}
                  {groups.hasCategory && ` · ${groups.list.length} ${groups.list.length === 1 ? "categoría" : "categorías"}`}
                </p>
              )}
            </div>
            {groups.hasCategory && groups.list.length > 1 && (
              <div className="flex items-center gap-2 shrink-0 mt-1">
                <button
                  type="button"
                  onClick={() => setCollapsed(new Set())}
                  className="rounded-full bg-muted/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Expandir todas"
                >
                  Expandir
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed(new Set(groups.list.map((g) => g.cat)))
                  }
                  className="rounded-full bg-muted/40 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Colapsar todas"
                >
                  Colapsar
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </>
          ) : !data || data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="rounded-full bg-muted/40 p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Sin registros en el rango seleccionado.
              </p>
            </div>
          ) : !groups.hasCategory ? (
            <div className="space-y-1.5">
              {data.map((row) => renderRow(row, navigate, onOpenChange, setDetailLead))}
            </div>
          ) : (
            groups.list.map(({ cat, rows }) => {
              const isCollapsed = collapsed.has(cat);
              const tone = categoryTone(cat);
              return (
                <div key={cat} className="space-y-2">
                  {/* Header con color por categoría (Elite=oro, A+=violeta,
                      etc). Pill con count, sticky para que se vea
                      siempre al scrollear. */}
                  <button
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className="group flex w-full items-center gap-3 sticky top-0 z-[1] py-1.5 px-0.5 bg-card/40 backdrop-blur-md rounded-2xl"
                  >
                    <div
                      className={`flex items-center gap-2 rounded-full px-3 py-1 transition-transform group-hover:scale-[1.02] ${tone.bg} ${tone.ring}`}
                    >
                      <span className={`text-sm font-bold tracking-wide ${tone.text}`}>
                        {cat}
                      </span>
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${tone.badge}`}
                      >
                        {rows.length}
                      </span>
                    </div>
                    <div className={`h-px flex-1 ${tone.line}`} />
                    <div className={`shrink-0 rounded-full p-1 transition-colors ${tone.iconBg}`}>
                      {isCollapsed ? (
                        <ChevronDown className={`h-3.5 w-3.5 ${tone.text}`} />
                      ) : (
                        <ChevronUp className={`h-3.5 w-3.5 ${tone.text}`} />
                      )}
                    </div>
                  </button>
                  {/* Lazy render: solo cuando la categoría está expandida,
                      generamos sus filas. El user pidió "precarga las
                      primeras 3 y demás bajo demanda" — como el data ya
                      vino en memoria, el "lazy" es del DOM (filas
                      colapsadas no renderean cards). */}
                  {!isCollapsed && (
                    <div className="space-y-1.5 pl-1">
                      {rows.map((row) => renderRow(row, navigate, onOpenChange, setDetailLead))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {data && data.length > 0 && totalCount > data.length && (
          <p className="text-[10px] text-muted-foreground text-center py-2.5 border-t border-border/40 bg-muted/20">
            Mostrando los {data.length} más recientes de{" "}
            <strong className="text-foreground">{totalCount.toLocaleString("es")}</strong> totales —
            exportar desde Reports para ver el listado completo.
          </p>
        )}
      </DialogContent>
    </Dialog>

    {/* Lead detail nested popup — abre al click en una fila con leadSource */}
    <LeadDetailDialog
      open={!!detailLead}
      onOpenChange={(o) => !o && setDetailLead(null)}
      source={detailLead?.source}
      id={detailLead?.id ?? null}
      title={detailLead?.title ?? ""}
    />
    </>
  );
};

// Renderer de una fila individual del DetailDialog. Se extrae a una
// función para poder reutilizarla en los dos branches (flat y agrupado
// por categoría) sin duplicar el JSX.
const renderRow = (
  row: DetailRow,
  navigate: (path: string) => void,
  onOpenChange: (o: boolean) => void,
  setDetailLead: (v: { source: "leadgen" | "scouter" | "creator"; id: string; title: string } | null) => void,
) => {
  const handleRowClick = () => {
    if (row.linkUrl) {
      navigate(row.linkUrl);
      onOpenChange(false);
      return;
    }
    if (row.leadSource) {
      setDetailLead({
        source: row.leadSource,
        id: row.id,
        title: row.primary,
      });
    }
  };
  const isClickable = !!row.linkUrl || !!row.leadSource;
  return (
    <ListRow
      key={row.id}
      interactive={isClickable}
      onClick={handleRowClick}
      className="justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{row.primary}</p>
        {row.secondary && (
          <p className="text-xs text-muted-foreground truncate">
            {row.secondary}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {row.badge && (() => {
          // Si el badge es un outcome de QA (cerro / en_espera /
          // no_cerro), renderizamos con el mismo lenguaje visual
          // que la tabla de Calls — pill solid con color del
          // outcome + label en castellano. Para cualquier otro
          // badge, cae al outline genérico.
          const meta = OUTCOME_META[row.badge as keyof typeof OUTCOME_META];
          if (meta) {
            // Override del label: user pidió "Cerró" (con tilde) en
            // vez del "Exitoso" que muestra el resto de QA, y
            // "En espera" / "Rechazado" se mantienen.
            const label =
              row.badge === "cerro" ? "Cerró" : meta.label;
            return (
              <span
                className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-bold text-white"
                style={{ background: meta.bg }}
              >
                <span aria-hidden>{meta.icon}</span>
                {label}
              </span>
            );
          }
          return (
            <Badge variant="outline" className="text-[10px]">
              {row.badge}
            </Badge>
          );
        })()}
        {row.date && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {format(new Date(row.date), "d MMM", { locale: es })}
          </span>
        )}
        {isClickable && (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
    </ListRow>
  );
};

// ─── Lead detail dialog ────────────────────────────────────────────────
// Popup que muestra TODOS los campos del lead seleccionado en formato
// key/value. Funciona para los 3 sources: leadgen_entries, scouter_leads,
// creators (para los Ingresos al CRM).

const FIELD_LABELS: Record<string, string> = {
  model_handle: "Handle (modelo)",
  instagram_handle: "Instagram",
  phone_e164: "Teléfono",
  phone_raw: "Teléfono (raw)",
  phone: "Teléfono",
  status: "Status",
  quality: "Calidad",
  record_type: "Tipo de registro",
  notes: "Notas",
  source_link: "Source link",
  state: "Estado/Provincia",
  country: "País",
  country_code: "Código país",
  city: "Ciudad",
  followers: "Seguidores",
  bio: "Bio",
  ai_score: "AI Score",
  ai_status: "AI Status",
  ai_reason: "AI Razón",
  category: "Categoría",
  platform: "Plataforma",
  onlyfans_url: "OnlyFans URL",
  name: "Nombre",
  entered_crm_at: "Ingresada al CRM",
  entered_crm_notes: "Notas CRM",
  created_at: "Creada",
  updated_at: "Actualizada",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "tenant_id",
  "lg_user_id",
  "entered_crm_by",
  "company_id",
  "created_creator_id",
  // Foto + nombre + handle ya viven en el header del dialog, no
  // hace falta repetirlos en la lista de campos abajo.
  "profile_photo_url",
  "photo_data_url",
  "piclink_url",
  "name",
  "model_handle",
  "instagram_handle",
  "category",
]);

const LeadDetailDialog = ({
  open,
  onOpenChange,
  source,
  id,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  source?: "leadgen" | "scouter" | "creator";
  id: string | null;
  title: string;
}) => {
  const { data, isLoading } = useLeadDetail(source, id);

  // Datos derivados del header — handle de IG, foto, nombre, categoría.
  // leadgen_entries usa `model_handle`; scouter_leads y creators usan
  // `instagram_handle`. Foto: `profile_photo_url` (creators) o
  // `photo_data_url` (scouter); leadgen no tiene foto → caemos al
  // placeholder con iniciales.
  const igHandle = (() => {
    if (!data) return null;
    const raw =
      (data as Record<string, unknown>).instagram_handle ??
      (data as Record<string, unknown>).model_handle;
    if (typeof raw !== "string" || !raw.trim()) return null;
    return raw.trim().replace(/^@/, "");
  })();
  const photoUrl = (() => {
    if (!data) return null;
    const raw =
      (data as Record<string, unknown>).profile_photo_url ??
      (data as Record<string, unknown>).photo_data_url;
    return typeof raw === "string" && raw.trim() ? raw : null;
  })();
  const displayName =
    (data && typeof (data as any).name === "string" && (data as any).name.trim())
      ? (data as any).name as string
      : title;
  const category =
    data && typeof (data as any).category === "string"
      ? ((data as any).category as string)
      : null;
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const openIg = () => {
    if (!igHandle) return;
    window.open(`https://instagram.com/${igHandle}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{displayName}</DialogTitle>
        </DialogHeader>

        {/* Header con foto + nombre. Click en cualquiera abre IG en una
            tab nueva si tenemos handle. Sin handle, no es clickeable. */}
        <div className="flex items-center gap-4 p-5 bg-gradient-to-br from-muted/40 to-transparent border-b border-border">
          <button
            type="button"
            onClick={openIg}
            disabled={!igHandle}
            className={cn(
              "relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-border bg-muted",
              igHandle && "cursor-pointer transition-all hover:border-primary hover:scale-105",
            )}
            aria-label={igHandle ? `Abrir Instagram de @${igHandle}` : "Sin Instagram"}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                {initials || "?"}
              </div>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={openIg}
              disabled={!igHandle}
              className={cn(
                "block text-left text-xl font-bold truncate w-full",
                igHandle && "hover:text-primary transition-colors cursor-pointer",
              )}
            >
              {displayName}
            </button>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {igHandle && (
                <button
                  type="button"
                  onClick={openIg}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <Instagram className="h-3 w-3" />
                  @{igHandle}
                </button>
              )}
              {category && (
                <Badge variant="outline" className="text-[10px]">
                  {category}
                </Badge>
              )}
              {source && (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {source}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </>
          ) : !data ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No se encontró el registro.
            </p>
          ) : (() => {
            // Agrupamos los campos en secciones lógicas para que el
            // dialog no sea una lista monótona de key-value. El group
            // function clasifica cada campo según su key.
            const entries = Object.entries(data).filter(
              ([k, v]) =>
                !HIDDEN_FIELDS.has(k) &&
                v !== null &&
                v !== "" &&
                !(typeof v === "object" && Object.keys(v ?? {}).length === 0),
            );
            type Section = { title: string; keys: string[] };
            const SECTIONS: Section[] = [
              { title: "Contacto",   keys: ["phone_e164", "phone", "phone_raw", "source_link", "ig_url"] },
              { title: "Ubicación",  keys: ["country", "country_code", "state", "city"] },
              { title: "OnlyFans / Plataforma", keys: ["platform", "onlyfans_url", "ai_score", "ai_status", "ai_reason"] },
              { title: "Estado",     keys: ["status", "record_type", "quality", "category", "verified"] },
              { title: "Métricas",   keys: ["followers", "bio"] },
              { title: "Notas",      keys: ["notes", "entered_crm_notes", "entered_crm_at"] },
              { title: "Timestamps", keys: ["created_at", "updated_at"] },
            ];
            const used = new Set<string>();
            const sectioned: Array<{ title: string; entries: Array<[string, unknown]> }> = [];
            for (const sec of SECTIONS) {
              const matches = entries.filter(([k]) => sec.keys.includes(k));
              if (matches.length > 0) {
                sectioned.push({ title: sec.title, entries: matches });
                matches.forEach(([k]) => used.add(k));
              }
            }
            // Cualquier campo que no calza en una sección conocida va
            // a "Otros" para no perderse.
            const others = entries.filter(([k]) => !used.has(k));
            if (others.length > 0) sectioned.push({ title: "Otros", entries: others });

            return sectioned.map((sec) => (
              <div
                key={sec.title}
                className="rounded-lg border border-border/60 bg-muted/20 overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-border/40 bg-muted/30">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {sec.title}
                  </p>
                </div>
                <div className="divide-y divide-border/40">
                  {sec.entries.map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2 text-sm hover:bg-muted/20 transition-colors"
                    >
                      <span className="text-xs text-muted-foreground font-medium self-center">
                        {FIELD_LABELS[k] ?? k}
                      </span>
                      <span className="break-words self-center">
                        {typeof v === "boolean"
                          ? v
                            ? "Sí"
                            : "No"
                          : typeof v === "object"
                            ? JSON.stringify(v).slice(0, 200)
                            : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const PanelDeControl = () => {
  const today = startOfDay(new Date());
  const [range, setRange] = useState<DashboardRange>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const [bestCloserMonthlyOpen, setBestCloserMonthlyOpen] = useState(false);
  const { data, isLoading } = useOperationsDashboard(range);
  const { data: bestCloser, isLoading: bestCloserLoading } = useBestCloser(range);

  const k = data ?? {
    contacted: 0,
    scouterContacts: 0,
    scouterGenerated: 0,
    totalGenerated: 0,
    llgWithPhone: 0,
    scouterWithPhone: 0,
    numbersObtained: 0,
    closerCalls: 0,
    closes: 0,
    onHold: 0,
    rejections: 0,
    enteredCrm: 0,
    crmAltas: 0,
    crmBajas: 0,
    totalLeads: 0,
  };

  // Tasa de números obtenidos / total leads generados (incluye scouter
  // pool — la métrica mide qué % del descubrimiento total tiene número).
  const phoneRate =
    k.totalGenerated > 0
      ? Math.round((k.numbersObtained / k.totalGenerated) * 1000) / 10
      : 0;

  // Bar chart del funnel — todo cross-team. "Contactadas" = LLG+Scouter
  // (= totalLeads). "Núm. obtenidos" = numbersObtained (combinado). La
  // cadena queda monotónicamente decreciente porque numbersObtained es
  // subset de totalLeads, closerCalls subset de numbersObtained, etc.
  const funnelChartData = [
    { stage: "Contactadas",     value: k.totalLeads,       fill: "#3b82f6" },
    { stage: "Núm. obtenidos",  value: k.numbersObtained,  fill: "#06b6d4" },
    { stage: "Llamadas",        value: k.closerCalls,      fill: "#8b5cf6" },
    { stage: "Cierres",         value: k.closes,           fill: "#10b981" },
    { stage: "Mov. CRM (neto)", value: k.crmAltas - k.crmBajas, fill: "#6366f1" },
  ];

  const cards: Array<{
    key: MetricKey;
    label: string;
    value: number;
    icon: React.ReactNode;
    gradient: string;
    hint: string;
  }> = [
    {
      key: "totalLeads",
      label: "Modelos contactadas",
      value: k.totalLeads,
      icon: <Users className="h-5 w-5 text-white" />,
      gradient: "bg-blue-500",
      hint: `LLG: ${k.contacted.toLocaleString("es")} · Scouter: ${k.scouterContacts.toLocaleString("es")}`,
    },
    {
      key: "numbersObtained",
      label: "Números obtenidos",
      value: k.numbersObtained,
      icon: <Phone className="h-5 w-5 text-white" />,
      gradient: "bg-cyan-500",
      hint: "Capturas únicas (leadgen + closer + creator) sin duplicados",
    },
    {
      key: "closerCalls",
      label: "Llamadas para cierre",
      value: k.closerCalls,
      icon: <PhoneCall className="h-5 w-5 text-white" />,
      gradient: "bg-violet-500",
      hint: "Audios subidos al Company QA",
    },
    {
      key: "closes",
      label: "Cierres",
      value: k.closes,
      icon: <CheckCircle2 className="h-5 w-5 text-white" />,
      gradient: "bg-emerald-500",
      hint: "IA marcó la llamada como cerro",
    },
    {
      key: "onHold",
      label: "En espera",
      value: k.onHold,
      icon: <Clock className="h-5 w-5 text-white" />,
      gradient: "bg-amber-500",
      hint: "Modelos pensándolo / no decidieron",
    },
    {
      key: "rejections",
      label: "Rechazos",
      value: k.rejections,
      icon: <XCircle className="h-5 w-5 text-white" />,
      gradient: "bg-rose-500",
      hint: "IA marcó la llamada como no_cerro",
    },
  ];

  // Tasa de cierre = cierres / total de llamadas. "En espera" y "rechazos"
  // ambos cuentan como NO cerrado, así que el denominador correcto es
  // closerCalls (el universo de llamadas) — no `contacted` (que es el
  // funnel arriba, mucho más ancho y produce % engañosamente bajo).
  const conversionRate =
    k.closerCalls > 0 ? Math.round((k.closes / k.closerCalls) * 1000) / 10 : 0;

  // Tasa de números obtenidos sobre CONTACTADAS — qué % de las modelos
  // que efectivamente contactamos terminó con teléfono capturado.
  // Distinto de la hero card "por lead" que usa totalGenerated (pool de
  // descubrimiento). Acá medimos eficiencia del equipo activo.
  const phoneRateContacted =
    k.totalLeads > 0
      ? Math.round((k.numbersObtained / k.totalLeads) * 1000) / 10
      : 0;

  const activeMetricLabel =
    cards.find((c) => c.key === openMetric)?.label ?? "";

  const [tab, setTab] = useState<"modelos" | "chatters" | "cuentas-spammer" | "control-gasto">("modelos");

  return (
    // El layout app envuelve cada page en un wrapper con overflow-hidden.
    // Sin overflow-y-auto acá adentro, el contenido se recorta y la
    // página no scrollea. `flex-1` toma toda la altura disponible.
    <main className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de control</h1>
          <p className="text-sm text-muted-foreground">
            Funnel operativo en tiempo real — desde el contacto LLG hasta ingresos al CRM.
          </p>
        </div>
        <DateRangePicker
          from={range.from}
          to={range.to}
          onApply={(from, to) => setRange({ from, to })}
          placeholder="Seleccionar fechas"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "modelos" | "chatters" | "cuentas-spammer" | "control-gasto")}>
        <TabsList>
          <TabsTrigger value="modelos">Reclutamiento modelos</TabsTrigger>
          <TabsTrigger value="cuentas-spammer" className="gap-1.5">
            <Instagram className="h-3.5 w-3.5" />
            Cuentas spammer
          </TabsTrigger>
          <TabsTrigger value="chatters">Reclutamiento chatters</TabsTrigger>
          <TabsTrigger value="control-gasto">Control de Gasto</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas-spammer" className="mt-4">
          <SpammerAccountsTab />
        </TabsContent>

        <TabsContent value="control-gasto" className="mt-4">
          <ControlGastoTab />
        </TabsContent>

        <TabsContent value="chatters" className="mt-4">
          <ChattersRecruitmentTab range={range} />
        </TabsContent>

        <TabsContent value="modelos" className="mt-4 space-y-5">
      {/* Hero metrics: Total leads + phone rate — destacadas + clickeables */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpenMetric("totalGenerated")}
          className="group relative overflow-hidden rounded-xl border-2 border-indigo-500/30 bg-card p-5 text-left transition-all duration-200 hover:scale-[1.015] hover:border-indigo-500/60 hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.4)]"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30 bg-indigo-500 transition-opacity group-hover:opacity-50" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
              Total leads generados
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {k.totalGenerated.toLocaleString("es")}
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                LLG ({k.contacted.toLocaleString("es")}) + Scouter (
                {k.scouterGenerated.toLocaleString("es")})
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOpenMetric("numbersObtained")}
          className="group relative overflow-hidden rounded-xl border-2 border-cyan-500/30 bg-card p-5 text-left transition-all duration-200 hover:scale-[1.015] hover:border-cyan-500/60 hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.4)]"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30 bg-cyan-500 transition-opacity group-hover:opacity-50" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
              Tasa de números obtenidos por lead
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {phoneRate}
                <span className="text-xl text-muted-foreground">%</span>
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {k.numbersObtained.toLocaleString("es")} de{" "}
                {k.totalGenerated.toLocaleString("es")} leads
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.key}
            metricKey={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            gradient={c.gradient}
            hint={c.hint}
            loading={isLoading}
            onClick={() => setOpenMetric(c.key)}
          />
        ))}

        {/* Tasa de números obtenidos — derived metric, no popup */}
        <Card className="p-4 border-2 border-cyan-500/30 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-cyan-500" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Tasa de números obtenidos
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {phoneRateContacted}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Números / Contactadas ({k.numbersObtained.toLocaleString("es")}/{k.totalLeads.toLocaleString("es")})
              </p>
            </div>
          </div>
        </Card>

        {/* Conversion rate — derived metric, no popup */}
        <Card className="p-4 border-2 border-fuchsia-500/30 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-fuchsia-500" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Tasa de cierre
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {conversionRate}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Cierres / Llamadas ({k.closes}/{k.closerCalls})
              </p>
            </div>
          </div>
        </Card>

        {/* Movimientos del CRM — display custom: altas (↑ verde) + bajas
            (↓ rojo) grandes, neto chico abajo. Click abre el popup con
            los eventos individuales (mismo source que el card via
            creator_blu_history). */}
        <button
          type="button"
          onClick={() => setOpenMetric("enteredCrm")}
          className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
        >
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-indigo-500 transition-opacity group-hover:opacity-50" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Movimientos del CRM
              </p>
              {isLoading ? (
                <Skeleton className="mt-1 h-9 w-32" />
              ) : (
                <div className="flex items-baseline gap-4 mt-1 tabular-nums">
                  <span className="flex items-center text-emerald-500 text-2xl font-bold">
                    <ArrowUp className="h-5 w-5 mr-0.5" />
                    {k.crmAltas.toLocaleString("es")}
                  </span>
                  <span className="flex items-center text-rose-500 text-2xl font-bold">
                    <ArrowDown className="h-5 w-5 mr-0.5" />
                    {k.crmBajas.toLocaleString("es")}
                  </span>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Neto: {(k.crmAltas - k.crmBajas).toLocaleString("es")} · altas / bajas en Blu/Infloww
              </p>
            </div>
          </div>
        </button>

        {/* Mejor cerrador — score compuesto 70% cierres + 30% avg QA.
            Click abre el popup con el ranking por mes. */}
        <button
          type="button"
          onClick={() => setBestCloserMonthlyOpen(true)}
          className="text-left rounded-xl border-2 border-amber-500/30 relative overflow-hidden bg-card p-4 transition-all duration-200 hover:scale-[1.025] hover:border-amber-500/60 hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.4)]"
        >
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-amber-500" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500">
              <Crown className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Mejor cerrador <span className="text-muted-foreground font-normal normal-case">· {format(new Date(), "MMMM yyyy", { locale: es })}</span>
              </p>
              {bestCloserLoading ? (
                <Skeleton className="mt-1 h-7 w-32" />
              ) : bestCloser ? (
                <>
                  <p className="text-xl font-bold leading-tight mt-1 truncate">
                    {bestCloser.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {bestCloser.closes.toLocaleString("es")} cierres · calif promedio {Math.round(bestCloser.avgScore)}/100
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Sin calls en el rango
                </p>
              )}
            </div>
          </div>
        </button>
      </div>

      <BestCloserMonthlyDialog open={bestCloserMonthlyOpen} onOpenChange={setBestCloserMonthlyOpen} />

      {/* Funnel visual flow — cross-team. "Contactadas" = LLG+Scouter. */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Flujo del funnel</h2>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FunnelStep label="Contactadas" value={k.totalLeads} color="text-blue-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Con número" value={k.numbersObtained} color="text-cyan-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Llamadas" value={k.closerCalls} color="text-violet-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Cierres" value={k.closes} color="text-emerald-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Mov. CRM" value={k.crmAltas - k.crmBajas} color="text-indigo-400" />
        </div>
      </Card>

      {/* Bar chart — visualización del funnel en barras */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Distribución por etapa</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={funnelChartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="stage"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detail dialog */}
      <DetailDialog
        open={!!openMetric}
        onOpenChange={(o) => !o && setOpenMetric(null)}
        metric={openMetric}
        metricLabel={activeMetricLabel}
        range={range}
      />
        </TabsContent>
      </Tabs>
    </main>
  );
};

const FunnelStep = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div className="rounded-md border border-border bg-card/40 px-3 py-1.5">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
    <p className={cn("font-bold tabular-nums text-base", color)}>
      {value.toLocaleString("es")}
    </p>
  </div>
);

export default PanelDeControl;
// rebuild cache buster 1778199315
