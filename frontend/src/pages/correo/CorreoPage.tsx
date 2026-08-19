import { Button } from "@/components/ui/button";
import { Mail, Loader2, AlertTriangle, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { useMailConnection } from "@/hooks/useMailConnection";

/**
 * Correo dentro de Maven (Zoho detrás).
 *
 * Por ahora esta pantalla resuelve solo la conexión de la casilla. La
 * bandeja —carpetas, lista, lectura, composer— se construye encima una vez
 * que hay conexiones reales contra las que probar.
 */
export default function CorreoPage() {
  const { connection, isLoading, error, start, disconnect } = useMailConnection();

  const handleConnect = async () => {
    try {
      await start();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">No se pudo leer el estado de tu correo</p>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  // Sin conectar todavía.
  if (!connection) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Mail className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectá tu correo</h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Vas a autorizar a Maven a leer y enviar correo desde tu casilla. Se abre
          una pantalla de Zoho para que confirmes; Maven nunca ve tu contraseña.
        </p>
        <Button className="mt-7" size="lg" onClick={handleConnect}>
          <Mail className="mr-2 h-4 w-4" />
          Conectar mi correo
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          Podés desconectarlo cuando quieras, desde acá mismo.
        </p>
      </div>
    );
  }

  // Conectada.
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-lg border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">Casilla conectada</p>
            <p className="truncate text-lg font-medium">{connection.email_address}</p>
            <p className="text-xs text-muted-foreground">
              Desde {new Date(connection.connected_at).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() =>
              disconnect.mutate(undefined, {
                onSuccess: () => toast.success("Correo desconectado"),
                onError: (e) => toast.error((e as Error).message),
              })
            }
          >
            <Link2Off className="mr-2 h-4 w-4" />
            Desconectar
          </Button>
        </div>

        {connection.has_error && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-muted-foreground">
              La última vez que Maven usó esta conexión hubo un error. Si el correo
              no carga, desconectá y volvé a conectar.
            </span>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        La bandeja de entrada está en construcción.
      </p>
    </div>
  );
}
