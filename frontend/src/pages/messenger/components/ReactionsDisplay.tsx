import { cn } from "@/lib/utils";
import { ReactionGroup } from "@/hooks/useReactions";
import { UserProfile } from "../types";
import { profileName } from "../utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReactionsDisplayProps {
  reactions: ReactionGroup[];
  profiles: Record<string, UserProfile>;
  isMe: boolean;
  onToggle: (emoji: string) => void;
}

// Reacciones estilo WhatsApp: pastilla pegada al borde INFERIOR de la burbuja
// (absolute, -bottom-3), con borde + fondo sólido + sombra para que resalte sobre
// la burbuja. El padre (la burbuja) es relative y reserva mb-3 cuando hay reacciones.
export default function ReactionsDisplay({ reactions, profiles, isMe, onToggle }: ReactionsDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className={cn("absolute -bottom-3 z-10 flex flex-wrap gap-1", isMe ? "left-2" : "right-2")}>
      <TooltipProvider delayDuration={200}>
        {reactions.map(r => (
          <Tooltip key={r.emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToggle(r.emoji)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm transition-colors",
                  r.includesMe
                    ? "bg-primary/15 border-primary/40 text-primary hover:bg-primary/25"
                    : "bg-background border-border hover:bg-muted"
                )}
              >
                <span className="text-xs leading-none">{r.emoji}</span>
                {r.count > 1 && <span className="font-medium tabular-nums text-[10px]">{r.count}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              {r.users.map(uid => profileName(profiles[uid])).join(", ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}
