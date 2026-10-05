import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/useLanguage";

interface EtiquetaApiProps {
  /** El nombre visible de la key («BLU»). Es dato: no se traduce. */
  nombre: string;
  /** La persona dueña de la key, a nombre de quien salió el mensaje. */
  persona: string;
  /** El mensaje es mío: lo mandó MI integración. */
  esMio: boolean;
  /** Sobre la burbuja propia (el degradé): texto claro. */
  sobreColor?: boolean;
  className?: string;
}

/**
 * La pastilla «API» de un mensaje que mandó una integración. Va en cada burbuja,
 * en el hilo, en la búsqueda y en Enlaces, también en los directos y en los
 * mensajes propios: es lo único que distingue a «BLU» de una persona.
 *
 * Al pasar el mouse dice quién lo mandó de verdad. En táctil no hay mouse: un
 * toque la abre y otro la cierra, y ese toque NO llega a la burbuja (que con un
 * toque muestra sus acciones), ni al enlace o al resultado de búsqueda que la
 * contiene.
 *
 * La explicación también va escrita para lectores de pantalla (sr-only), así no
 * depende de abrir el tooltip.
 */
export default function EtiquetaApi({ nombre, persona, esMio, sobreColor = false, className }: EtiquetaApiProps) {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  // Radix cierra el tooltip en el pointerdown, ANTES del click: sin recordar cómo
  // estaba, el click lo volvería a abrir y un segundo toque no lo cerraría nunca.
  const estabaAbiertoRef = useRef(false);
  const explicacion = esMio
    ? t("messenger.api.enviadoPorTuIntegracion", { nombre })
    : t("messenger.api.enviadoPor", { nombre, persona });

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={abierto} onOpenChange={setAbierto}>
        <TooltipTrigger
          asChild
          onPointerDown={() => { estabaAbiertoRef.current = abierto; }}
          onClick={(e) => {
            // preventDefault: que Radix no lo cierre y que un enlace que la
            // contenga no navegue. stopPropagation: que la burbuja no abra sus
            // acciones ni el resultado de búsqueda salte al mensaje.
            e.preventDefault();
            e.stopPropagation();
            setAbierto(!estabaAbiertoRef.current);
            estabaAbiertoRef.current = false;
          }}
        >
          <span
            data-etiqueta-api=""
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-1.5 py-[3px] text-[9px] font-semibold uppercase leading-none tracking-wide cursor-help select-none",
              sobreColor
                ? "border-white/35 bg-white/20 text-white"
                : "border-primary/25 bg-primary/10 text-primary",
              className,
            )}
          >
            {t("messenger.api.etiqueta")}
            <span className="sr-only"> · {explicacion}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {explicacion}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
