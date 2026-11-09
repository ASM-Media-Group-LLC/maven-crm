import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useEsRh } from "@/hooks/useEsRh";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PermissionRouteProps {
  module: string;
  submodule?: string;
  /** Además del permiso, exige ser el DUEÑO de la empresa (tenant_owners). Argos, por ahora. */
  soloDueno?: boolean;
  /** Con `soloDueno`, también deja entrar a HR (rol HHRR). Para Argos/expediente:
   *  Andrea (HR) ve todo MENOS los admins (la RLS filtra por nivel del observado). */
  tambienRh?: boolean;
  children: React.ReactNode;
}

const PermissionRoute = ({ module, submodule, soloDueno = false, tambienRh = false, children }: PermissionRouteProps) => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { canAccess, isLoading: permsLoading, hayError, reintentar } = usePermissions();
  const { esDueno, cargando: duenoCargando, error: duenoError } = useEsDueno();
  const { esRh, cargando: rhCargando, error: rhError } = useEsRh();

  // Con soloDueno esperamos a saber si es dueño (y, si aplica, si es HR).
  const esperaGate = soloDueno && !!user && (duenoCargando || (tambienRh && rhCargando));
  if (authLoading || permsLoading || esperaGate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Se recuerda a dónde iba: Login lo devuelve ahí después de entrar
    // (sin esto, un link compartido moría en el dashboard).
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Si NO pudimos averiguar los permisos, no se puede concluir "no tiene
  // acceso": antes esto te rebotaba al dashboard por un bache de red, y desde
  // afuera se sentía como si la sesión se hubiera caído. Se lo decimos y se
  // ofrece reintentar, sin dejar pasar a la página (fallar cerrado).
  // Igual con «¿es el dueño?»: si no se pudo averiguar, no se concluye que no.
  // El candado de "solo dueño" (y HR si aplica) no se pudo resolver por un bache
  // de red: no se concluye "no tienes acceso", se ofrece reintentar (fallar
  // cerrado sin rebotar al dashboard por un error transitorio).
  const permitidoGate = esDueno === true || (tambienRh && esRh === true);
  const duenoIndef = esDueno == null || duenoError != null;
  const rhIndef = tambienRh && (esRh == null || rhError != null);
  const gateIndeterminado = soloDueno && !permitidoGate && (duenoIndef || rhIndef);

  if (hayError || gateIndeterminado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm font-medium">No pudimos verificar tus permisos</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Fue un problema de conexión, no de tu cuenta. Sigues con la sesión abierta.
        </p>
        <Button size="sm" onClick={reintentar} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      </div>
    );
  }

  if (!canAccess(module, submodule)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Argos solo lo ve el dueño (y HR si tambienRh). Si no, fuera.
  if (soloDueno && !permitidoGate) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PermissionRoute;
