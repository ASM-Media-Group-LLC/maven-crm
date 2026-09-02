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
   *    (azul sobre azul) → acá va dorado brillante (amber-300).
   *  - "onSurface": fondo claro/card (hilos). Ahí el dorado claro no contrasta → dorado
   *    más oscuro (amber-600). */
  variant?: "onPrimary" | "onSurface";
}

// Modelo WhatsApp (el color del "leído" cambia según el fondo, ver `variant`):
//   ✓  tenue   = enviado (aún no le llegó a la otra persona)
//   ✓✓ tenue   = entregado (le llegó a todos, nadie lo leyó aún)
//   ✓✓ dorado  = leído (lo leyeron todos) — amber-300 sobre la burbuja azul, amber-600 sobre fondo claro
export default function ReadReceiptIndicator({ isMe, deliveredByUsers, readByUsers, profiles, totalParticipants, variant = "onPrimary" }: ReadReceiptIndicatorProps) {
  if (!isMe) return null;

  const palette = variant === "onSurface"
    ? { dim: "text-muted-foreground", read: "text-amber-600" }
    : { dim: "text-primary-foreground/50", read: "text-amber-300" };

  const othersCount = Math.max(totalParticipants - 1, 1);
  const readCount = readByUsers.length;
  const deliveredCount = deliveredByUsers.length; // leer implica entregar → incluye a los que leyeron
  const allRead = readCount >= othersCount;
  const allDelivered = deliveredCount >= othersCount;

  const names = (uids: string[]) => uids.map((uid) => profileName(profiles[uid])).join(", ");
  // ✓ simple = enviado (todavía no llegó al navegador de la otra persona). Antes no
  // tenía tooltip y se leía como "entregado": esa confusión fue el reporte de
  // Jackeline con Fabiana (que salía "Disponible" pero tenía la app en segundo plano).
  const sentOnly = !allDelivered && !allRead;
  const label = sentOnly
    ? "Enviado · aún no le llegó"
    : allRead ? `Leído por ${names(readByUsers)}` : `Entregado a ${names(deliveredByUsers)}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            {sentOnly
              ? <Check className={cn("h-3 w-3", palette.dim)} />
              : <CheckCheck className={cn("h-3 w-3", allRead ? palette.read : palette.dim)} />}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
