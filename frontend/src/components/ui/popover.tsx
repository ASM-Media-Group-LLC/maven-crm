import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

// ⚠️ z-50 alcanza en una página normal, pero NO adentro de las ventanas
// flotantes de Maven: la sala activa (z-110), el Supervisor Hub (z-120) y la
// ventanita de llamada (z-150) son `fixed` con z-index, así que un menú que se
// abre ahí adentro se portaliza al body y termina DIBUJÁNDOSE DETRÁS del panel.
// Se abre de verdad, pero no se ve — y desde afuera se siente como un botón
// muerto. En esos casos hay que pasarle `className="z-[200]"` al content.
// Acá no se sube porque este z-50 lo comparten 172 diálogos y medio Maven.
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-xl border border-white/10 bg-popover/90 ring-1 ring-white/5 backdrop-blur-xl p-4 text-popover-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
