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

/** Baldosa de la marca: la misma que la portada (`.pt .marca i`), pero acá el
    color sale de los TOKENS, así que sigue al skin igual que el nombre — con
    Rojo Kash la baldosa es roja. En la portada va fija a propósito (quien
    todavía no es cliente tiene que ver siempre la misma marca).
    Todo va en `em`: la baldosa crece con la tipografía del tamaño elegido y no
    hay una escala aparte que mantener. El trazo es `--primary-foreground`, el
    par legible del acento en cualquier skin; blanco fijo no lo garantiza. */
const Marca = () => (
  <span
    aria-hidden
    className="inline-grid shrink-0 place-items-center self-center bg-gradient-to-br from-accent to-primary"
    style={{ width: "1.15em", height: "1.15em", borderRadius: "0.3em" }}
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
