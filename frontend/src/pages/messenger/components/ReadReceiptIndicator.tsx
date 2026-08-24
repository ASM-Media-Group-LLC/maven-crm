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
  /** Fondo sobre el que se pinta el check, para elegir colores que contrasten:
   *  - "onPrimary": burbuja propia azul→violeta (Messenger). El "leído" en azul NO se veía
   *    (azul sobre azul) → acá va cyan/aqua brillante.
   *  - "onSurface": fondo claro/card (hilos). Ahí sí funciona el azul clásico tipo WhatsApp. */
  variant?: "onPrimary" | "onSurface";
}

// Modelo WhatsApp (el color del "leído" cambia según el fondo, ver `variant`):
//   ✓  tenue   = enviado (aún no le llegó a la otra persona)
//   ✓✓ tenue   = entregado (le llegó a todos, nadie lo leyó aún)
//   ✓✓ color   = leído (lo leyeron todos) — cyan sobre la burbuja azul, azul sobre fondo claro
export default function ReadReceiptIndicator({ isMe, deliveredByUsers, readByUsers, profiles, totalParticipants, variant = "onPrimary" }: ReadReceiptIndicatorProps) {
  if (!isMe) return null;

  const palette = variant === "onSurface"
    ? { dim: "text-muted-foreground", read: "text-sky-500" }
    : { dim: "text-primary-foreground/50", read: "text-cyan-300" };

  const othersCount = Math.max(totalParticipants - 1, 1);
  const readCount = readByUsers.length;
  const deliveredCount = deliveredByUsers.length; // leer implica entregar → incluye a los que leyeron
  const allRead = readCount >= othersCount;
  const allDelivered = deliveredCount >= othersCount;

  // Enviado: todavía no le llegó a (todos) los demás → un solo check.
  if (!allDelivered && !allRead) {
    return <Check className={cn("h-3 w-3", palette.dim)} />;
  }

  const names = (uids: string[]) => uids.map((uid) => profileName(profiles[uid])).join(", ");
  const label = allRead ? `Leído por ${names(readByUsers)}` : `Entregado a ${names(deliveredByUsers)}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <CheckCheck className={cn("h-3 w-3", allRead ? palette.read : palette.dim)} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
