import { Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { priorityConfig } from "./PrioritySelect";

interface InlinePrioritySelectProps {
  taskId: string;
  currentPriority: string;
  onPatch: (taskId: string, fields: Record<string, any>) => void;
}

const priorities = ["low", "medium", "high", "urgent"] as const;

const InlinePrioritySelect = ({ taskId, currentPriority, onPatch }: InlinePrioritySelectProps) => {
  const current = priorityConfig[currentPriority] || priorityConfig.medium;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0">
          <Badge className={`${current.badgeClass} text-[10px] cursor-pointer`}>
            <Flag className={`h-2.5 w-2.5 mr-1 ${current.color}`} />
            {current.label}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {priorities.map((key) => {
          const cfg = priorityConfig[key];
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => onPatch(taskId, { priority: key })}
              className={key === currentPriority ? "bg-accent" : ""}
            >
              <Flag className={`mr-2 h-3.5 w-3.5 ${cfg.color}`} />
              {cfg.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default InlinePrioritySelect;
