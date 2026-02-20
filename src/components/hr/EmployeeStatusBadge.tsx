import { cn } from "@/lib/utils";
import { getStatusColors } from "@/lib/hrAreaUtils";
import { EMPLOYEE_STATUS_OPTIONS } from "@/lib/hrConstants";

interface EmployeeStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function EmployeeStatusBadge({ status, className }: EmployeeStatusBadgeProps) {
  const colors = getStatusColors(status);
  const label = EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status ?? "—";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", colors.bg, colors.text, className)}>
      {label}
    </span>
  );
}

export default EmployeeStatusBadge;
