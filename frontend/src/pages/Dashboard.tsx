import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useRoleTier } from "@/hooks/useRoleTier";

const ChatterDashboard = lazy(() => import("@/pages/chatters/dashboard/ChatterDashboard"));
const DashboardVentas = lazy(() => import("@/pages/Dashboard2"));

const Cargando = () => (
  <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

// Sidebar/Topbar + ClariAi FAB + announcement popups all live in
// AppShell now. The dashboard route just renders its content.
//
// ESTA RUTA ES UN REPARTIDOR POR ROL: la idea (Jhon, 03/09/2026) es que cada
// rol entre a Maven y vea SU tablero, no uno genérico.
//
//  · **Chatter** → el suyo: turno, creadoras, nota, ventas, descanso. El
//    genérico está armado sobre módulos (Creadores, Tickets, LeadGen…) que un
//    chatter no tiene, así que le quedaba casi vacío.
//  · **Management con acceso a ventas** → el Dashboard Ventas, en vez del
//    genérico: "el actual dashboard no me aporta nada, podrías sustituirlo
//    completamente por dashboard ventas". Lo que dejan de ver eran resúmenes
//    de otros módulos (Rendimiento Semanal, Actividad Reciente, Pipeline, Top
//    5 Creadoras, CS, Closers, RRHH), cada uno disponible en su módulo.
//  · **El resto** → el genérico, hasta que tengan el suyo.
const Dashboard = () => {
  const { isChatter, isLoading } = useUserRole();
  const { canAccess, isLoading: permisosCargando } = usePermissions();
  const { tier, isLoading: tierCargando } = useRoleTier();

  if (isLoading || permisosCargando || tierCargando) return <Cargando />;

  // El chatter va primero: es el tablero más específico y ningún chatter
  // debería tener el permiso de ventas.
  if (isChatter) {
    return <Suspense fallback={<Cargando />}><ChatterDashboard /></Suspense>;
  }

  // Solo ADMIN (decisión de Jhon: "dejalo solo admin"). El permiso del menú lo
  // tienen 6 roles, pero la data (RPC get_dashboard2_creator_summary) está
  // gateada por `blu_is_management`: con el JWT de un Chatter Supervisor
  // responde `42501 forbidden: management only` y el front lo traga como "sin
  // datos". Regla que dio Jhon: "si no tiene permiso para ver data del
  // dashboard v2, dejalo así" — cada rol va a tener el suyo.
  if (tier === "admin" && canAccess("Creator Sales", "Dashboard")) {
    return <Suspense fallback={<Cargando />}><DashboardVentas /></Suspense>;
  }

  return <DashboardContent />;
};

export default Dashboard;
