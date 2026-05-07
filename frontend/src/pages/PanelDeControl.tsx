import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subDays,
  subMonths,
  format,
} from "date-fns";
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
  CalendarIcon,
  ArrowRight,
} from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  useOperationsDashboard,
  useMetricDetails,
  type MetricKey,
  type DashboardRange,
} from "@/hooks/useOperationsDashboard";
import { cn } from "@/lib/utils";

// ─── Date range picker custom — inline en el dashboard ─────────────────
// Réplica del estilo del screenshot: presets a la izquierda, calendario
// a la derecha. Los meses son los ÚLTIMOS 6 calculados al render — no
// hardcoded — para que en junio 2026 muestre Jun, May, Apr, Mar, Feb,
// Jan en lugar de los meses fijos.

interface Preset {
  key: string;
  label: string;
  range: () => DashboardRange;
}

function buildPresets(): Preset[] {
  const today = startOfDay(new Date());
  const baseLine: Preset[] = [
    {
      key: "last7",
      label: "Últimos 7 días",
      range: () => ({ from: subDays(today, 6), to: endOfDay(today) }),
    },
    {
      key: "last30",
      label: "Últimos 30 días",
      range: () => ({ from: subDays(today, 29), to: endOfDay(today) }),
    },
    {
      key: "last90",
      label: "Últimos 90 días",
      range: () => ({ from: subDays(today, 89), to: endOfDay(today) }),
    },
    {
      key: "last365",
      label: "Últimos 365 días",
      range: () => ({ from: subDays(today, 364), to: endOfDay(today) }),
    },
    {
      key: "thisYear",
      label: format(today, "yyyy"),
      range: () => ({ from: startOfYear(today), to: endOfYear(today) }),
    },
  ];

  // Últimos 6 meses dinámicos: el actual + 5 anteriores.
  const months: Preset[] = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(today, i);
    return {
      key: `month-${format(d, "yyyy-MM")}`,
      label: format(d, "MMMM", { locale: es }).replace(/^\w/, (c) =>
        c.toUpperCase(),
      ),
      range: () => ({ from: startOfMonth(d), to: endOfMonth(d) }),
    };
  });

  return [...baseLine, ...months];
}

const DateRangeButton = ({
  range,
  onChange,
}: {
  range: DashboardRange;
  onChange: (r: DashboardRange) => void;
}) => {
  const [open, setOpen] = useState(false);
  const presets = useMemo(buildPresets, []);
  const [activePreset, setActivePreset] = useState<string>("month-current");
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    range.from && range.to ? { from: range.from, to: range.to } : undefined,
  );

  const label = useMemo(() => {
    if (range.from && range.to) {
      return `${format(range.from, "d MMM yyyy", { locale: es })} → ${format(
        range.to,
        "d MMM yyyy",
        { locale: es },
      )}`;
    }
    return "Seleccionar fechas";
  }, [range]);

  const apply = (r: DashboardRange, presetKey: string) => {
    setActivePreset(presetKey);
    setDraftRange(r.from && r.to ? { from: r.from, to: r.to } : undefined);
    onChange(r);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-medium">
          <CalendarIcon className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[680px] p-0" align="end">
        <div className="flex">
          {/* Presets column */}
          <div className="w-[180px] border-r border-border p-2 space-y-1">
            <button
              type="button"
              onClick={() => setActivePreset("custom")}
              className={cn(
                "w-full px-3 py-1.5 rounded-md text-sm text-left transition-colors",
                activePreset === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              Custom
            </button>
            {presets.slice(0, 5).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => apply(p.range(), p.key)}
                className={cn(
                  "w-full px-3 py-1.5 rounded-md text-sm text-left transition-colors",
                  activePreset === p.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Months column (last 6, dynamic) */}
          <div className="w-[140px] border-r border-border p-2 space-y-1">
            {presets.slice(5).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => apply(p.range(), p.key)}
                className={cn(
                  "w-full px-3 py-1.5 rounded-md text-sm text-left transition-colors",
                  activePreset === p.key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex-1 p-3">
            <DayPicker
              mode="range"
              numberOfMonths={2}
              selected={draftRange}
              locale={es}
              onSelect={(r) => {
                setDraftRange(r);
                if (r?.from && r?.to) {
                  apply({ from: startOfDay(r.from), to: endOfDay(r.to) }, "custom");
                }
              }}
              className="text-sm"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

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
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
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
  const { data, isLoading } = useMetricDetails(
    metric ?? "contacted",
    range,
    open && !!metric,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{metricLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sin registros en el rango seleccionado.
            </p>
          ) : (
            data.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
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
                  {row.badge && (
                    <Badge variant="outline" className="text-[10px]">
                      {row.badge}
                    </Badge>
                  )}
                  {row.date && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {format(new Date(row.date), "d MMM", { locale: es })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {data && data.length === 100 && (
          <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border/40">
            Mostrando los primeros 100 — si querés todos, exportar desde Reports.
          </p>
        )}
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
  const { data, isLoading } = useOperationsDashboard(range);

  const k = data ?? {
    contacted: 0,
    numbersObtained: 0,
    closerCalls: 0,
    closes: 0,
    onHold: 0,
    rejections: 0,
    enteredCrm: 0,
  };

  const cards: Array<{
    key: MetricKey;
    label: string;
    value: number;
    icon: React.ReactNode;
    gradient: string;
    hint: string;
  }> = [
    {
      key: "contacted",
      label: "Contactados por LLGs",
      value: k.contacted,
      icon: <Users className="h-5 w-5 text-white" />,
      gradient: "bg-blue-500",
      hint: "Cada lead que un LLG ingresó al sistema",
    },
    {
      key: "numbersObtained",
      label: "Números obtenidos",
      value: k.numbersObtained,
      icon: <Phone className="h-5 w-5 text-white" />,
      gradient: "bg-cyan-500",
      hint: "LLG o scouter cargó el teléfono",
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
    {
      key: "enteredCrm",
      label: "Ingresos al CRM",
      value: k.enteredCrm,
      icon: <Building2 className="h-5 w-5 text-white" />,
      gradient: "bg-indigo-500",
      hint: "Closer marcó como ingresada al CRM",
    },
  ];

  const conversionRate =
    k.contacted > 0 ? Math.round((k.closes / k.contacted) * 1000) / 10 : 0;

  const activeMetricLabel =
    cards.find((c) => c.key === openMetric)?.label ?? "";

  return (
    <div className="space-y-5 p-6">
      {/* Header + date range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de control</h1>
          <p className="text-sm text-muted-foreground">
            Funnel operativo en tiempo real — desde el contacto LLG hasta ingresos al CRM.
          </p>
        </div>
        <DateRangeButton range={range} onChange={setRange} />
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

        {/* Conversion rate — derived metric, no popup */}
        <Card className="p-4 border-2 border-fuchsia-500/30 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-fuchsia-500" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Tasa de cierre
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {conversionRate}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Cierres / Contactados
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Funnel visual flow */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Flujo del funnel</h2>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FunnelStep label="Contactados" value={k.contacted} color="text-blue-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Con número" value={k.numbersObtained} color="text-cyan-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Llamadas" value={k.closerCalls} color="text-violet-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Cierres" value={k.closes} color="text-emerald-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Ingresos CRM" value={k.enteredCrm} color="text-indigo-400" />
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
    </div>
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
