import { Circle, MinusCircle, Moon, Clock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useOnlinePresence, UserStatus } from "@/hooks/useOnlinePresence";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<UserStatus, { label: string; color: string; icon: typeof Circle }> = {
  available: { label: "Disponible", color: "text-success", icon: Circle },
  busy: { label: "Ocupado", color: "text-destructive", icon: MinusCircle },
  dnd: { label: "No molestar", color: "text-destructive", icon: MinusCircle },
  away: { label: "Ausente", color: "text-warning", icon: Clock },
};

export function getStatusColor(status: UserStatus | null, isOnline: boolean): string {
  if (!isOnline) return "bg-muted-foreground/30";
  switch (status) {
    case "available": return "bg-success";
    case "busy": return "bg-destructive";
    case "dnd": return "bg-destructive";
    case "away": return "bg-warning";
    default: return "bg-success";
  }
}

export function getStatusLabel(status: UserStatus | null, isOnline: boolean): string {
  if (!isOnline) return "Desconectado";
  return STATUS_CONFIG[status || "available"]?.label || "Disponible";
}

export default function StatusPicker() {
  const { myStatus, setMyStatus } = useOnlinePresence();
  const config = STATUS_CONFIG[myStatus];
  const Icon = config.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs rounded-full bg-primary/5 hover:bg-primary/8">
          <Icon className={cn("h-3 w-3 fill-current", config.color)} />
          <span className="text-muted-foreground">{config.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px] rounded-2xl">
        {(Object.entries(STATUS_CONFIG) as [UserStatus, typeof config][]).map(([key, cfg]) => {
          const ItemIcon = cfg.icon;
          return (
            <DropdownMenuItem
              key={key}
              onClick={() => setMyStatus(key)}
              className={cn(myStatus === key && "bg-muted")}
            >
              <ItemIcon className={cn("h-3.5 w-3.5 mr-2 fill-current", cfg.color)} />
              {cfg.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
