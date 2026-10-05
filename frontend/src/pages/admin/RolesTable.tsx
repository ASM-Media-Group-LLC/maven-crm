import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Settings2 } from "lucide-react";
import { ROLE_TIER_SHORT, type RoleConfig } from "./useRoles";
import { useLanguage } from "@/hooks/useLanguage";

interface RolesTableProps {
  roles: RoleConfig[];
  onEdit: (role: RoleConfig) => void;
  onDelete: (role: RoleConfig) => void;
  onSetPermissions: (role: RoleConfig) => void;
  onToggleActive: (role: RoleConfig) => void;
  onManageUsers: (role: RoleConfig) => void;
}

const RolesTable = ({ roles, onEdit, onDelete, onSetPermissions, onToggleActive, onManageUsers }: RolesTableProps) => {
  const { t } = useLanguage();
  return (
  <div className="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("common.role")}</TableHead>
          <TableHead>{t("common.description")}</TableHead>
          <TableHead>{t("admin.usersLabel")}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">{t("common.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {roles.map((role) => (
          <TableRow key={role.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{role.name}</span>
                <Badge variant="secondary" className="text-xs tabular-nums" title={t("admin.roles.levelHint")}>{t(ROLE_TIER_SHORT[role.tier])}{role.tier !== "admin" ? ` · ${role.level}` : ""}</Badge>
                {role.is_system && (
                  <Badge variant="outline" className="text-xs">{t("admin.roles.system")}</Badge>
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
                title={t("admin.roles.manageUsersOfRole")}
              >
                {role.user_names.slice(0, 2).map((name, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{name || t("admin.noName")}</Badge>
                ))}
                {role.user_count > 2 && (
                  <Badge variant="outline" className="text-xs">+{role.user_count - 2}</Badge>
                )}
                {role.user_count === 0 && (
                  <span className="text-muted-foreground text-sm">{t("admin.roles.addShort")}</span>
                )}
              </button>
            </TableCell>
            <TableCell>
              <Switch
                checked={role.is_active}
                onCheckedChange={() => onToggleActive(role)}
                aria-label={t("common.active")}
              />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onSetPermissions(role)} title={t("admin.roles.permissions")} aria-label={t("admin.roles.permissions")}>
                  <Settings2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(role)} title={t("common.edit")} aria-label={t("common.edit")}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!role.is_system && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(role)} title={t("common.delete")} aria-label={t("common.delete")}>
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
};

export default RolesTable;
