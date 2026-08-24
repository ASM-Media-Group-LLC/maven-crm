import { Star, TrendingUp, ArrowUpRight, ArrowRight, ArrowDownRight, Users, PhoneCall, Trophy, Phone } from "lucide-react";
import StatChip from "@/components/StatChip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export interface MejorLlg {
  name: string;
  phones: number;
}

interface Props {
  stats: SummaryStats;
  activeFilter?: ActiveFilter;
  onFilterChange?: (filter: ActiveFilter) => void;
  // Mejor LLG del rango (top en `phones`). Si no hay actividad → null.
  mejorLlg?: MejorLlg | null;
  // Etiqueta legible del rango actual ("Mayo 2026", "Últimos 7 días", etc.)
  rangeLabel?: string;
}

// Cards de categorías de leads — patrón estándar KpiCard. Click toggles
// el filtro activo (no abre modal — la lista filtrada vive abajo).
const categoryConfig = [
  { key: "a+", label: "A+", icon: Star, color: "bg-primary" },
  { key: "a", label: "A", icon: TrendingUp, color: "bg-success" },
  { key: "b+", label: "B+", icon: ArrowUpRight, color: "bg-warning" },
  { key: "b", label: "B", icon: ArrowRight, color: "bg-warning" },
  { key: "c", label: "C", icon: ArrowDownRight, color: "bg-muted-foreground" },
];

// Helper para iniciales del avatar — máximo 2 chars en uppercase.
const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Card "hero" para Mejor LLG — span 2 en md, 3 en lg → layout
// horizontal con avatar + nombre completo + métrica destacada. Mismo
// estilo glass que las demás KpiCards (gradient corner + glow ámbar
// para el "trophy").
const MejorLlgCard = ({ data, rangeLabel }: { data: MejorLlg | null; rangeLabel?: string }) => (
  <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-card/60 bg-gradient-to-br from-amber-500/[0.05] to-transparent p-4 ring-1 ring-amber-400/10 md:col-span-2 lg:col-span-3">
    {/* Glow ámbar más fuerte que las demás cards — esta es la métrica destacada */}
    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-amber-500 transition-opacity group-hover:opacity-50" />
    <div className="relative space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500">
          <Trophy className="h-5 w-5 text-white" />
        </div>
        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Mejor LLG</p>
      </div>
      {data ? (
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-amber-500/20 text-amber-200 font-semibold">
              {initials(data.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold leading-tight truncate" title={data.name}>{data.name}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Phone className="h-3.5 w-3.5" />
              <span className="font-semibold text-foreground tabular-nums">{data.phones}</span>
              <span>teléfono{data.phones === 1 ? "" : "s"}</span>
              {rangeLabel && <span className="text-muted-foreground/60">· {rangeLabel}</span>}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin actividad en el rango.</p>
      )}
    </div>
  </div>
);

const LeadGenCantidadCard = ({ stats, activeFilter, onFilterChange, mejorLlg, rangeLabel }: Props) => {
  const { total, qa, byQuality } = stats;

  const handleClick = (key: string) => {
    if (!onFilterChange) return;
    if (activeFilter?.type === "categoria" && activeFilter.value === key) {
      onFilterChange({ type: null, value: null });
    } else {
      onFilterChange({ type: "categoria", value: key });
    }
  };

  // Grid responsive:
  //   · 2 cols mobile (mejor llg span 2, demás 1×7 wraps)
  //   · 4 cols md (mejor llg span 2 + total + qa fila 1, 5 categorías filas 2-3)
  //   · 5 cols lg (mejor llg span 3 + total + qa = fila 1 completa,
  //     5 categorías = fila 2 completa) ← layout balanceado en pantalla grande
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
      {/* Row 1 lg: Mejor LLG (span 3) + Total + QA */}
      <MejorLlgCard data={mejorLlg ?? null} rangeLabel={rangeLabel} />

      <StatChip label="Total" value={formatCompact(total)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" />
      <StatChip label="QA" value={formatCompact(qa)} icon={<PhoneCall className="h-3.5 w-3.5" />} color="bg-primary" />

      {/* Row 2 lg: 5 categorías ocupan toda la fila */}
      {categoryConfig.map((cat) => {
        const count = byQuality[cat.key] ?? 0;
        const isActive = activeFilter?.type === "categoria" && activeFilter.value === cat.key;
        return (
          <StatChip
            key={cat.key}
            label={`Cat. ${cat.label}`}
            value={formatCompact(count)}
            icon={<cat.icon className="h-3.5 w-3.5" />}
            color={cat.color}
            onClick={() => handleClick(cat.key)}
            className={isActive ? "ring-2 ring-primary" : undefined}
          />
        );
      })}
    </div>
  );
};

export default LeadGenCantidadCard;
