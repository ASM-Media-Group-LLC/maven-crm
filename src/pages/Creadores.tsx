import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import CreadoresContent from "./creadores/CreadoresContent";

const Creadores = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <CreadoresContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Creadores;
