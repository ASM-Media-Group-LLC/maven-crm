import { useState } from "react";
import { User, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InlineAssigneeSelectProps {
  taskId: string;
  currentAssignees: string[];
  profiles: { id: string; full_name: string | null }[];
  onUpdateAssignees: (taskId: string, assigneeIds: string[]) => void;
}

const InlineAssigneeSelect = ({ taskId, currentAssignees, profiles, onUpdateAssignees }: InlineAssigneeSelectProps) => {
  const [open, setOpen] = useState(false);
  const assignedProfiles = profiles.filter(p => currentAssignees.includes(p.id));

  const toggle = (uid: string) => {
    const next = currentAssignees.includes(uid)
      ? currentAssignees.filter(id => id !== uid)
      : [...currentAssignees, uid];
    onUpdateAssignees(taskId, next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0.5 min-w-0 max-w-full">
          <div className="flex items-center gap-1 min-w-0">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {assignedProfiles.length > 0 ? (
              <span className="text-xs truncate">
                {assignedProfiles.slice(0, 2).map(p => p.full_name?.split(" ")[0]).join(", ")}
                {assignedProfiles.length > 2 ? ` +${assignedProfiles.length - 2}` : ""}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Sin asignar</span>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <div className="max-h-48 overflow-auto">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={cn(
                "flex items-center gap-2 w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors",
                currentAssignees.includes(p.id) && "bg-accent/50"
              )}
            >
              <div className={cn(
                "h-4 w-4 rounded border border-border flex items-center justify-center shrink-0",
                currentAssignees.includes(p.id) && "bg-primary border-primary"
              )}>
                {currentAssignees.includes(p.id) && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className="truncate">{p.full_name || "Sin nombre"}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default InlineAssigneeSelect;
