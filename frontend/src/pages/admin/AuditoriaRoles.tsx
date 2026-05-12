import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, ChevronRight } from "lucide-react";
import { useAuditoriaData } from "./auditoria/useAuditoriaData";
import AuditoriaSummaryCards from "./auditoria/AuditoriaSummaryCards";
import AuditoriaHealthChecks from "./auditoria/AuditoriaHealthChecks";
import AuditoriaUsersTable from "./auditoria/AuditoriaUsersTable";
import AuditoriaRoleMatrix from "./auditoria/AuditoriaRoleMatrix";
import AuditoriaActivityLog from "./auditoria/AuditoriaActivityLog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Tab = "resumen" | "matriz" | "actividad";

const AuditoriaRoles = () => {
  const { data, isLoading } = useAuditoriaData();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("resumen");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const tabs: { key: Tab; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    { key: "matriz", label: "Matriz de Permisos" },
    { key: "actividad", label: "Actividad" },
  ];

  // Get unique roles for filter
  const availableRoles = useMemo(() => {
    if (!data) return [];
    const roles = new Set<string>();
    for (const user of data.users) {
      for (const r of user.roles) {
        roles.add(r.role);
      }
    }
    return Array.from(roles).sort();
  }, [data]);

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!data) return [];
    let users = data.users;

    if (statusFilter === "with_role") {
      users = users.filter((u) => u.roles.length > 0);
    } else if (statusFilter === "without_role") {
      users = users.filter((u) => u.roles.length === 0);
    }

    if (roleFilter !== "all") {
      users = users.filter((u) => u.roles.some((r) => r.role === roleFilter));
    }

    return users;
  }, [data, statusFilter, roleFilter]);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            {/* Fixed Header */}
            <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <button
                  onClick={() => navigate("/admin")}
                  className="hover:text-foreground transition-colors"
                >
                  Administración
                </button>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-foreground">Auditoría</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold">Auditoría de Roles</h1>
                <p className="text-muted-foreground text-sm">Reporte en tiempo real del estado de roles y permisos</p>
              </div>
            </header>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : data ? (
                <>
                  {/* KPIs */}
                  <AuditoriaSummaryCards summary={data.summary} />

                  {/* Tabs */}
                  <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
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

                  {/* Tab Content */}
                  {activeTab === "resumen" ? (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold mb-3">Health Checks</h2>
                        <AuditoriaHealthChecks checks={data.health_checks} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="text-lg font-semibold">Usuarios y Roles</h2>
                          <div className="flex items-center gap-2">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                              <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder="Estado" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="with_role">Con rol</SelectItem>
                                <SelectItem value="without_role">Sin rol</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={roleFilter} onValueChange={setRoleFilter}>
                              <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder="Rol" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos los roles</SelectItem>
                                {availableRoles.map((r) => (
                                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                        </div>
                        <AuditoriaUsersTable users={filteredUsers} search={search} />
                      </div>
                    </>
                  ) : activeTab === "matriz" ? (
                    <AuditoriaRoleMatrix matrix={data.role_matrix} />
                  ) : (
                    <AuditoriaActivityLog entries={data.audit_entries} profiles={data.profilesMap} />
                  )}
                </>
              ) : null}
            </div>
          </main>
  );
};

export default AuditoriaRoles;
