import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";

/** La pastilla de una etiqueta junto al asunto, como en Gmail: el nombre
 *  (con la ruta, «Padre/Hija») sobre el fondo de la etiqueta y en su color de
 *  texto. Sin color = gris del tema, que se lee en claro y en oscuro. */
export default function PastillaEtiqueta({
  nombre, color, className, onQuitar,
}: {
  nombre: string;
  color: ParDeColores | null;
  className?: string;
  /** La × del correo abierto: quita la etiqueta (en «Recibidos», archiva). */
  onQuitar?: () => void;
}) {
  const { t } = useLanguage();
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
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={t("mail.labels.removeNamed", { name: nombre })}
          title={t("mail.labels.removeNamed", { name: nombre })}
          className="-mr-0.5 ml-1 shrink-0 rounded-sm opacity-70 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
