import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import RoadmapContent from "./roadmap/RoadmapContent";
import ClariAiFab from "@/components/ClariAiFab";

const Roadmap = () => (
  <SidebarProvider>
    <div className="flex min-h-screen w-full bg-background">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopbar />
        <RoadmapContent />
      </div>
    </div>
    <ClariAiFab />
  </SidebarProvider>
);

export default Roadmap;
