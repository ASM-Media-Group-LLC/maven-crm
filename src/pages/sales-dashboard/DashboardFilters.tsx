import { Calendar, GitCompareArrows, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const viewTabs = ["Vista General", "Rendimiento por Creadora"] as const;
const timePeriods = ["Ayer", "Hoy", "Esta semana", "Este mes", "Últimos 7 días", "Últimos 30 días", "Últimos 90 días"] as const;

type ViewTab = (typeof viewTabs)[number];
type TimePeriod = (typeof timePeriods)[number] | "Personalizado";

export type EarningsMode = "net" | "gross";

interface DashboardFiltersProps {
  activeView: ViewTab;
  onViewChange: (view: ViewTab) => void;
  activePeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  dateFrom?: Date;
  dateTo?: Date;
  onCustomDateChange?: (from: Date | undefined, to: Date | undefined) => void;
  compareMode?: boolean;
  onToggleCompare?: () => void;
  compareDateFrom?: Date;
  compareDateTo?: Date;
  onCompareDateChange?: (from: Date | undefined, to: Date | undefined) => void;
  earningsMode: EarningsMode;
  onEarningsModeChange: (mode: EarningsMode) => void;
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const formatDateEs = (d: Date) =>
  `${d.getDate().toString().padStart(2, "0")} ${MONTHS_ES[d.getMonth()]}`;

const DashboardFilters = ({
  activeView,
  onViewChange,
  activePeriod,
  onPeriodChange,
  dateFrom,
  dateTo,
  compareMode,
  onToggleCompare,
  compareDateFrom,
  compareDateTo,
  onCompareDateChange,
  earningsMode,
  onEarningsModeChange,
}: DashboardFiltersProps) => {
  const handleViewChange = (tab: ViewTab) => {
    onViewChange(tab);
  };

  const dateLabel =
    dateFrom && dateTo
      ? `${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)} ${dateTo.getFullYear()}`
      : "Seleccione un período";

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="inline-flex rounded-lg bg-muted/50 p-1">
        {viewTabs.map((tab) => (
          <Button
            key={tab}
            variant={activeView === tab ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleViewChange(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>

      {/* Time filters + date range + compare */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="inline-flex rounded-lg bg-muted/50 p-1">
          {timePeriods.map((period) => (
            <Button
              key={period}
              variant={activePeriod === period ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onPeriodChange(period)}
            >
              {period}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {compareMode ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Periodo A:</span>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{dateLabel}</span>
                </div>
              </div>
              <span className="text-xs font-bold text-muted-foreground">vs</span>
              {onCompareDateChange && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Periodo B:</span>
                  <DateRangePicker
                    from={compareDateFrom}
                    to={compareDateTo}
                    onApply={onCompareDateChange}
                    placeholder="Seleccionar periodo B"
                    className="h-9 text-sm"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{dateLabel}</span>
            </div>
          )}
          <Select value={earningsMode} onValueChange={(v) => onEarningsModeChange(v as EarningsMode)}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="net">Net Earnings</SelectItem>
              <SelectItem value="gross">Gross Earnings</SelectItem>
            </SelectContent>
          </Select>
          {onToggleCompare && (
            <Button
              variant={compareMode ? "destructive" : "outline"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onToggleCompare}
            >
              {compareMode ? (
                <>
                  <X className="h-3.5 w-3.5" /> Cerrar
                </>
              ) : (
                <>
                  <GitCompareArrows className="h-3.5 w-3.5" /> Comparar
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardFilters;
export type { ViewTab, TimePeriod };
