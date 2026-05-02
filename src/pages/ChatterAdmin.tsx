import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ChatterAdminContent from "@/pages/chatter-evaluator/AdminContent";

const ChatterAdmin = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <ChatterAdminContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatterAdmin;
