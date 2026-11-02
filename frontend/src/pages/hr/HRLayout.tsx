import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Wrapper para todas las páginas hijas de Recursos Humanos.
// Si la ruta NO es /hr (la página raíz), agregamos un botón "Volver"
// flotante arriba para regresar al Dashboard de RR.HH. Esto resuelve
// la queja del usuario de que las acciones del HRDashboard lo
// "sacaban" sin forma de regresar.
//
// Coordinación con BackToDashboardBar (vive en AppShell): el
// componente universal renderiza el mismo botón cuando location.state
// trae fromHR o fromDashboard. Para evitar duplicar la barra,
// suprimimos la nuestra cuando ese flag está presente — la universal
// se encarga. Esto cubre:
//   - Sidebar nav directo a /hr/X (sin state) → mostramos nuestra.
//   - Quick action desde dashboard con state.fromHR/fromDashboard
//     → la universal se muestra y la nuestra se oculta.
const HRLayout = ({ children }: { children: React.ReactNode }) => {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const isRoot = pathname === "/hr" || pathname === "/hr/";
  const navState = state as { fromDashboard?: boolean; fromHR?: boolean } | null;
  const universalBarActive = !!navState?.fromDashboard || !!navState?.fromHR;
  // Argos (/hr/monitor-ia) tiene su PROPIO botón en el riel: es un destino
  // primario, no una sub-página de RR.HH. a la que te "mandaron". Su expediente
  // trae su propio «← Volver a Argos». En ninguno va la barra «Volver al
  // Dashboard HR» (Álvaro): para volver a RR.HH. está el sidebar.
  const PRIMARIOS = ["/hr/monitor-ia", "/hr/expediente"];
  const esPrimario = PRIMARIOS.some((r) => pathname === r || pathname.startsWith(r + "/"));

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {!isRoot && !universalBarActive && !esPrimario && (
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
      {/* flex flex-col: sin esto el <Page> hijo (flex-1 min-h-0 overflow-y-auto)
          no agarra altura y el scroll propio de la página no funciona. */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">{children}</div>
    </div>
  );
};

export default HRLayout;
