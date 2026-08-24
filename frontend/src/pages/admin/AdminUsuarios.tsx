import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, LayoutGrid, List, Shield, UserCog, Users, User, Plus, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import StatChip from "@/components/StatChip";
import { useAdminUsers, type AdminUser } from "./useAdminUsers";
import UsersTable from "./UsersTable";
import UsersGrid from "./UsersGrid";
import ChangeRoleModal from "./ChangeRoleModal";
import EditUserModal from "./EditUserModal";
import DeleteUserDialog from "./DeleteUserDialog";
import RolesContent from "./RolesContent";
import ResetPasswordModal from "./ResetPasswordModal";
import AddUserModal, { type CredencialesCreadas } from "./AddUserModal";
import type { AppRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { adminInvoke, SessionExpiredError } from "@/lib/adminInvoke";

const AdminUsuarios = () => {
  const [credenciales, setCredenciales] = useState<CredencialesCreadas | null>(null);
  const navigate = useNavigate();
  const { canAccess } = usePermissions();
  const { users, isLoading, changeRole, isChangingRole, stats } = useAdminUsers();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [activeTab, setActiveTab] = useState<"usuarios" | "roles">("usuarios");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const adminAction = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return adminInvoke("admin-user-actions", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => {
      if (e instanceof SessionExpiredError) {
        toast({ title: "Sesión expirada", description: e.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    },
  });

  const handleEdit = (user: AdminUser) => { setSelectedUser(user); setEditOpen(true); };
  const handleDelete = (user: AdminUser) => { setSelectedUser(user); setDeleteOpen(true); };
  const handleResetPassword = (user: AdminUser) => {
    setSelectedUser(user);
    setResetPwOpen(true);
  };

  const kpis = [
    { label: "Total", value: String(stats.total), icon: Users, color: "bg-primary" },
    { label: "Admins", value: String(stats.admins), icon: Shield, color: "bg-destructive" },
    { label: "Managers", value: String(stats.managers), icon: UserCog, color: "bg-warning" },
    { label: "Employees", value: String(stats.employees), icon: User, color: "bg-primary" },
  ];

  // El tab "Roles" (CRUD de roles + permisos) se gatea con el permiso "Roles".
  // El fallback de canAccess concede a quien tenga el módulo Administración, así que
  // los admins (que además bypassan) lo siguen viendo; permite restringirlo por rol.
  const canManageRoles = canAccess("Administración", "Roles");
  const tabs = [
    { key: "usuarios" as const, label: "Usuarios" },
    ...(canManageRoles ? [{ key: "roles" as const, label: "Roles" }] : []),
  ];

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
            {/* Fixed Header */}
            <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a Settings
              </button>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-semibold">Gestión de Usuarios</h1>
                  <p className="text-muted-foreground">Administra los usuarios y roles de la plataforma</p>
                </div>
                {activeTab === "usuarios" ? (
                  <Button variant="outline" size="sm" onClick={() => setAddUserOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Usuario
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setCreateRoleOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo Rol
                  </Button>
                )}
              </div>
            </header>

            {/* Scrollable Area */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {/* KPIs — estáticas (la tabla detallada vive abajo) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpis.map((kpi) => (
                  <StatChip key={kpi.label} label={kpi.label} value={kpi.value} icon={<kpi.icon className="h-3.5 w-3.5" />} color={kpi.color} />
                ))}
              </div>

              {/* Tab bar */}
              <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                {tabs.map((tab) => (
                  <Button
                    key={tab.key}
                    variant={activeTab === tab.key ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => { setActiveTab(tab.key); setSearch(""); }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>

              {/* Search bar - visible for both tabs */}
              <div className="flex items-center justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={activeTab === "usuarios" ? "Buscar por nombre..." : "Buscar rol..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
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

              {activeTab === "usuarios" ? (
                <>
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
                    <UsersTable
                      users={filtered}
                      onEditRole={handleEditRole}
                      onEdit={handleEdit}
                      onResetPassword={handleResetPassword}
                      onDelete={handleDelete}
                      onRemoveRole={(user) => {
                        adminAction.mutate(
                          { action: "remove_role", user_id: user.id },
                          { onSuccess: () => toast({ title: "Rol eliminado" }) }
                        );
                      }}
                    />
                  ) : (
                    <UsersGrid
                      users={filtered}
                      onEditRole={handleEditRole}
                      onEdit={handleEdit}
                      onResetPassword={handleResetPassword}
                      onDelete={handleDelete}
                      onRemoveRole={(user) => {
                        adminAction.mutate(
                          { action: "remove_role", user_id: user.id },
                          { onSuccess: () => toast({ title: "Rol eliminado" }) }
                        );
                      }}
                    />
                  )}

                  <ChangeRoleModal
                    user={selectedUser}
                    open={modalOpen}
                    onOpenChange={setModalOpen}
                    onConfirm={handleConfirmRole}
                    isLoading={isChangingRole}
                  />

                  <EditUserModal
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    user={selectedUser}
                    onConfirm={(data) => {
                      if (selectedUser) {
                        adminAction.mutate(
                          { action: "update_profile", user_id: selectedUser.id, first_name: data.first_name, last_name: data.last_name, role: data.role, ai_daily_quota_override: data.ai_daily_quota_override },
                          { onSuccess: () => { setEditOpen(false); toast({ title: "Usuario actualizado" }); } }
                        );
                      }
                    }}
                    isLoading={adminAction.isPending}
                  />

                  <ResetPasswordModal
                    open={resetPwOpen}
                    onOpenChange={setResetPwOpen}
                    userName={selectedUser?.full_name || ""}
                    userId={selectedUser?.id || ""}
                  />

                  <DeleteUserDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    userName={selectedUser?.full_name || "Sin nombre"}
                    onConfirm={() => {
                      if (selectedUser) {
                        adminAction.mutate(
                          { action: "delete_user", user_id: selectedUser.id },
                          { onSuccess: () => { setDeleteOpen(false); toast({ title: "Usuario eliminado" }); } }
                        );
                      }
                    }}
                    isLoading={adminAction.isPending}
                  />
                </>
              ) : (
                <RolesContent search={search} view={view} createOpen={createRoleOpen} onCreateOpenChange={setCreateRoleOpen} />
              )}

              <AddUserModal
                open={addUserOpen}
                onOpenChange={(o) => {
                  setAddUserOpen(o);
                  if (!o) setCredenciales(null);
                }}
                credenciales={credenciales}
                onConfirm={(data) => {
                  adminAction.mutate(
                    { action: "create_user", ...data },
                    {
                      onSuccess: (res) => {
                        // El modal NO se cierra: pasa a la vista de entrega
                        // con el correo generado y la contraseña temporal,
                        // que es lo que el admin le pasa a la persona. La
                        // casilla es mejor-esfuerzo y su estado se muestra
                        // ahí mismo.
                        const r = res as {
                          email?: string;
                          temp_password?: string;
                          hand_delivery?: boolean;
                          email_sent?: boolean;
                          email_sent_to?: string | null;
                          email_error?: string | null;
                          mailbox?: { ok: boolean; error?: string | null } | null;
                        } | undefined;
                        setCredenciales({
                          email: r?.email ?? "",
                          temp_password: r?.temp_password ?? "",
                          hand_delivery: r?.hand_delivery ?? true,
                          email_sent: r?.email_sent ?? false,
                          email_sent_to: r?.email_sent_to ?? null,
                          email_error: r?.email_error ?? null,
                          mailbox_ok: r?.mailbox?.ok ?? false,
                          mailbox_error: r?.mailbox?.error ?? null,
                        });
                      },
                    }
                  );
                }}
                isLoading={adminAction.isPending}
              />
            </div>
          </main>
  );
};

export default AdminUsuarios;
