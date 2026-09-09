import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Settings2 } from "lucide-react";
import { ROLE_TIER_SHORT, type RoleConfig } from "./useRoles";

interface RolesTableProps {
  roles: RoleConfig[];
  onEdit: (role: RoleConfig) => void;
  onDelete: (role: RoleConfig) => void;
  onSetPermissions: (role: RoleConfig) => void;
  onToggleActive: (role: RoleConfig) => void;
  onManageUsers: (role: RoleConfig) => void;
}

const RolesTable = ({ roles, onEdit, onDelete, onSetPermissions, onToggleActive, onManageUsers }: RolesTableProps) => (
  <div className="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rol</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Usuarios</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow key={role.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{role.name}</span>
                <Badge variant="secondary" className="text-xs">{ROLE_TIER_SHORT[role.tier]}</Badge>
                {role.is_system && (
                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground max-w-xs truncate">
              {role.description || "—"}
            </TableCell>
            <TableCell>
              <button
                type="button"
                onClick={() => onManageUsers(role)}
                className="flex items-center gap-1 rounded px-1 py-1 -mx-1 -my-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition-colors text-left"
                title="Gestionar usuarios de este rol"
              >
                {role.user_names.slice(0, 2).map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                ))}
                {role.user_count > 2 && (
                  <Badge variant="outline" className="text-xs">+{role.user_count - 2}</Badge>
                )}
                {role.user_count === 0 && (
                  <span className="text-muted-foreground text-sm">— Agregar</span>
                )}
              </button>
            </TableCell>
            <TableCell>
              <Switch
                checked={role.is_active}
                onCheckedChange={() => onToggleActive(role)}
              />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onSetPermissions(role)}>
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(role)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!role.is_system && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(role)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default RolesTable;
