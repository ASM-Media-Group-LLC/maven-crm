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
  const { state } = useLocation();
  const navigate = useNavigate();
  const s = state as { fromDashboard?: boolean; fromHR?: boolean } | null;

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
