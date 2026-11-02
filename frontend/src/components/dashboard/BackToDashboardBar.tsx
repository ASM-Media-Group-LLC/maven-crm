import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Barra flotante que aparece arriba cuando el usuario llegó a una
// página desde otro dashboard (Dashboard principal o HR). Soporta dos
// flags en location.state:
//   - fromDashboard: true → "Volver al Dashboard" (/dashboard)
//   - fromHR: true → "Volver al Dashboard HR" (/hr)
// Universal — vive en AppShell así no hay que tocar cada página.
const BackToDashboardBar = () => {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const s = state as { fromDashboard?: boolean; fromHR?: boolean } | null;

  // Destinos PRIMARIOS del sidebar (tienen su propio botón en el riel): no son
  // sub-páginas a las que te "manden" desde un dashboard, así que la barra "Volver
  // al Dashboard" no tiene sentido ahí — venía de estado de navegación pegado y
  // sacaba al usuario de su lugar. El Messenger y Argos (/hr/monitor-ia, con su
  // propio ojo en el riel) son primarios: para volver a RR.HH. está el sidebar.
  const ES_PRIMARIO = ["/messenger", "/hr/monitor-ia", "/hr/expediente"];
  if (ES_PRIMARIO.some((r) => pathname === r || pathname.startsWith(r + "/"))) return null;

  if (!s?.fromDashboard && !s?.fromHR) return null;

  const target = s.fromHR ? "/hr" : "/dashboard";
  const label = s.fromHR ? "Volver al Dashboard HR" : "Volver al Dashboard";

  return (
    <div className="shrink-0 px-6 pt-3 bg-background">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => navigate(target)}
      >
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    </div>
  );
};

export default BackToDashboardBar;
