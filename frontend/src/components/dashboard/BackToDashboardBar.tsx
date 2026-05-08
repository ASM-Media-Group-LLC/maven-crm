import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Barra flotante que aparece arriba cuando el usuario llegó a una
// página desde "Acciones Rápidas" o un cuadro del Dashboard principal.
// Activada por `state.fromDashboard = true` en la nav. Click navega al
// dashboard. Universal — vive en AppShell así no hay que tocar cada
// página individual.
const BackToDashboardBar = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const fromDashboard = (state as { fromDashboard?: boolean } | null)?.fromDashboard;

  if (!fromDashboard) return null;

  return (
    <div className="shrink-0 px-6 pt-3 bg-background">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => navigate("/dashboard")}
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al Dashboard
      </Button>
    </div>
  );
};

export default BackToDashboardBar;
