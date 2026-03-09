import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";

interface PermissionRouteProps {
  module: string;
  submodule?: string;
  children: React.ReactNode;
}

const PermissionRoute = ({ module, submodule, children }: PermissionRouteProps) => {
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
    return <Navigate to="/login" replace />;
  }

  if (!canAccess(module, submodule)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PermissionRoute;
