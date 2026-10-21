import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRoleTier } from "@/hooks/useRoleTier";
import { Loader2 } from "lucide-react";

// Puerta para las rutas que solo ven supervisores y superiores (hoy: la sección
// Empleados). Usa el MISMO predicado que la RLS —is_in_role_group(uid,
// 'supervisor_or_above')— a través de useRoleTier, no una lista de nombres de
// rol hardcodeada: así el front y la base dicen lo mismo y un rol custom nuevo
// no queda fuera por accidente.
//
// No falla "en vacío": mientras carga muestra el spinner, y solo redirige
// cuando ya se sabe el nivel (tier distinto de undefined).
const SupervisorRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { isSupervisorOrAbove, isLoading: tierLoading } = useRoleTier();

  if (authLoading || tierLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isSupervisorOrAbove) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default SupervisorRoute;
