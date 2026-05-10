import { Star, TrendingUp, ArrowUpRight, ArrowRight, ArrowDownRight, Users, PhoneCall } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";
import { formatCompact } from "@/lib/format";

interface ActiveFilter {
  type: "categoria" | "status" | null;
  value: string | null;
}

export interface SummaryStats {
  total: number;
  qa: number;
  byQuality: Record<string, number>;
}

interface Props {
  stats: SummaryStats;
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
}

// Cards de categorías de leads — patrón estándar KpiCard. Click toggles
// el filtro activo (no abre modal — la lista filtrada vive abajo).
const categoryConfig = [
  { key: "a+", label: "A+", icon: Star, color: "bg-blue-500" },
  { key: "a", label: "A", icon: TrendingUp, color: "bg-emerald-500" },
  { key: "b+", label: "B+", icon: ArrowUpRight, color: "bg-amber-500" },
  { key: "b", label: "B", icon: ArrowRight, color: "bg-amber-600" },
  { key: "c", label: "C", icon: ArrowDownRight, color: "bg-slate-500" },
];

const LeadGenCantidadCard = ({ stats, activeFilter, onFilterChange }: Props) => {
  const { total, qa, byQuality } = stats;

  const handleClick = (key: string) => {
    if (!onFilterChange) return;
    if (activeFilter?.type === "categoria" && activeFilter.value === key) {
      onFilterChange({ type: null, value: null });
    } else {
      onFilterChange({ type: "categoria", value: key });
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
      {categoryConfig.map((cat) => {
        const count = byQuality[cat.key] ?? 0;
        const isActive = activeFilter?.type === "categoria" && activeFilter.value === cat.key;
        return (
          <KpiCard
            key={cat.key}
            label={`Cat. ${cat.label}`}
            value={formatCompact(count)}
            icon={cat.icon}
            color={cat.color}
            onClick={() => handleClick(cat.key)}
            className={isActive ? "ring-2 ring-primary" : undefined}
          />
        );
      })}

      <KpiCard label="Total" value={formatCompact(total)} icon={Users} color="bg-violet-500" />
      <KpiCard label="QA" value={formatCompact(qa)} icon={PhoneCall} color="bg-blue-500" />
    </div>
  );
};

export default LeadGenCantidadCard;
