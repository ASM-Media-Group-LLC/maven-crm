import { Badge } from "@/components/ui/badge";
import { EMPLOYEE_STATUS_OPTIONS } from "@/lib/hrConstants";
import { cn } from "@/lib/utils";

interface EmployeeStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

const STATUS_VARIANT: Record<string, "success-soft" | "secondary-soft" | "warning-soft" | "destructive-soft" | "primary-soft"> = {
  activo: "success-soft",
  inactivo: "secondary-soft",
  en_licencia: "warning-soft",
  suspendido: "destructive-soft",
  vacaciones: "primary-soft",
};

export function EmployeeStatusBadge({ status, className }: EmployeeStatusBadgeProps) {
  const variant = status ? (STATUS_VARIANT[status] || "secondary-soft") : "secondary-soft";
  const label = EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status ?? "—";
  return (
    <Badge variant={variant} className={cn(className)}>
      {label}
    </Badge>
  );
}

export default EmployeeStatusBadge;
