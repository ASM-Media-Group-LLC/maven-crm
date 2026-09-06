import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { IconoSistema } from "@/lib/avisoPersona";

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
      // EL MUÑEQUITO DEL SISTEMA, PARA TODA LA APP.
      //
      // Pedido de Jhon: que el muñequito no sea solo cuando el aviso es de una
      // persona — que el sistema tenga el suyo. Puesto acá una vez, lo usan
      // los ~100 archivos que disparan avisos sin tocar ninguno.
      //
      // El tilde/cruz no se pierde: va en una insignia chiquita sobre el
      // muñequito, porque el color solo no alcanza para decir qué pasó.
      // Y los avisos de una persona pasan su propio `icon`, que gana a esto.
      icons={{
        success: <IconoSistema tono="bien" />,
        error: <IconoSistema tono="mal" />,
        warning: <IconoSistema tono="ojo" />,
        info: <IconoSistema tono="neutral" />,
      }}
      // Un poco más de aire entre avisos apilados: con el vidrio, dos tarjetas
      // pegadas se leen como una sola.
      gap={10}
      // Sobre la barra de inicio del iPhone instalado (vale 16px donde no hay
      // área segura).
      offset="calc(16px + env(safe-area-inset-bottom, 0px))"
      // El botón de cerrar, a la derecha y DENTRO de la tarjeta. De fábrica
      // sonner lo pone a la izquierda y medio afuera; como la tarjeta recorta
      // lo que sobresale (`overflow-hidden`, que necesita la barra de color),
      // se veía como una muesca oscura comiéndose la esquina. A la derecha,
      // además, es donde la gente lo busca.
      style={{
        "--toast-close-button-start": "auto",
        "--toast-close-button-end": "8px",
        "--toast-close-button-transform": "translate(0, 8px)",
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: [
            "group toast relative overflow-hidden",
            "group-[.toaster]:rounded-2xl group-[.toaster]:border",
            "group-[.toaster]:bg-card/70 group-[.toaster]:backdrop-blur-2xl",
            "group-[.toaster]:border-white/10 group-[.toaster]:text-foreground",
            "group-[.toaster]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9)]",
            // La barra de color de la izquierda.
            "group-[.toaster]:before:absolute group-[.toaster]:before:inset-y-2 group-[.toaster]:before:left-0",
            "group-[.toaster]:before:w-[3px] group-[.toaster]:before:rounded-r-full",
            "group-[.toaster]:before:bg-primary/70",
            // ⚠️ EL COLOR POR TIPO VA ACÁ, con `data-[type=…]`, y no en
            // `classNames.success`. Aprendido a la mala: puestos allá, la
            // regla del tipo y la del color base caen en el MISMO elemento con
            // la MISMA especificidad, así que gana la que Tailwind haya
            // escrito más abajo en la hoja — y ganaba el azul del base. Un
            // aviso de éxito con la barra azul: el color, que es lo que se lee
            // antes que el texto, decía otra cosa.
            //
            // Van con las DOS variantes (`group-[.toaster]:data-[type=…]`): el
            // base ya usa `group-[.toaster]:`, así que el atributo solo
            // empataba y volvía a decidir el orden de la hoja. Con las dos, el
            // selector del tipo suma clase + atributo + :is() y gana siempre.
            "group-[.toaster]:data-[type=success]:before:bg-emerald-500",
            "group-[.toaster]:data-[type=error]:before:bg-red-500",
            "group-[.toaster]:data-[type=warning]:before:bg-amber-500",
            "group-[.toaster]:data-[type=info]:before:bg-sky-500",
            // Y el resplandor del mismo color, por la misma razón.
            "group-[.toaster]:data-[type=success]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(16_185_129_/_0.75)]",
            "group-[.toaster]:data-[type=error]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(239_68_68_/_0.8)]",
            "group-[.toaster]:data-[type=warning]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(245_158_11_/_0.75)]",
            "group-[.toaster]:data-[type=info]:shadow-[0_24px_60px_-24px_rgba(0,0,0,.9),0_0_70px_-28px_rgb(14_165_233_/_0.7)]",
          ].join(" "),
          title: "group-[.toast]:text-[13.5px] group-[.toast]:font-semibold group-[.toast]:leading-tight",
          description: "group-[.toast]:text-[12.5px] group-[.toast]:leading-snug group-[.toast]:text-muted-foreground",
          // El hueco del ícono con tamaño FIJO: acá adentro va tanto un ícono
          // de 20px como la cara de alguien, y sin acotar el hueco un avatar
          // de 40 se montaba encima del texto.
          icon: [
            "group-[.toast]:mr-1.5 group-[.toast]:shrink-0 group-[.toast]:self-start",
            "group-[.toast]:h-8 group-[.toast]:w-8 group-[.toast]:items-center group-[.toast]:justify-center",
          ].join(" "),
          closeButton: [
            "group-[.toast]:bg-white/10 group-[.toast]:text-foreground/70 group-[.toast]:border-white/10",
            "group-[.toast]:backdrop-blur-md hover:group-[.toast]:bg-white/20 hover:group-[.toast]:text-foreground",
          ].join(" "),
          actionButton: "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:rounded-lg group-[.toast]:bg-white/10 group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
