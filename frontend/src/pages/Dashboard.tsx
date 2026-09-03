import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import DashboardContent from "@/components/dashboard/DashboardContent";
import { useUserRole } from "@/hooks/useUserRole";

const ChatterDashboard = lazy(() => import("@/pages/chatters/dashboard/ChatterDashboard"));

// Sidebar/Topbar + ClariAi FAB + announcement popups all live in
// AppShell now. The dashboard route just renders its content.
//
// El rol Chatter tiene su propio dashboard: el general está armado sobre
// módulos (Creadores, Tickets, LeadGen…) que un chatter no tiene, así que le
// quedaba casi vacío. El suyo muestra su turno, sus creadoras, su nota, sus
// ventas y su descanso.
const Dashboard = () => {
  const { isChatter, isLoading } = useUserRole();
  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (isChatter) {
    return (
      <Suspense fallback={<div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
        <ChatterDashboard />
      </Suspense>
    );
  }
  return <DashboardContent />;
};

export default Dashboard;
