import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// LOS AVISOS DE MAVEN.
//
// Antes eran la tarjeta opaca que sonner trae de fábrica: fondo sólido y borde
// gris. Pedido de Jhon: "los popup de notificaciones son un poco feos".
//
// Ahora usan el vidrio de Maven —el mismo de los diálogos— y cada tipo trae su
// color en la barra izquierda y en el resplandor. Un aviso tiene que decir de
// un vistazo si algo salió bien o mal, sin leerlo.
//
// Tres decisiones que conviene no deshacer:
//  · `backdrop-blur` de verdad: el aviso aparece sobre pantallas con datos, y
//    translúcido se entiende que está POR ENCIMA y no dentro del contenido.
//  · Barra de color a la izquierda ADEMÁS del ícono: el color solo no alcanza
//    para quien no lo distingue.
//  · Botón de cerrar SIEMPRE. Los avisos de Cowork duran diez segundos y
//    algunos tapan justo lo que la persona estaba mirando: sin forma de
//    cerrarlos no queda otra que esperar, y un aviso que no se puede callar se
//    vuelve una molestia — y una molestia se aprende a ignorar.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      // Un poco más de aire entre avisos apilados: con el vidrio, dos tarjetas
      // pegadas se leen como una sola.
      gap={10}
      toastOptions={{
        classNames: {
          toast: [
            "group toast relative overflow-hidden",
            "group-[.toaster]:rounded-2xl group-[.toaster]:border",
            "group-[.toaster]:bg-card/70 group-[.toaster]:backdrop-blur-2xl",
            "group-[.toaster]:border-white/10 group-[.toaster]:text-foreground",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)]",
            // La barra de color de la izquierda; cada tipo le pone el suyo.
            "group-[.toaster]:before:absolute group-[.toaster]:before:inset-y-2 group-[.toaster]:before:left-0",
            "group-[.toaster]:before:w-[3px] group-[.toaster]:before:rounded-r-full",
            "group-[.toaster]:before:bg-primary/70",
          ].join(" "),
          title: "group-[.toast]:text-[13.5px] group-[.toast]:font-semibold group-[.toast]:leading-tight",
          description: "group-[.toast]:text-[12.5px] group-[.toast]:leading-snug group-[.toast]:text-muted-foreground",
          icon: "group-[.toast]:mr-1 group-[.toast]:shrink-0 group-[.toast]:self-start",
          closeButton: [
            "group-[.toast]:bg-white/10 group-[.toast]:text-foreground/70 group-[.toast]:border-white/10",
            "group-[.toast]:backdrop-blur-md hover:group-[.toast]:bg-white/20 hover:group-[.toast]:text-foreground",
          ].join(" "),
          actionButton: "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:rounded-lg group-[.toast]:bg-white/10 group-[.toast]:text-muted-foreground",
          success: [
            "group-[.toaster]:before:bg-emerald-500",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(16_185_129_/_0.75)]",
          ].join(" "),
          error: [
            "group-[.toaster]:before:bg-red-500",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(239_68_68_/_0.8)]",
          ].join(" "),
          warning: [
            "group-[.toaster]:before:bg-amber-500",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(245_158_11_/_0.75)]",
          ].join(" "),
          info: [
            "group-[.toaster]:before:bg-sky-500",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(14_165_233_/_0.7)]",
          ].join(" "),
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
