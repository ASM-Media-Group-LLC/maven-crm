import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { IconoSistema, type TonoAviso } from "@/lib/avisoPersona";

// EL OTRO SISTEMA DE AVISOS.
//
// Maven convive dos: sonner (~100 archivos) y este, el de Radix (~116). Los
// dos tienen el mismo vidrio, y ahora también el mismo muñequito del sistema.
// Si no, la mitad de los avisos de la app salen con robot y la otra mitad
// pelados según de qué archivo se disparen — pasó con "Correo copiado", que
// es de acá.
//
// El muñequito se pone en este archivo, que es el único lugar por el que
// pasan todos, y no en cada `toast({...})`.
const TONO: Record<string, TonoAviso> = {
  destructive: "mal",
  success: "bien",
  warning: "ojo",
  info: "neutral",
  default: "neutral",
};

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <IconoSistema tono={TONO[props.variant ?? "default"] ?? "neutral"} />
            {/* `flex-1` para que el texto se quede con el ancho que sobra
                después del muñequito, en vez de empujar la tarjeta. */}
            <div className="grid flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
