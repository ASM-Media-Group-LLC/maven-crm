import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";

const CHATTERS_URL =
  import.meta.env.VITE_CHATTERS_URL ?? "https://roleplaychatters.imaginehub.me";

const ChatterEvaluator = () => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <div className="flex-1 min-h-0 bg-background">
            <iframe
              src={CHATTERS_URL}
              className="h-full w-full border-0"
              allow="clipboard-write; microphone; camera; autoplay"
              title="Chatter Evaluator"
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default ChatterEvaluator;
