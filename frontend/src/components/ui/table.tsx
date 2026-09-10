import * as React from "react";

import { cn } from "@/lib/utils";

// TABLA RESPONSIVE (fase 5 del rediseño, 09/2026). A menos de 768 px una tabla
// de 6 columnas no cabe en 390 px y arrastrarla de lado es la peor salida. En vez
// de reescribir 89 pantallas, la Table de shadcn se vuelve TARJETAS sola:
//   - el <thead> se oculta (sigue en el DOM: de ahí salen los rótulos),
//   - cada <tr> del cuerpo es una tarjeta (borde, radio de panel, fondo card),
//   - cada <td> es una fila "rótulo · valor": el rótulo es el texto del <th> de
//     su columna, que TableCell lee del DOM y guarda en data-label.
// En escritorio (≥768) no cambia un píxel: todas las clases llevan `max-md:`.
// Una celda con colSpan (estados vacíos, "cargando") se muestra completa y
// centrada, sin rótulo.

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn("relative w-full overflow-x-auto", containerClassName)}>
      <table ref={ref} className={cn("w-full caption-bottom text-sm max-md:block", className)} {...props} />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b max-md:hidden", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0 max-md:block max-md:space-y-2", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0 max-md:block", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        // hover suave + selected con tinte primary — antes era
        // bg-muted que se sentía pesado.
        "border-b border-white/[0.06] transition-colors data-[state=selected]:bg-primary/10 hover:bg-white/[0.04]",
        // Teléfono: la fila es una tarjeta.
        "max-md:block max-md:rounded-panel max-md:border max-md:border-border max-md:bg-card max-md:px-3 max-md:py-2",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-xs text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, colSpan, ...props }, ref) => {
    const propio = React.useRef<HTMLTableCellElement | null>(null);
    const asignarRef = (el: HTMLTableCellElement | null) => {
      propio.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLTableCellElement | null>).current = el;
    };
    // El rótulo de la columna sale del <th> con el mismo índice, leído del DOM
    // (acceso directo por índice, sin querySelector): así funciona en las 89
    // tablas sin que ninguna tenga que declararlo. Se recalcula en cada render
    // por si cambian las columnas; es un acceso a propiedad, no cuesta.
    React.useLayoutEffect(() => {
      const td = propio.current;
      if (!td) return;
      if (colSpan && colSpan > 1) {
        td.removeAttribute("data-label");
        td.setAttribute("data-full", "");
        return;
      }
      td.removeAttribute("data-full");
      const th = td.closest("table")?.tHead?.rows[0]?.cells[td.cellIndex];
      const rotulo = th?.textContent?.trim() ?? "";
      if (rotulo) td.setAttribute("data-label", rotulo);
      else td.removeAttribute("data-label");
    });
    return (
      <td
        ref={asignarRef}
        colSpan={colSpan}
        className={cn(
          "p-4 align-middle [&:has([role=checkbox])]:pr-0",
          // Teléfono: fila "rótulo · valor" dentro de la tarjeta.
          "max-md:flex max-md:items-start max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1.5",
          "max-md:before:shrink-0 max-md:before:pt-0.5 max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
          "max-md:[&:not([data-label])]:before:hidden max-md:[&[data-full]]:block max-md:[&[data-full]]:text-center",
          className,
        )}
        {...props}
      />
    );
  },
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
