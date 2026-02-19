import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import DesignSystemPage from "./design-system/DesignSystemPage";
import ClariAiFab from "@/components/ClariAiFab";

const DesignSystem = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <DesignSystemPage />
        </div>
      </div>
      <ClariAiFab />
    </SidebarProvider>
  );
};

export default DesignSystem;
