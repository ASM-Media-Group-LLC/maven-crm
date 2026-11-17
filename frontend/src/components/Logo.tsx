import { cn } from "@/lib/utils";
import { MarcaM, MarcaMaven } from "@/components/MarcaM";

const sizeClasses = {
  xs: "text-base",
  sm: "text-[1.65rem]",
  md: "text-4xl",
  lg: "text-7xl md:text-9xl",
} as const;



interface LogoProps {
  size?: keyof typeof sizeClasses;
  className?: string;
  collapsed?: boolean;
}

/** La marca: la M de cinta del logo nuevo (Alvaro, 16/11/2026), la misma de la
    portada y de los iconos, en el verde de la marca y SIN baldosa — así se ve
    igual sobre fondo claro u oscuro. Mide 0.8em de alto para acompañar a la
    tipografía elegida. Ya no sigue al skin: es la marca. El NOMBRE va como en
    la imagen: Montserrat 700, en el color del texto (blanco en oscuro). */
const Marca = () => (
  <span aria-hidden className="inline-flex shrink-0 items-center self-center">
    <MarcaM alto="0.8em" />
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
        "inline-flex select-none items-center text-foreground",
        sizeClasses[size],
        className
      )}
    >
      <MarcaMaven />
    </h1>
  );
};

export default Logo;
