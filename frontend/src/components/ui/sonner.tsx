import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Con X para cerrar. Los avisos de Cowork duran diez segundos y algunos
      // tapan justo lo que la persona estaba mirando: sin forma de cerrarlos,
      // no queda otra que esperar. Un aviso que no se puede callar se vuelve
      // una molestia, y una molestia se aprende a ignorar.
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border hover:group-[.toast]:bg-muted",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
