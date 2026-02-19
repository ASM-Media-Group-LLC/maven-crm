import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import ClariAiChat from "@/components/ClariAiChat";
import { Button } from "@/components/ui/button";
import { Settings, Archive } from "lucide-react";
import { toast } from "sonner";

const AiSales = () => {
  const navigate = useNavigate();
  const [resetKey, setResetKey] = useState(0);

  const handleArchive = () => {
    setResetKey((k) => k + 1);
    toast.success("Chat archivado");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex flex-1 flex-col overflow-hidden">
            {/* Sticky header */}
            <div className="flex items-center justify-between border-b border-border bg-background px-6 py-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">IA Ventas</span>
                <span className="text-xs text-muted-foreground">Asistente de ventas con IA</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => navigate("/ai-sales-config")}
                >
                  <Settings className="h-4 w-4" />
                  Configuración
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleArchive}
                >
                  <Archive className="h-4 w-4" />
                  Archivar chat
                </Button>
              </div>
            </div>

            <ClariAiChat key={resetKey} mode="full" />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AiSales;
