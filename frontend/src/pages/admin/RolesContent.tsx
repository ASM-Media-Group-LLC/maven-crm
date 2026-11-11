import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useRoles, type RoleConfig } from "./useRoles";
import RolesTable from "./RolesTable";
import RolesGrid from "./RolesGrid";
import CreateRoleModal from "./CreateRoleModal";
import EditRoleModal from "./EditRoleModal";
import DeleteRoleDialog from "./DeleteRoleDialog";
import SetPermissionsModal from "./SetPermissionsModal";
import ManageRoleUsersModal from "./ManageRoleUsersModal";

interface RolesContentProps {
  search?: string;
  view: "list" | "grid";
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  /** Nombre de un rol cuyos permisos se abren solos al cargar (una vez). */
  abrirPermisosDe?: string | null;
}

const RolesContent = ({ search = "", view, createOpen, onCreateOpenChange, abrirPermisosDe = null }: RolesContentProps) => {
  const {
    roles,
    isLoading,
    createRole,
    updateRole,
    deleteRole,
    toggleActive,
    assignUserToRole,
    removeUserFromRole,
    isCreating,
    isUpdating,
    isDeleting,
    isAssigning,
    isRemoving,
  } = useRoles();
  const [editRole, setEditRole] = useState<RoleConfig | null>(null);
  const [deleteRoleState, setDeleteRoleState] = useState<RoleConfig | null>(null);
  const [permRole, setPermRole] = useState<RoleConfig | null>(null);
  const [manageUsersRoleId, setManageUsersRoleId] = useState<string | null>(null);

  // Mantenemos siempre la versión fresca del rol seleccionado para que el
  // modal refleje cambios (asignar/quitar usuarios) sin cerrarse.
  const manageUsersRole = manageUsersRoleId
    ? roles.find((r) => r.id === manageUsersRoleId) ?? null
    : null;

  useEffect(() => {
    if (manageUsersRoleId && !roles.some((r) => r.id === manageUsersRoleId)) {
      setManageUsersRoleId(null);
    }
  }, [roles, manageUsersRoleId]);

  // Los permisos de un rol pedido por la URL se abren UNA vez, cuando llegan los roles.
  // Primero el nombre exacto; si no, sin mayúsculas.
  const permisosAbiertos = useRef(false);
  useEffect(() => {
    if (!abrirPermisosDe || permisosAbiertos.current || isLoading) return;
    const pedido = abrirPermisosDe.trim().toLowerCase();
    const rol = roles.find((r) => r.name === abrirPermisosDe) ?? roles.find((r) => r.name.toLowerCase() === pedido);
    if (!rol) return;
    permisosAbiertos.current = true;
    setPermRole(rol);
  }, [abrirPermisosDe, roles, isLoading]);

  const filteredRoles = search.trim()
    ? roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : roles;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === "list" ? (
        <RolesTable
          roles={filteredRoles}
          onEdit={setEditRole}
          onDelete={setDeleteRoleState}
          onSetPermissions={setPermRole}
          onToggleActive={(role) => toggleActive({ id: role.id, is_active: !role.is_active })}
          onManageUsers={(role) => setManageUsersRoleId(role.id)}
        />
      ) : (
        <RolesGrid
          roles={filteredRoles}
          onEdit={setEditRole}
          onDelete={setDeleteRoleState}
          onSetPermissions={setPermRole}
          onToggleActive={(role) => toggleActive({ id: role.id, is_active: !role.is_active })}
          onManageUsers={(role) => setManageUsersRoleId(role.id)}
        />
      )}

      <CreateRoleModal
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        onConfirm={(name, description, tier) => {
          createRole({ name, description, tier }, { onSuccess: () => onCreateOpenChange(false) });
        }}
        isLoading={isCreating}
      />

      <EditRoleModal
        open={!!editRole}
        onOpenChange={(o) => !o && setEditRole(null)}
        role={editRole}
        onConfirm={(id, name, description, aiDailyQuota, tier, level) => {
          updateRole({ id, name, description, ai_daily_quota: aiDailyQuota, tier, level }, { onSuccess: () => setEditRole(null) });
        }}
        isLoading={isUpdating}
      />

      <DeleteRoleDialog
        open={!!deleteRoleState}
        onOpenChange={(o) => !o && setDeleteRoleState(null)}
        roleName={deleteRoleState?.name ?? ""}
        onConfirm={() => {
          if (deleteRoleState) deleteRole(deleteRoleState.id, { onSuccess: () => setDeleteRoleState(null) });
        }}
        isLoading={isDeleting}
      />

      <SetPermissionsModal
        open={!!permRole}
        onOpenChange={(o) => !o && setPermRole(null)}
        roleId={permRole?.id ?? null}
        roleName={permRole?.name ?? ""}
      />

      <ManageRoleUsersModal
        open={!!manageUsersRole}
        onOpenChange={(o) => !o && setManageUsersRoleId(null)}
        role={manageUsersRole}
        onAssign={(userId, role) => assignUserToRole({ userId, role })}
        onRemove={(userId) => removeUserFromRole({ userId })}
        isMutating={isAssigning || isRemoving}
      />
    </div>
  );
};

export default RolesContent;
