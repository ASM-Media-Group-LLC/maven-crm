import * as React from "react";

import { cn } from "@/lib/utils";

// Estilo base para filas de lista dentro de popups (Dialog/AlertDialog)
// y de cards en general. "Glass liviano": fondo blanco al 5% que
// combina con el degradado del popup sin pelearse — no es vidrio
// puro porque eso muddearía sobre el blur del Dialog, pero deja
// suficiente distinción para que la fila se sienta como card flotando.
//
// `interactive` agrega hover + cursor — uselo cuando la fila completa
// es clickable.
const listRowBase =
  "flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors";

const listRowInteractive =
  "cursor-pointer hover:bg-white/10 hover:border-primary/40";

export interface ListRowProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

const ListRow = React.forwardRef<HTMLDivElement, ListRowProps>(
  ({ className, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(listRowBase, interactive && listRowInteractive, className)}
      {...props}
    />
  ),
);
ListRow.displayName = "ListRow";

export interface ListRowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const ListRowButton = React.forwardRef<HTMLButtonElement, ListRowButtonProps>(
  ({ className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(listRowBase, listRowInteractive, "w-full text-left", className)}
      {...props}
    />
  ),
);
ListRowButton.displayName = "ListRowButton";

// Para casos donde el elemento HTML tiene que ser otro (ej. <label>
// para wrapear un Checkbox). Solo exportamos las clases para que el
// componente pueda construirse manualmente sin perder el diseño base.
export { ListRow, ListRowButton, listRowBase, listRowInteractive };
