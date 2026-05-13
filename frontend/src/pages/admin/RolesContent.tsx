import { useState, useEffect } from "react";
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
}

const RolesContent = ({ search = "", view, createOpen, onCreateOpenChange }: RolesContentProps) => {
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
        onConfirm={(name, description) => {
          createRole({ name, description }, { onSuccess: () => onCreateOpenChange(false) });
        }}
        isLoading={isCreating}
      />

      <EditRoleModal
        open={!!editRole}
        onOpenChange={(o) => !o && setEditRole(null)}
        role={editRole}
        onConfirm={(id, name, description) => {
          updateRole({ id, name, description }, { onSuccess: () => setEditRole(null) });
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
