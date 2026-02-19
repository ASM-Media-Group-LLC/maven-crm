import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import CreadorasDashboardContent from "./CreadorasDashboardContent";

const CreadorasDashboardPage = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <CreadorasDashboardContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CreadorasDashboardPage;
