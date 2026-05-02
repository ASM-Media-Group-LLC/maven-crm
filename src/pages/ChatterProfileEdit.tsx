import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ChatterProfileEditContent from "@/pages/chatter-evaluator/ProfileEditContent";

const ChatterProfileEdit = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <ChatterProfileEditContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatterProfileEdit;
