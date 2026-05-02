import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import WorkspaceContent from "@/pages/chatter-evaluator/workspace/WorkspaceContent";

const ChatterWorkspace = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <WorkspaceContent />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatterWorkspace;
