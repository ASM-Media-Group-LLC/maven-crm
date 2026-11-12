import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useVigilancia } from "@/hooks/useVigilancia";

// La puerta de la vista en vivo (/hr/en-vivo/:userId): entran el dueño, RR. HH.
// y los supervisores. A quién puede mirar cada uno lo decide después la base,
// persona por persona. Si no se pudo averiguar (bache de red), NO se concluye
// «no tienes acceso»: se dice y se ofrece reintentar (fallar cerrado sin rebotar).
export default function RutaDeVigilancia({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const { puede, cargando, reintentar } = useVigilancia();

  if (loading || (user && puede === null && cargando)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (puede === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">{t("vigilancia.permisoIndefinido")}</p>
        <Button size="sm" onClick={reintentar} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />{t("vigilancia.comun.reintentar")}
        </Button>
      </div>
    );
  }
  if (!puede) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
