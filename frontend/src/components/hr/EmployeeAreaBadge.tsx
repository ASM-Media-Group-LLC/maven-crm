import { cn } from "@/lib/utils";
import { getDepartmentColors } from "@/lib/hrAreaUtils";

interface EmployeeAreaBadgeProps {
  departmentName: string | null | undefined;
  departmentCode: string | null | undefined;
  className?: string;
}

export function EmployeeAreaBadge({ departmentName, departmentCode, className }: EmployeeAreaBadgeProps) {
  const colors = getDepartmentColors(departmentCode);
  if (!departmentName) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", colors.bg, colors.text, colors.border, className)}>
      {departmentName}
    </span>
  );
}

export default EmployeeAreaBadge;
