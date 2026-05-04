import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export const FeedbackSection = () => {
  const { toast } = useToast();

  return (
    <section id="feedback" className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold mb-2">2.6 Feedback</h2>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Componentes para comunicar estados, resultados y mensajes al usuario.
          Cada tipo tiene un propósito específico — no intercambiar.
        </p>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Alerts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Mensajes persistentes en contexto. Se mantienen visibles hasta que el usuario los cierre o la condición cambie.
        </p>
        <div className="space-y-4 max-w-2xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Información</AlertTitle>
            <AlertDescription>Este es un mensaje informativo con contexto adicional.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>No se pudo completar la operación. Intenta de nuevo.</AlertDescription>
          </Alert>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Toasts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Notificaciones temporales. Aparecen brevemente y desaparecen. Usar para confirmar acciones exitosas
          o reportar errores no bloqueantes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() =>
              toast({
                title: "Guardado correctamente",
                description: "Los cambios se han aplicado.",
              })
            }
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Toast success
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast({
                variant: "destructive",
                title: "Error al guardar",
                description: "No se pudo conectar con el servidor.",
              })
            }
          >
            <AlertCircle className="mr-2 h-4 w-4" /> Toast error
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast({
                title: "Atención",
                description: "Tu sesión expira en 5 minutos.",
              })
            }
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Toast warning
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Skeleton (Loading / Empty)</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Placeholder visual durante la carga. Replicar la forma del contenido final para reducir layout shift.
        </p>
        <div className="max-w-md space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-medium mb-4 text-muted-foreground">Cuándo usar cada uno</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4 font-medium">Componente</th>
                <th className="pb-2 pr-4 font-medium">Cuándo</th>
                <th className="pb-2 font-medium">Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-medium">Alert</td>
                <td className="py-2 pr-4 text-muted-foreground">Mensaje persistente en contexto</td>
                <td className="py-2 text-muted-foreground">Formulario con errores de validación</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-medium">Toast</td>
                <td className="py-2 pr-4 text-muted-foreground">Confirmación temporal de acción</td>
                <td className="py-2 text-muted-foreground">"Cambios guardados"</td>
              </tr>
              <tr className="border-b border-border/50">
                <td className="py-2 pr-4 font-medium">Skeleton</td>
                <td className="py-2 pr-4 text-muted-foreground">Estado de carga inicial</td>
                <td className="py-2 text-muted-foreground">Lista cargando datos del servidor</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
