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

interface SubtabNavItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const SubtabNavItem = React.forwardRef<HTMLButtonElement, SubtabNavItemProps>(
  ({ className, active, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors shrink-0",
        active
          ? "bg-primary/15 text-primary ring-1 ring-primary/30 shadow-sm hover:bg-primary/20"
          : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
SubtabNavItem.displayName = "SubtabNavItem";

export { SubtabNav, SubtabNavItem };
