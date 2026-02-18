import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ClipboardCheck } from "lucide-react";
import { useAuditoriaData } from "./auditoria/useAuditoriaData";
import AuditoriaSummaryCards from "./auditoria/AuditoriaSummaryCards";
import AuditoriaHealthChecks from "./auditoria/AuditoriaHealthChecks";
import AuditoriaUsersTable from "./auditoria/AuditoriaUsersTable";
import AuditoriaRoleMatrix from "./auditoria/AuditoriaRoleMatrix";

const AuditoriaRoles = () => {
  const { data, isLoading } = useAuditoriaData();
  const [search, setSearch] = useState("");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col">
          <DashboardTopbar />
          <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            <header className="bg-background px-6 pt-6 pb-4 border-b shrink-0">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-6 w-6 text-primary" />
                <div>
                  <h1 className="text-2xl font-bold">Auditoría de Roles</h1>
                  <p className="text-muted-foreground">Reporte en tiempo real del estado de roles y permisos</p>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data ? (
                <>
                  {/* KPIs */}
                  <AuditoriaSummaryCards summary={data.summary} />

                  {/* Health Checks */}
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Health Checks</h2>
                    <AuditoriaHealthChecks checks={data.health_checks} />
                  </div>

                  {/* Users Table */}
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

                  {/* Role Matrix */}
                  <div>
                    <h2 className="text-lg font-semibold mb-3">Matriz de Permisos por Rol</h2>
                    <AuditoriaRoleMatrix matrix={data.role_matrix} />
                  </div>
                </>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AuditoriaRoles;
