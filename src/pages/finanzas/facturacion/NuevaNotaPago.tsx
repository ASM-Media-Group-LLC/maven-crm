import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import NuevaNotaPagoPage from "./NuevaNotaPagoPage";

const NuevaNotaPago = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <NuevaNotaPagoPage />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default NuevaNotaPago;
