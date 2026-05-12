import * as React from "react";
import { cn } from "@/lib/utils";

// Container y botón estandarizados para los subtabs custom del CRM
// (los que usan navigation con navigate() en vez de Radix Tabs).
// Match exacto con el lenguaje de TabsList/TabsTrigger:
// - Inactive: text-muted-foreground + hover:bg-white/10 + hover:text-fg
// - Active: bg-primary/15 + text-primary + ring-primary/30
//
// Cualquier cambio al look de subtabs ahora se hace una sola vez acá.

const SubtabNav = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1",
        className,
      )}
      {...props}
    />
  ),
);
SubtabNav.displayName = "SubtabNav";

// Utility para aplicar el mismo look a cualquier elemento (Link,
// label, etc.) sin tener que duplicar las clases.
//
// Light vs dark: en dark mode el gradient a baja opacidad (~25-30%)
// + text-white funciona bien. En light mode necesitamos gradient
// saturado (full opacity) para que text-white tenga contraste.
export const subtabNavItemClass = (active: boolean, extraClassName?: string) =>
  cn(
    "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all shrink-0",
    active
      ? "bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 dark:from-sky-500/25 dark:via-blue-500/30 dark:to-indigo-500/25 text-white ring-1 ring-blue-400/60 dark:ring-blue-400/50 shadow-[0_2px_8px_-2px_rgba(59,130,246,0.5)] font-semibold"
      : "text-foreground/70 hover:bg-foreground/5 dark:hover:bg-white/10 hover:text-foreground",
    extraClassName,
  );

interface SubtabNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const SubtabNavItem = React.forwardRef<HTMLButtonElement, SubtabNavItemProps>(
  ({ className, active, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={subtabNavItemClass(!!active, className)}
      {...props}
    />
  ),
);
SubtabNavItem.displayName = "SubtabNavItem";

export { SubtabNav, SubtabNavItem };
