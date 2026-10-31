import * as React from "react";

import { cn } from "@/lib/utils";

// Base Card con toque glass: bg semi-transparente + ring blanco sutil
// + degradado super suave. Da profundidad sin perder legibilidad y
// matchea el lenguaje visual de los Dialogs glass. Propaga a 150+
// usos del CRM.
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // SIN backdrop-blur en Card base — combinado con hover:scale en
      // children causa repaint glitchy de cards hermanas. El glass se
      // logra con bg-card/80 + gradient + ring blanco sutil. El blur
      // queda reservado para Dialog/Popover/Sheet donde no hay hover
      // de elementos animados.
      // Vidrio esmerilado como el mockup: frost BLANCO translúcido (se ve el
      // ambiente a través), no una caja oscura. Claro = blanco más opaco; oscuro
      // = frost sutil que levanta la tarjeta del fondo. Blur + filo de luz arriba.
      "rounded-xl border border-white/60 dark:border-white/[0.08] bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl text-card-foreground ring-1 ring-white/50 dark:ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_18px_44px_-16px_rgba(20,30,60,0.22)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_-18px_rgba(0,0,0,0.6)]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
