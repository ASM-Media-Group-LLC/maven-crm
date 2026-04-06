import { useState } from "react";
import { User, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
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
      <PopoverContent className="w-56 p-0" align="start" side="bottom">
        <Command>
          <CommandInput placeholder="Buscar usuario..." />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {profiles.slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.full_name || "Sin nombre"}
                  onSelect={() => toggle(p.id)}
                  className="cursor-pointer"
                >
                  <div className={cn(
                    "h-4 w-4 rounded border border-border flex items-center justify-center shrink-0 mr-2",
                    currentAssignees.includes(p.id) && "bg-primary border-primary"
                  )}>
                    {currentAssignees.includes(p.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <span className="truncate">{p.full_name || "Sin nombre"}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default InlineAssigneeSelect;
