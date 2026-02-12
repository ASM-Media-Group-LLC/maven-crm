import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const timePeriods = ["Hoy", "Esta semana", "Este mes"] as const;
export type OverviewPeriod = (typeof timePeriods)[number];

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const formatDateEs = (d: Date) => `${d.getDate().toString().padStart(2, "0")} ${MONTHS_ES[d.getMonth()]}`;

interface Props {
  activePeriod: OverviewPeriod;
  onPeriodChange: (p: OverviewPeriod) => void;
  dateFrom: Date;
  dateTo: Date;
}

const SalesOverviewFilters = ({ activePeriod, onPeriodChange, dateFrom, dateTo }: Props) => (
  <div className="flex items-center justify-between flex-wrap gap-4">
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {timePeriods.map((p) => (
        <button
          key={p}
          onClick={() => onPeriodChange(p)}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            activePeriod === p
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground">
      <Calendar className="h-4 w-4" />
      <span>{formatDateEs(dateFrom)} – {formatDateEs(dateTo)} {dateTo.getFullYear()}</span>
    </div>
  </div>
);

export default SalesOverviewFilters;
