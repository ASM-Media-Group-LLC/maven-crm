import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

// Maven tiene DOS sistemas de avisos en paralelo (este, de Radix, y sonner) y
// los dos se usan en más de cien archivos. Se estilan igual a propósito: si no,
// media aplicación avisa de una forma y media de otra, y se nota.
// El vidrio, la barra de color a la izquierda y el padding salen del mismo
// criterio que `components/ui/sonner.tsx` — ver ahí el por qué de cada cosa.
const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-hidden",
    "rounded-2xl border border-white/10 p-4 pl-5 pr-9 transition-all",
    "bg-card/70 backdrop-blur-2xl shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)]",
    // La barra de color de la izquierda; el color lo pone cada variante.
    "before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out",
    "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
    "data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "text-foreground before:bg-primary/70",
        destructive: [
          // Se mantiene la clase `destructive` porque los hijos (título,
          // descripción, botón de cerrar) la usan para su propio color.
          "destructive group text-foreground before:bg-red-500",
          "shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(239_68_68_/_0.8)]",
        ].join(" "),
        success: [
          "text-foreground before:bg-emerald-500",
          "shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(16_185_129_/_0.75)]",
        ].join(" "),
        warning: [
          "text-foreground before:bg-amber-500",
          "shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(245_158_11_/_0.75)]",
        ].join(" "),
        info: [
          "text-foreground before:bg-sky-500",
          "shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(14_165_233_/_0.7)]",
        ].join(" "),
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors group-[.destructive]:border-muted/40 hover:bg-secondary group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 group-[.destructive]:focus:ring-destructive disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      [
        "absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full",
        "border border-white/10 bg-white/10 text-foreground/70 backdrop-blur-md transition-colors",
        "hover:bg-white/20 hover:text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary",
        "group-[.destructive]:text-red-200 group-[.destructive]:hover:text-white",
      ].join(" "),
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn("text-[13.5px] font-semibold leading-tight", className)} {...props} />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn("text-[12.5px] leading-snug text-muted-foreground", className)} {...props} />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
