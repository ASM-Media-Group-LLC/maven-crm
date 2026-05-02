import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ChatterProfileDetailContent from "@/pages/chatter-evaluator/ProfileDetailContent";

const ChatterProfileDetail = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <ChatterProfileDetailContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatterProfileDetail;
