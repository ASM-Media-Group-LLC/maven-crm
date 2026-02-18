import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { useRoles, type RoleConfig } from "./useRoles";
import RolesTable from "./RolesTable";
import CreateRoleModal from "./CreateRoleModal";
import EditRoleModal from "./EditRoleModal";
import DeleteRoleDialog from "./DeleteRoleDialog";
import SetPermissionsModal from "./SetPermissionsModal";

interface RolesContentProps {
  search?: string;
}

const RolesContent = ({ search = "" }: RolesContentProps) => {
  const { roles, isLoading, createRole, updateRole, deleteRole, toggleActive, isCreating, isUpdating, isDeleting } = useRoles();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleConfig | null>(null);
  const [deleteRoleState, setDeleteRoleState] = useState<RoleConfig | null>(null);
  const [permRole, setPermRole] = useState<RoleConfig | null>(null);

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
      <RolesTable
        roles={filteredRoles}
        onEdit={setEditRole}
        onDelete={setDeleteRoleState}
        onSetPermissions={setPermRole}
        onToggleActive={(role) => toggleActive({ id: role.id, is_active: !role.is_active })}
      />

      <CreateRoleModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onConfirm={(name, description) => {
          createRole({ name, description }, { onSuccess: () => setCreateOpen(false) });
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
    </div>
  );
};

export default RolesContent;
