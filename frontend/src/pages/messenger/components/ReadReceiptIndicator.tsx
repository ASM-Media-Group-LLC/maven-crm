import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserProfile } from "../types";
import { profileName } from "../utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReadReceiptIndicatorProps {
  isMe: boolean;
  deliveredByUsers: string[];
  readByUsers: string[];
  profiles: Record<string, UserProfile>;
  totalParticipants: number;
}

// Modelo WhatsApp:
//   ✓  gris   = enviado (aún no le llegó a la otra persona)
//   ✓✓ gris   = entregado (le llegó a todos, nadie lo leyó aún)
//   ✓✓ azul   = leído (lo leyeron todos)
export default function ReadReceiptIndicator({ isMe, deliveredByUsers, readByUsers, profiles, totalParticipants }: ReadReceiptIndicatorProps) {
  if (!isMe) return null;

  const othersCount = Math.max(totalParticipants - 1, 1);
  const readCount = readByUsers.length;
  const deliveredCount = deliveredByUsers.length; // leer implica entregar → incluye a los que leyeron
  const allRead = readCount >= othersCount;
  const allDelivered = deliveredCount >= othersCount;

  // Enviado: todavía no le llegó a (todos) los demás → un solo check.
  if (!allDelivered && !allRead) {
    return <Check className="h-3 w-3 text-primary-foreground/50" />;
  }

  const names = (uids: string[]) => uids.map((uid) => profileName(profiles[uid])).join(", ");
  const label = allRead ? `Leído por ${names(readByUsers)}` : `Entregado a ${names(deliveredByUsers)}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CheckCheck className={cn("h-3 w-3", allRead ? "text-blue-300" : "text-primary-foreground/50")} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
