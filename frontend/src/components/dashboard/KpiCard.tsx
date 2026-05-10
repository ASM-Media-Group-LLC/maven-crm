import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  // Tailwind bg-* class (e.g. "bg-blue-500"). Histórico — el componente
  // ahora deriva su versión tinted (bg-…/10) y text-…-500 para el icono.
  // Se mantiene la API para no romper las 17+ páginas que pasan este prop.
  color?: string;
  onClick?: () => void;
  className?: string;
}

// Mapa explícito (string literal) para que Tailwind detecte las clases
// en build time — interpolaciones tipo `bg-${color}/10` no son seguras
// con JIT cuando los valores vienen de props.
const ICON_BG: Record<string, string> = {
  "bg-blue-500": "bg-blue-500/10",
  "bg-rose-500": "bg-rose-500/10",
  "bg-violet-500": "bg-violet-500/10",
  "bg-emerald-500": "bg-emerald-500/10",
  "bg-amber-500": "bg-amber-500/10",
  "bg-slate-500": "bg-slate-500/10",
};
const ICON_FG: Record<string, string> = {
  "bg-blue-500": "text-blue-500",
  "bg-rose-500": "text-rose-500",
  "bg-violet-500": "text-violet-500",
  "bg-emerald-500": "text-emerald-500",
  "bg-amber-500": "text-amber-500",
  "bg-slate-500": "text-slate-500",
};

const KpiCard = ({ label, value, subtitle, icon: Icon, color = "bg-blue-500", onClick, className }: KpiCardProps) => {
  const iconBg = ICON_BG[color] ?? "bg-primary/10";
  const iconFg = ICON_FG[color] ?? "text-primary";

  const inner = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums leading-none tracking-tight">{value}</p>
        {subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`h-[18px] w-[18px] ${iconFg}`} />
      </div>
    </div>
  );

  const baseCls = "relative overflow-hidden rounded-xl border border-border/60 bg-card p-5";
  const interactiveCls = "text-left transition-all duration-200 ease-out hover:border-border hover:-translate-y-0.5 active:translate-y-0";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseCls} ${interactiveCls} ${className ?? ""}`.trim()}
      >
        {inner}
      </button>
    );
  }

  return <div className={`${baseCls} ${className ?? ""}`.trim()}>{inner}</div>;
};

export default KpiCard;
