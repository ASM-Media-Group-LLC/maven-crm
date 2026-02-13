import { useParams } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import TareasContent from "./tareas/TareasContent";

const TareaProject = () => {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <TareasContent projectId={projectId!} />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default TareaProject;
