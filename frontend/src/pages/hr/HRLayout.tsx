import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Wrapper para todas las páginas hijas de Recursos Humanos.
// Si la ruta NO es /hr (la página raíz), agregamos un botón "Volver"
// flotante arriba para regresar al Dashboard de RR.HH. Esto resuelve
// la queja del usuario de que las acciones del HRDashboard lo
// "sacaban" sin forma de regresar.
const HRLayout = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isRoot = pathname === "/hr" || pathname === "/hr/";

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {!isRoot && (
        <div className="shrink-0 px-6 pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/hr")}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard HR
          </Button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
};

export default HRLayout;
