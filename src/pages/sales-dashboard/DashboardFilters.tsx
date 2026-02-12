import { useNavigate } from "react-router-dom";
import { Calendar, GitCompareArrows, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";

const viewTabs = ["Vista General", "Rendimiento por Creadora"] as const;
const timePeriods = ["Ayer", "Hoy", "Esta semana", "Este mes"] as const;

type ViewTab = (typeof viewTabs)[number];
type TimePeriod = (typeof timePeriods)[number];

interface DashboardFiltersProps {
  activeView: ViewTab;
  onViewChange: (view: ViewTab) => void;
  activePeriod: TimePeriod;
  onPeriodChange: (period: TimePeriod) => void;
  dateFrom?: Date;
  dateTo?: Date;
  compareMode?: boolean;
  onToggleCompare?: () => void;
  compareDateFrom?: Date;
  compareDateTo?: Date;
  onCompareDateChange?: (from: Date | undefined, to: Date | undefined) => void;
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
}: DashboardFiltersProps) => {
  const navigate = useNavigate();

  const handleViewChange = (tab: ViewTab) => {
    if (tab === "Rendimiento por Creadora") {
      navigate("/salesperformancecreator");
      return;
    }
    onViewChange(tab);
  };

  const dateLabel =
    dateFrom && dateTo
      ? `${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)} ${dateTo.getFullYear()}`
      : "Seleccione un período";

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {viewTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => handleViewChange(tab)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeView === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Time filters + date range + compare */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {timePeriods.map((period) => (
            <button
              key={period}
              onClick={() => onPeriodChange(period)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activePeriod === period
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {period}
            </button>
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
          <select className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground outline-none">
            <option>Net Earnings</option>
            <option>Gross Earnings</option>
          </select>
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
