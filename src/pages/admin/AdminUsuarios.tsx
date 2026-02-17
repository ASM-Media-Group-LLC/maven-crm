import { useState, useMemo } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, List, Shield, UserCog, Users, User } from "lucide-react";
import { useAdminUsers, type AdminUser } from "./useAdminUsers";
import UsersTable from "./UsersTable";
import UsersGrid from "./UsersGrid";
import ChangeRoleModal from "./ChangeRoleModal";
import type { AppRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

const AdminUsuarios = () => {
  const { users, isLoading, changeRole, isChangingRole, stats } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => (u.full_name ?? "").toLowerCase().includes(q));
  }, [users, search]);

  const handleEditRole = (user: AdminUser) => {
    setSelectedUser(user);
    setModalOpen(true);
  };

  const handleConfirmRole = (userId: string, role: AppRole) => {
    changeRole({ userId, role }, { onSuccess: () => setModalOpen(false) });
  };

  const kpis = [
    { label: "Total", value: stats.total, icon: Users, color: "text-primary" },
    { label: "Admins", value: stats.admins, icon: Shield, color: "text-red-500" },
    { label: "Managers", value: stats.managers, icon: UserCog, color: "text-amber-500" },
    { label: "Employees", value: stats.employees, icon: User, color: "text-blue-500" },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar />
        <div className="flex-1 flex flex-col">
          <DashboardTopbar />
          <main className="flex-1 p-6 space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
              <p className="text-muted-foreground">Administra los usuarios y roles de la plataforma</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-muted ${kpi.color}`}>
                    <kpi.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Search + View Toggle */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nombre..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex gap-1 border rounded-md p-0.5">
                <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("list")}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setView("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Users className="h-12 w-12 mb-3 opacity-40" />
                <p>No se encontraron usuarios</p>
              </div>
            ) : view === "list" ? (
              <UsersTable users={filtered} onEditRole={handleEditRole} />
            ) : (
              <UsersGrid users={filtered} onEditRole={handleEditRole} />
            )}

            <ChangeRoleModal
              user={selectedUser}
              open={modalOpen}
              onOpenChange={setModalOpen}
              onConfirm={handleConfirmRole}
              isLoading={isChangingRole}
            />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminUsuarios;
