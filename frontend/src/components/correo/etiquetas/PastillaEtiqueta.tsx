import { cn } from "@/lib/utils";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";

/** La pastilla de una etiqueta junto al asunto, como en Gmail: el nombre
 *  (con la ruta, «Padre/Hija») sobre el fondo de la etiqueta y en su color de
 *  texto. Sin color = gris del tema, que se lee en claro y en oscuro. */
export default function PastillaEtiqueta({
  nombre, color, className,
}: {
  nombre: string;
  color: ParDeColores | null;
  className?: string;
}) {
  return (
    <span
      title={nombre}
      className={cn(
        "inline-flex max-w-[10rem] shrink-0 items-center truncate rounded px-1.5 text-[11px] font-medium leading-[18px]",
        !color && "bg-muted text-muted-foreground",
        className,
      )}
      style={color ? { backgroundColor: color.fondo, color: color.texto } : undefined}
    >
      <span className="truncate">{nombre}</span>
    </span>
  );
}
