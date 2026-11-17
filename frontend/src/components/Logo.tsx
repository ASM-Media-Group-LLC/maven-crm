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

/** La marca: la M de cinta del logo nuevo (Alvaro, 16/11/2026), la misma de la
    portada y de los iconos, en el verde de la marca y SIN baldosa — así se ve
    igual sobre fondo claro u oscuro. Mide 0.72em de alto para acompañar a la
    tipografía elegida. Ya no sigue al skin: es la marca. El NOMBRE no se toca:
    degradado y tipografía de siempre. */
const Marca = () => (
  <span aria-hidden className="inline-flex shrink-0 items-center self-center">
    <MarcaM alto="0.72em" />
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
