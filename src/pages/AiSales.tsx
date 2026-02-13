import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ClariAiChat from "@/components/ClariAiChat";

const AiSales = () => {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex flex-1 flex-col overflow-hidden">
            <ClariAiChat mode="full" />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AiSales;
