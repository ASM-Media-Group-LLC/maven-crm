import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  // Tailwind bg-* class (e.g. "bg-blue-500"). Determina color del icono y
  // del gradient corner. Default: bg-blue-500.
  color?: string;
  onClick?: () => void;
  // Cuando el card no es interactivo (sin onClick) renderiza como <div>.
  className?: string;
}

// Reusable KPI card — patrón estándar Panel de Control / Dashboard v2:
// gradient corner blur + icono cuadrado coloreado + hover lift + tabular-nums.
// Cuando se pasa onClick, el card se vuelve <button> clickeable.
const KpiCard = ({ label, value, subtitle, icon: Icon, color = "bg-blue-500", onClick, className }: KpiCardProps) => {
  const inner = (
    <>
      <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 ${color} transition-opacity group-hover:opacity-50`} />
      <div className="relative space-y-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          {/* Label visible — antes era text-[11px] muted que se perdía
              en cards densos. Ahora text-xs + foreground/80 con peso
              semibold para destacar como título de la card sin competir
              con el value. */}
          <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">{label}</p>
          <p className="text-3xl font-bold tabular-nums leading-tight">{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
    </>
  );

  const baseCls = "group relative overflow-hidden rounded-xl border border-border bg-card p-4";
  const interactiveCls = "text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]";

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
