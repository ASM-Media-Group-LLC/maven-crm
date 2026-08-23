import { LucideIcon } from "lucide-react";
import StatChip from "@/components/StatChip";

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

// Mapeo de los colores semánticos viejos al puntito del StatChip. Mantener
// este mapping permite que todas las páginas HR que consumen HRMetricCard
// (Training/Chatters/Tech/Performance/Organigrama, etc.) hereden el diseño
// nuevo sin modificar cada llamada.
const colorMap: Record<NonNullable<HRMetricCardProps["color"]>, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  default: "bg-muted-foreground",
};

export function HRMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "default",
  className,
  onClick,
}: HRMetricCardProps) {
  const hint = trend
    ? `${subtitle ? subtitle + " · " : ""}${trend.value >= 0 ? "+" : ""}${trend.value} ${trend.label}`
    : subtitle;

  return (
    <StatChip
      label={title}
      value={value}
      icon={<Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      color={colorMap[color]}
      hint={hint}
      onClick={onClick}
      className={className}
    />
  );
}

export default HRMetricCard;
