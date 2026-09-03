import { Navigate, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";

// Perfil de creadora: lo abre quien tiene Creadores · Perfil, o un chatter
// cuyo grupo vigente atiende a ESA creadora (Chatters · Horarios). La regla
// vive en la BD (chatter_can_view_creator); acá solo se consulta.
export default function CreadorRosterRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { canAccess, isLoading: permsLoading } = usePermissions();
  const tienePermiso = !permsLoading && canAccess("Creadores", "Perfil");

  const roster = useQuery({
    queryKey: ["creador-roster-acceso", user?.id, id],
    enabled: !!user && !!id && !permsLoading && !tienePermiso,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("chatter_can_view_creator", { _uid: user!.id, _creator_id: id });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    staleTime: 60_000,
  });

  if (authLoading || permsLoading || (!tienePermiso && roster.isLoading)) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!tienePermiso && !roster.data) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
