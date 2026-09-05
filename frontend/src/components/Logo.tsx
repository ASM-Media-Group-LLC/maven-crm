import { cn } from "@/lib/utils";

const sizeClasses = {
  xs: "text-base gap-1.5",
  sm: "text-[1.65rem] gap-2",
  md: "text-4xl gap-2.5",
  lg: "text-7xl md:text-9xl gap-4",
} as const;

interface LogoProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  collapsed?: boolean;
}

/** Baldosa de la marca: la MISMA que la portada (`.pt .marca i` en
    Portada.tsx), a escala: sobre una baldosa de 26px allí van radio 8, una M de
    Lucide de 14px con trazo 2.6 y un halo suave; acá todo eso va en fracciones
    de la baldosa (1.15em del tamaño elegido) para que crezca con la tipografía.
    Colores por TOKENS para seguir al skin: `--primary` degradando a un
    `--primary` más oscuro (en el skin por defecto da el azul exacto de la
    portada; con Rojo Kash es carmesí) y el trazo `--primary-foreground`. En la
    portada va fija a propósito (quien todavía no es cliente ve siempre la misma
    marca). El NOMBRE no se toca: degradado y tipografía de siempre — Jhon pidió
    "igual a la página de inicio, respetando el skin" SOLO para la baldosa
    (05/09/2026), después de rechazar varias M propias (ancha al 100%, letra
    alta y recta, más gruesa): la referencia es lo que ya existe. */
const Marca = () => (
  <span
    aria-hidden
    className="inline-grid shrink-0 place-items-center self-center"
    style={{
      width: "1.15em",
      height: "1.15em",
      borderRadius: "0.354em",
      background:
        "linear-gradient(140deg, hsl(var(--primary)), color-mix(in oklab, hsl(var(--primary)), black 22%))",
      boxShadow: "0 0 0.97em -0.265em hsl(var(--primary) / 0.8)",
    }}
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="hsl(var(--primary-foreground))"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "0.62em", height: "0.62em" }}
    >
      <path d="M4 19V7l8 7 8-7v12" />
    </svg>
  </span>
);

const Logo = ({ size = "lg", className, collapsed }: LogoProps) => {
  if (collapsed) {
    return (
      <h1 className={cn("select-none text-xl font-bold tracking-tight", className)}>
        <Marca />
        <span className="sr-only">Maven</span>
      </h1>
    );
  }

  return (
    <h1
      className={cn(
        "inline-flex select-none items-center font-bold tracking-tight",
        sizeClasses[size],
        className
      )}
    >
      <Marca />
      <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">Maven</span>
    </h1>
  );
};

export default Logo;
