import {
  Ticket,
  LifeBuoy,
  AlertTriangle,
  Banknote,
  Camera,
  HeartHandshake,
  Laptop,
  MessageSquare,
  Scale,
  ShieldAlert,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Presentación de las tarjetas de plantilla. Vive aparte de los componentes
 * para no romper el fast refresh de Vite (un archivo que exporta un componente
 * no debería exportar además constantes).
 */

/**
 * Catálogo cerrado de iconos. A propósito no se resuelve lucide por nombre
 * dinámico: eso mete el paquete entero en el bundle.
 */
export const FORM_ICONS: Record<string, LucideIcon> = {
  Ticket,
  LifeBuoy,
  AlertTriangle,
  Banknote,
  Camera,
  HeartHandshake,
  Laptop,
  MessageSquare,
  Scale,
  ShieldAlert,
  UserRound,
  Wrench,
};

/**
 * Paleta cerrada con clases literales, para que Tailwind no las purgue.
 *
 * `wrap`/`icon` son la superficie tenue del chip del icono. `bar` es el color
 * SOLIDO de la banda del encabezado y del borde de la tarjeta seleccionada: un
 * tono de superficie ahi no se ve sobre fondo oscuro.
 */
export const FORM_COLORS: Record<
  string,
  { wrap: string; icon: string; bar: string; ring: string }
> = {
  slate: {
    wrap: "bg-slate-100 dark:bg-slate-800", icon: "text-slate-600 dark:text-slate-300",
    bar: "bg-slate-500", ring: "border-l-slate-500",
  },
  red: {
    wrap: "bg-red-100 dark:bg-red-950", icon: "text-red-600 dark:text-red-400",
    bar: "bg-red-500", ring: "border-l-red-500",
  },
  orange: {
    wrap: "bg-orange-100 dark:bg-orange-950", icon: "text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500", ring: "border-l-orange-500",
  },
  amber: {
    wrap: "bg-amber-100 dark:bg-amber-950", icon: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500", ring: "border-l-amber-500",
  },
  green: {
    wrap: "bg-green-100 dark:bg-green-950", icon: "text-green-600 dark:text-green-400",
    bar: "bg-green-500", ring: "border-l-green-500",
  },
  blue: {
    wrap: "bg-blue-100 dark:bg-blue-950", icon: "text-blue-600 dark:text-blue-400",
    bar: "bg-blue-500", ring: "border-l-blue-500",
  },
  violet: {
    wrap: "bg-violet-100 dark:bg-violet-950", icon: "text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500", ring: "border-l-violet-500",
  },
  pink: {
    wrap: "bg-pink-100 dark:bg-pink-950", icon: "text-pink-600 dark:text-pink-400",
    bar: "bg-pink-500", ring: "border-l-pink-500",
  },
};

/**
 * Lienzo del editor. En claro va gris (como Forms) y en oscuro va al fondo mas
 * oscuro: `--muted` en el tema oscuro es MAS CLARO que `--card`, asi que usarlo
 * de lienzo invierte la elevacion y las tarjetas se ven hundidas.
 */
export const EDITOR_CANVAS = "bg-muted dark:bg-background";

export const DEFAULT_FORM_ICON = Ticket;
