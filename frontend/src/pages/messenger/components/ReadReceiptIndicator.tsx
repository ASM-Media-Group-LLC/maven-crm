import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserProfile } from "../types";
import { profileName } from "../utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";

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
//   ✓✓ marcado  = leído (lo leyeron todos)
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
// quien no distinga colores (o mire de reojo) no la vería. Dos señales.
//
// Se probó agregar la palabra "Visto" al lado y el owner la descartó: ensucia el
// pie de cada burbuja propia. La palabra sigue estando donde no molesta — en el
// tooltip, que además dice QUIÉN lo leyó.
export default function ReadReceiptIndicator({ isMe, deliveredByUsers, readByUsers, profiles, totalParticipants, variant = "onPrimary" }: ReadReceiptIndicatorProps) {
  const { t } = useLanguage();
  if (!isMe) return null;

  const palette = variant === "onSurface"
    ? { dim: "text-muted-foreground", read: "text-foreground" }
    : { dim: "text-white/55", read: "text-white" };

  const othersCount = Math.max(totalParticipants - 1, 1);
  const readCount = readByUsers.length;
  const deliveredCount = deliveredByUsers.length; // leer implica entregar → incluye a los que leyeron
  const esGrupo = othersCount > 1;
  const allRead = readCount >= othersCount;
  const allDelivered = deliveredCount >= othersCount;

  // ⚠️ EN GRUPOS NO SE PUEDE EXIGIR QUE LLEGUE A TODOS.
  //
  // Exigir los 20 destinatarios es exigir que los 20 estén conectados a la vez,
  // y eso no pasa nunca. Medido el 17/09: de 49 mensajes de grupo, CERO llegaron
  // a ✓✓ —ni gris— aunque el promedio fuera de 7,7 entregados y 3,2 leídos, con
  // picos de 8. O sea que a los 49 les decía "aún no le llegó" mientras ocho
  // personas ya lo habían leído. Eso es lo que se veía "impreciso".
  //
  // Con que le haya llegado a alguien, "aún no le llegó" es FALSO. En chats
  // directos no cambia nada: ahí `othersCount` es 1, así que "alguno" y "todos"
  // son lo mismo.
  const hayEntrega = esGrupo ? deliveredCount > 0 : allDelivered;

  const names = (uids: string[]) => uids.map((uid) => profileName(profiles[uid], t("messenger.usuario"))).join(", ");
  // ✓ simple = enviado (todavía no llegó al navegador de la otra persona). Antes no
  // tenía tooltip y se leía como "entregado": esa confusión fue el reporte de
  // Jackeline con Fabiana (que salía "Disponible" pero tenía la app en segundo plano).
  const sentOnly = !hayEntrega && !allRead;
  // En grupos el tooltip lleva la cuenta: "Leído por 3 de 20" dice la verdad, y
  // la lista de nombres de veinte personas no cabe ni sirve.
  const label = sentOnly
    ? t("messenger.receipt.enviado")
    : esGrupo
      ? (readCount > 0
          ? (deliveredCount > readCount
              ? t("messenger.receipt.leidoPorDeEntregado", { n: readCount, total: othersCount, entregados: deliveredCount })
              : t("messenger.receipt.leidoPorDe", { n: readCount, total: othersCount }))
          : t("messenger.receipt.entregadoADe", { n: deliveredCount, total: othersCount }))
      : allRead
        ? t("messenger.receipt.leidoPor", { nombres: names(readByUsers) })
        : t("messenger.receipt.entregadoA", { nombres: names(deliveredByUsers) });

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
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
