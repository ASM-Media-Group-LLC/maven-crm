import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { canAccess, isLoading: permsLoading } = usePermissions();

  if (authLoading || permsLoading) {
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

  if (!canAccess("Administración")) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
