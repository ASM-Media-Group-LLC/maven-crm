import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

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
  // Footer arbitrario debajo del subtitle — útil para mostrar chips
  // ("Promocionaron: 5 · No promocionaron: 3") en lugar del subtitle
  // plano. Si se pasa, reemplaza al subtitle.
  footer?: ReactNode;
}

// Reusable KPI card — patrón estándar Panel de Control / Dashboard v2:
// gradient corner blur + icono cuadrado coloreado + hover lift + tabular-nums.
// Cuando se pasa onClick, el card se vuelve <button> clickeable.
const KpiCard = ({ label, value, subtitle, icon: Icon, color = "bg-blue-500", onClick, className, footer }: KpiCardProps) => {
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
          {footer ? (
            <div className="mt-1.5">{footer}</div>
          ) : subtitle ? (
            <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </>
  );

  // Base con tinte glass — bg-card/60 + ring blanco sutil + degradado
  // de fondo. NO usamos backdrop-blur acá porque combinado con
  // hover:scale causa repaint glitchy de cards hermanas en Chrome.
  // El glow del corner accent ya da profundidad suficiente.
  const baseCls = "group relative overflow-hidden rounded-xl border border-white/10 bg-card/60 bg-gradient-to-br from-white/[0.03] to-transparent p-4 ring-1 ring-white/5";
  // Hover suave: solo color de border + ring primario, sin scale ni
  // shadow grande (el shadow glow desbordado causaba jitter visual
  // en las cards hermanas). transition-colors limita lo que anima.
  const interactiveCls = "cursor-pointer text-left transition-colors duration-200 hover:border-primary/40 hover:ring-primary/20 active:opacity-90";

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
