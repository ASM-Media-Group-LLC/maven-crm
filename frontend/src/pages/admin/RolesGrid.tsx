import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Trash2, Settings2, MoreVertical, Users, UserCog } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_TIER_SHORT, type RoleConfig } from "./useRoles";
import { useLanguage } from "@/hooks/useLanguage";

interface RolesGridProps {
  roles: RoleConfig[];
  onEdit: (role: RoleConfig) => void;
  onDelete: (role: RoleConfig) => void;
  onSetPermissions: (role: RoleConfig) => void;
  onToggleActive: (role: RoleConfig) => void;
  onManageUsers: (role: RoleConfig) => void;
}

const RolesGrid = ({ roles, onEdit, onDelete, onSetPermissions, onToggleActive, onManageUsers }: RolesGridProps) => {
  const { t } = useLanguage();
  return (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {roles.map((role) => (
      <Card key={role.id} className="group hover:shadow-md transition-shadow relative">
        <CardContent className="p-5">
          <div className="absolute top-3 right-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("admin.users.moreActions")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onManageUsers(role)}>
                  <UserCog className="h-4 w-4 mr-2" /> {t("admin.roles.manageUsers")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSetPermissions(role)}>
                  <Settings2 className="h-4 w-4 mr-2" /> {t("admin.roles.permissions")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(role)}>
                  <Pencil className="h-4 w-4 mr-2" /> {t("common.edit")}
                </DropdownMenuItem>
                {!role.is_system && (
                  <DropdownMenuItem onClick={() => onDelete(role)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> {t("common.delete")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-col items-center text-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-semibold capitalize">{role.name}</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {role.description || t("admin.roles.noDescription")}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-center">
              <Badge variant="secondary" className="text-xs tabular-nums" title={t("admin.roles.levelHint")}>{t(ROLE_TIER_SHORT[role.tier])}{role.tier !== "admin" ? ` · ${role.level}` : ""}</Badge>
              {role.is_system && (
                <Badge variant="outline" className="text-xs">{t("admin.roles.system")}</Badge>
              )}
              <button
                type="button"
                onClick={() => onManageUsers(role)}
                className="focus:outline-none focus:ring-2 focus:ring-ring rounded-full"
                title={t("admin.roles.manageUsersOfRole")}
              >
                <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors">
                  {t(role.user_count === 1 ? "admin.roles.userCountOne" : "admin.roles.userCountOther", { n: role.user_count })}
                </Badge>
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">{t("common.active")}</span>
              <Switch
                checked={role.is_active}
                onCheckedChange={() => onToggleActive(role)}
                aria-label={t("common.active")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
  );
};

export default RolesGrid;
