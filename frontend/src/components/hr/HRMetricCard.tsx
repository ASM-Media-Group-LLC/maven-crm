import { LucideIcon } from "lucide-react";
import KpiCard from "@/components/dashboard/KpiCard";

interface HRMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  color?: "primary" | "success" | "warning" | "destructive" | "default";
  className?: string;
  onClick?: () => void;
}

// Mapeo de los colores semánticos viejos a las clases bg-* que usa
// KpiCard. Mantener este mapping permite que todas las páginas HR
// (Training/Chatters/Tech/Performance/Organigrama, etc.) hereden el
// nuevo diseño sin modificar cada llamada.
const colorMap: Record<NonNullable<HRMetricCardProps["color"]>, string> = {
  primary: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  destructive: "bg-rose-500",
  default: "bg-slate-500",
};

export function HRMetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = "default",
  className,
  onClick,
}: HRMetricCardProps) {
  // El "trend" del API viejo se renderiza como subtitle anexado, ya que
  // KpiCard solo tiene 1 línea de subtitle.
  const sub = trend
    ? `${subtitle ? subtitle + " · " : ""}${trend.value >= 0 ? "+" : ""}${trend.value} ${trend.label}`
    : subtitle;

  return (
    <KpiCard
      label={title}
      value={value}
      icon={icon}
      color={colorMap[color]}
      subtitle={sub}
      onClick={onClick}
      className={className}
    />
  );
}

export default HRMetricCard;
