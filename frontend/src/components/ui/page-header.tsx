import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Ícono opcional a la izquierda del título (en un cuadro bg-primary/10). */
  icon?: React.ReactNode;
  /** Acciones a la derecha (botones, filtros). Bajan a otra fila si no entran. */
  actions?: React.ReactNode;
  className?: string;
}

// Encabezado de página CANÓNICO de Maven. Escala de título única (text-2xl font-semibold),
// y layout responsive que evita el cramming: el bloque título/subtítulo no se aplasta
// (shrink-0) y las acciones bajan a una segunda fila (flex-wrap) en vez de exprimir el
// título. Reemplaza los 15+ headers inline con tamaños/pesos dispares.
// `max-w-full`: en un teléfono (390 px) un subtítulo largo hacía que el bloque, al no
// poder encogerse, midiera más que la pantalla y desbordara. Con el tope, envuelve.
/** Aplana fragments: `actions={<><A/><B/></>}` cuenta como dos acciones, no una. */
function aplanar(nodo: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(nodo).flatMap((n) =>
    React.isValidElement(n) && n.type === React.Fragment
      ? aplanar((n.props as { children?: React.ReactNode }).children)
      : [n],
  );
}

/** ¿Este elemento está escondido en el teléfono? La convención de Maven para
 *  las etiquetas de los botones es `className="hidden sm:inline"`: se ocultan
 *  abajo del breakpoint y aparecen desde él. */
const ocultoEnMovil = (clase: unknown): boolean =>
  typeof clase === "string" &&
  /(^|\s)hidden(\s|$)/.test(clase) &&
  /(^|\s)(sm|md|lg|xl):(inline|block|flex|inline-block|inline-flex)(\s|$)/.test(clase);

/** ¿Alguna acción MUESTRA texto en el teléfono? Un botón que allí es solo un
 *  ícono ocupa ~36 px: tres entran de sobra y esconderlos detrás de los tres
 *  puntos solo agrega un toque (y en la hoja quedaban como pastillas vacías,
 *  porque su etiqueta sigue oculta). Uno con texto sí puede no entrar. */
function muestraTextoEnMovil(nodo: React.ReactNode): boolean {
  return React.Children.toArray(nodo).some((n) => {
    if (typeof n === "string") return n.trim().length > 0;
    if (typeof n === "number") return true;
    if (!React.isValidElement(n)) return false;
    const props = n.props as { className?: unknown; children?: React.ReactNode };
    if (ocultoEnMovil(props.className)) return false;
    if (typeof props.className === "string" && /(^|\s)sr-only(\s|$)/.test(props.className)) return false;
    return muestraTextoEnMovil(props.children);
  });
}

export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  const isMobile = useIsMobile();
  const lista = React.useMemo(() => aplanar(actions), [actions]);
  // En el teléfono, más de dos acciones se pliegan detrás de un botón de tres
  // puntos que abre una hoja inferior con todas apiladas (fase 3 del rediseño).
  // Con una o dos, se quedan a la vista como en escritorio.
  //
  // Salvo que TODAS sean solo íconos: ahí entran perfectamente en la fila y
  // plegarlas era peor (Jhon, 10/09 — en Notificaciones los tres botones son
  // ícono puro y la hoja los mostraba como tres pastillas vacías).
  const plegar = isMobile && lista.length > 2 && lista.some(muestraTextoEnMovil);
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      {/* Plegado (teléfono): el bloque del título cede ancho para que el botón de
          tres puntos quede en su misma fila, arriba a la derecha. */}
      <div className={plegar ? "flex min-w-0 flex-1 items-start gap-3" : "flex max-w-full shrink-0 items-start gap-3"}>
        {icon != null && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">{title}</h1>
          {/* div, no p: el subtítulo puede ser una frase o una fila de contexto
              (estado + selector de semana en la Parrilla) sin anidar bloques en un p. */}
          {subtitle != null && (
            <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      {actions != null && !plegar && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
      {actions != null && plegar && (
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="ml-auto shrink-0" aria-label="Más acciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-card pb-safe">
            <SheetHeader className="text-left">
              <SheetTitle className="font-display">Acciones</SheetTitle>
            </SheetHeader>
            {/* En la hoja hay ancho de sobra, así que las etiquetas que el
                botón esconde en el teléfono (`hidden sm:inline`) se muestran:
                si no, cada acción es una pastilla con un ícono y nada más. */}
            <div className="mt-3 flex flex-col gap-2 [&>*]:w-full [&_button]:w-full [&_button]:justify-start [&_span.hidden]:inline">
              {lista}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
