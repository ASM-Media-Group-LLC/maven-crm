import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserProfile } from "../types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReadReceiptIndicatorProps {
  isMe: boolean;
  readByUsers: string[];
  profiles: Record<string, UserProfile>;
  totalParticipants: number;
}

export default function ReadReceiptIndicator({ isMe, readByUsers, profiles, totalParticipants }: ReadReceiptIndicatorProps) {
  if (!isMe) return null;

  const readCount = readByUsers.length;
  // -1 because we don't count self
  const othersCount = Math.max(totalParticipants - 1, 1);
  const allRead = readCount >= othersCount;

  if (readCount === 0) {
    return <Check className="h-3 w-3 text-primary-foreground/50" />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CheckCheck className={cn("h-3 w-3", allRead ? "text-blue-300" : "text-primary-foreground/50")} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {readCount > 0
            ? `Visto por ${readByUsers.map(uid => profiles[uid]?.full_name || "Usuario").join(", ")}`
            : "Enviado"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
