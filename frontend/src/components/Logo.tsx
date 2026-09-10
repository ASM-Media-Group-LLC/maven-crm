import { cn } from "@/lib/utils";
import { MarcaM } from "@/components/MarcaM";

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

/** Baldosa de la marca: la MISMA que la portada (`.pt .marca i` en Portada.tsx),
    a escala: sobre una baldosa de 26px allí van radio 8 y la M dentro, y acá
    todo eso va en fracciones de la baldosa (1.15em del tamaño elegido) para que
    crezca con la tipografía. Colores por TOKENS para seguir al skin: `--primary`
    degradando a un `--primary` más oscuro (en el skin por defecto da el azul
    exacto de la portada; con Rojo Kash es carmesí). En la portada va fija a
    propósito (quien todavía no es cliente ve siempre la misma marca).

    La M es la del mock del jefe, aprobada el 10/09/2026 (ver components/MarcaM):
    apaisada, con la V del medio blanca por encima de las patas apagadas. Ocupa
    el 42% del alto de la baldosa, o sea el 67% de su ancho. El NOMBRE no se
    toca: degradado y tipografía de siempre. */
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
    <MarcaM
      alto="0.529em"
      claro="hsl(var(--primary-foreground))"
      oscuro="hsl(var(--primary-foreground) / 0.55)"
    />
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
