import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import CreadorProfileContent from "./creadores/CreadorProfileContent";

const CreadorProfile = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <CreadorProfileContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CreadorProfile;
