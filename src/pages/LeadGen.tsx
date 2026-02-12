import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Activity } from "lucide-react";

const LeadGen = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 overflow-auto p-6 min-w-0">
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <Activity className="h-12 w-12" />
              <h1 className="text-2xl font-semibold text-foreground">LeadGen</h1>
              <p className="text-sm">Coming soon</p>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default LeadGen;
