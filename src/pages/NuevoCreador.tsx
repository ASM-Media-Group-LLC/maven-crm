import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import NuevoCreadorForm from "./creadores/NuevoCreadorForm";

const NuevoCreador = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <NuevoCreadorForm />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default NuevoCreador;
