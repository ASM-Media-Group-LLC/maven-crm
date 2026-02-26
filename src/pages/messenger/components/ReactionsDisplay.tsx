import { cn } from "@/lib/utils";
import { ReactionGroup } from "@/hooks/useReactions";
import { UserProfile } from "../types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReactionsDisplayProps {
  reactions: ReactionGroup[];
  profiles: Record<string, UserProfile>;
  isMe: boolean;
  onToggle: (emoji: string) => void;
}

export default function ReactionsDisplay({ reactions, profiles, isMe, onToggle }: ReactionsDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
      <TooltipProvider delayDuration={200}>
        {reactions.map(r => (
          <Tooltip key={r.emoji}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToggle(r.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors",
                  r.includesMe
                    ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
                    : "bg-muted/60 border-border hover:bg-muted"
                )}
              >
                <span className="text-sm leading-none">{r.emoji}</span>
                <span className="font-medium tabular-nums">{r.count}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              {r.users.map(uid => profiles[uid]?.full_name || "Usuario").join(", ")}
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}
