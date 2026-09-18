import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Overlay con blur de fondo — el contenido detrás queda
      // difuminado para que el efecto glass del Dialog tenga sobre
      // qué actuar.
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Estética por default para TODOS los Dialog del proyecto. Tomamos
// el mismo degradado que usa el header de Agency QA (que el user
// validó visualmente): from-primary/15 via-card to-card — tinte de
// color principal en la esquina superior-izquierda que se difumina
// hacia el resto del card.
//
// La X de cerrar:
//   · top-3 right-3 (antes top-4 — sale del header bonito)
//   · z-10 + bg-background/80 backdrop-blur — para que sea legible
//     sobre cualquier contenido y NO se confunda con botones cercanos
//   · padding wrapper más generoso → click area más grande pero sin
//     pisar contenido
/** `sinCerrar`: el diálogo dibuja SU PROPIA X y no quiere esta.
 *
 *  ⚠️ El default es `false` a propósito: los ~60 diálogos de Maven dependen de
 *  que esta X exista. Se pide explícitamente, no se adivina. */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { sinCerrar?: boolean }
>(({ className, children, sinCerrar, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Glass effect: bg semi-opaco sobre card + backdrop-blur-xl
        // para difuminar el contenido detrás + gradient sutil del
        // primary en la esquina + ring blanco apenas perceptible.
        // No queda transparente como vidrio puro — pero no es plano
        // negro tampoco, da profundidad.
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-white/10 bg-card/90 bg-gradient-to-br from-primary/15 via-transparent to-transparent p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl duration-200",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "rounded-3xl",
        className,
      )}
      {...props}
    >
      {children}
      {!sinCerrar && <DialogPrimitive.Close className="absolute right-3 top-3 z-10 rounded-full bg-background/60 p-1.5 opacity-70 backdrop-blur-sm ring-offset-background transition-all hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// pr-10 reserva espacio para la X de cerrar (top-3 right-3 absolute).
// Si el header tiene contenido alineado a la derecha (ej. EXPANDIR /
// COLAPSAR buttons en el panel), antes la X los pisaba.
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left pr-10", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
