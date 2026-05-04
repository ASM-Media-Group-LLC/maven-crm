import { Ban } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface TaskBlockerBadgeProps {
  count: number;
}

const TaskBlockerBadge = ({ count }: TaskBlockerBadgeProps) => {
  if (count === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 text-destructive">
          <Ban className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">{count}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{count} bloqueo{count > 1 ? "s" : ""} activo{count > 1 ? "s" : ""}</TooltipContent>
    </Tooltip>
  );
};

export default TaskBlockerBadge;
