import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import NuevoEventoForm from "./eventos/NuevoEventoForm";

const NuevoEvento = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <NuevoEventoForm />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default NuevoEvento;
