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
  /** Fondo sobre el que se pinta el check:
   *  - "onPrimary": la burbuja propia (degradé accent→primary, texto blanco).
   *  - "onSurface": fondo claro/card (hilos). */
  variant?: "onPrimary" | "onSurface";
}

// Modelo WhatsApp:
//   ✓  tenue    = enviado (aún no le llegó a la otra persona)
//   ✓✓ tenue    = entregado (le llegó a todos, nadie lo leyó aún)
//   ✓✓ marcado + "Visto" = leído (lo leyeron todos)
//
// ⚠️ EL "LEÍDO" NO LLEVA UN COLOR PROPIO, y es a propósito.
//
// Antes era `amber-300` fijo, elegido cuando Maven no tenía skins. Con los diez
// skins actuales la burbuja propia cambia de color, y medido contra el extremo
// del degradé donde cae el check (`primary`, abajo a la derecha) el dorado da
// 2,75:1 en el skin por DEFECTO —por debajo del mínimo de 3:1 para iconos— y
// entre 3,1 y 4,3 en el resto, o sea raspando. Peor: el contraste solo mide
// luminosidad, no tono; en `dorado`, `kash` y `atardecer` el ámbar tiene casi el
// mismo tono que la burbuja y se lee como "el mismo color" aunque el número dé
// 3,6.
//
// Tampoco se ata al color del skin: la burbuja ES un degradé accent→primary, así
// que usar el accent garantiza un check invisible sobre su propio fondo — el
// mismo error de origen con otro color.
//
// La solución es derivarlo de lo único que la burbuja ya garantiza legible: su
// propio color de texto (blanco, 3,97-6,14:1 en los diez skins). El "leído" es
// el texto a plena intensidad y con el trazo más grueso; lo demás va al 55%. Es
// a prueba de skins POR CONSTRUCCIÓN: cualquier skin donde el mensaje se lea
// deja el check legible, y un skin nuevo no puede reintroducir el problema.
//
// El grosor no es decorativo: sin él la diferencia sería solo de opacidad, y
// quien no distinga colores (o mire de reojo) no la vería.
//
// Y encima del color y del grosor va la PALABRA "Visto", que es la señal que no
// admite interpretación: no depende del skin, ni del tema, ni de distinguir dos
// tonos de blanco, ni de acordarse de qué significan una o dos palomitas. El
// tooltip con los nombres se queda para el detalle de quién lo leyó.
export default function ReadReceiptIndicator({ isMe, deliveredByUsers, readByUsers, profiles, totalParticipants, variant = "onPrimary" }: ReadReceiptIndicatorProps) {
  if (!isMe) return null;

  const palette = variant === "onSurface"
    ? { dim: "text-muted-foreground", read: "text-foreground" }
    : { dim: "text-white/55", read: "text-white" };

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
          <span className={cn("inline-flex items-center gap-0.5", allRead && palette.read)}>
            {allRead && <span className="text-[10px] font-semibold leading-none">Visto</span>}
            {sentOnly
              ? <Check className={cn("h-3 w-3", palette.dim)} />
              : (
                <CheckCheck
                  className={cn("h-3 w-3", allRead ? palette.read : palette.dim)}
                  strokeWidth={allRead ? 3 : 2}
                />
              )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
