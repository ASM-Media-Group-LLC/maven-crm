import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { useAuditoriaData } from "./auditoria/useAuditoriaData";
import AuditoriaSummaryCards from "./auditoria/AuditoriaSummaryCards";
import AuditoriaHealthChecks from "./auditoria/AuditoriaHealthChecks";
import AuditoriaUsersTable from "./auditoria/AuditoriaUsersTable";
import AuditoriaRoleMatrix from "./auditoria/AuditoriaRoleMatrix";

type Tab = "resumen" | "matriz";

const AuditoriaRoles = () => {
  const { data, isLoading } = useAuditoriaData();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("resumen");

  const tabs: { key: Tab; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    { key: "matriz", label: "Matriz de Permisos" },
  ];

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopbar />
          <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            <header className="bg-background px-6 pt-6 pb-4 border-b shrink-0">
              <div>
                <h1 className="text-xl font-semibold">Auditoría de Roles</h1>
                <p className="text-muted-foreground text-sm">Reporte en tiempo real del estado de roles y permisos</p>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                {tabs.map((t) => (
                  <Button
                    key={t.key}
                    variant={activeTab === t.key ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab(t.key)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </header>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data ? (
                activeTab === "resumen" ? (
                  <>
                    <AuditoriaSummaryCards summary={data.summary} />
                    <div>
                      <h2 className="text-lg font-semibold mb-3">Health Checks</h2>
                      <AuditoriaHealthChecks checks={data.health_checks} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-lg font-semibold">Usuarios y Roles</h2>
                        <div className="relative max-w-xs">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Buscar usuario..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                      </div>
                      <AuditoriaUsersTable users={data.users} search={search} />
                    </div>
                  </>
                ) : (
                  <AuditoriaRoleMatrix matrix={data.role_matrix} />
                )
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AuditoriaRoles;
