import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, KeyRound, UserCog, Shield, User, X, ExternalLink, AtSign } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

const roleConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  admin: { icon: <Shield className="h-3 w-3" />, variant: "destructive" },
  manager: { icon: <UserCog className="h-3 w-3" />, variant: "default" },
  employee: { icon: <User className="h-3 w-3" />, variant: "secondary" },
};

interface UsersGridProps {
  users: AdminUser[];
  onEditRole: (user: AdminUser) => void;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  /** Cambiar el correo de acceso y crearle la casilla del equipo. */
  onMigrarCorreo: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  onRemoveRole: (user: AdminUser) => void;
}

const UsersGrid = ({ users, onEditRole, onEdit, onResetPassword, onMigrarCorreo, onDelete, onRemoveRole }: UsersGridProps) => {
  const f = useFormato();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {users.map((user) => {
        const config = roleConfig[user.role ?? ""] ?? { icon: null, variant: "outline" as const };
        return (
          <Card key={user.id} className="group hover:shadow-md transition-shadow relative">
            <CardContent className="p-5">
              <div className="absolute top-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("admin.users.moreActions")}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(user)}>
                      <Pencil className="h-4 w-4 mr-2" /> {t("common.edit")}
                    </DropdownMenuItem>
                    {/* Cambiar correo / crear casilla: TAMBIÉN sobre uno mismo
                        (`manageable` es false en tu propia fila). Ver UsersTable. */}
                    {(user.manageable || user.id === authUser?.id) && (
                      <DropdownMenuItem onClick={() => onMigrarCorreo(user)}>
                        <AtSign className="h-4 w-4 mr-2" /> {t("admin.users.changeEmail")}
                      </DropdownMenuItem>
                    )}
                    {/* Jerarquía (24/08): solo sobre cuentas gestionables. UX; el
                        candado real vive en las edge functions. */}
                    {user.manageable && (
                      <>
                        <DropdownMenuItem onClick={() => onEditRole(user)}>
                          <UserCog className="h-4 w-4 mr-2" /> {t("admin.users.assignRole")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onResetPassword(user)}>
                          <KeyRound className="h-4 w-4 mr-2" /> {t("admin.users.resetPassword")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(user)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> {t("common.delete")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-col items-center text-center gap-3">
                {/* Igual que en UsersTable: el muñequito vive en avatar_seed y un
                    Avatar crudo nunca lo dibujaba. */}
                <UserAvatar name={user.full_name} src={user.avatar_url} seed={user.avatar_seed} size="xl" />
                <div>
                  <p className="font-semibold">{user.full_name || t("admin.noName")}</p>
                  {user.email ? (
                    <button
                      type="button"
                      title={t("admin.clickToCopy", { email: user.email })}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(user.email!);
                        toast({ title: t("admin.emailCopied"), description: user.email! });
                      }}
                      className="block text-xs text-muted-foreground truncate max-w-[180px] text-left hover:text-foreground hover:underline decoration-dotted underline-offset-2 cursor-copy"
                    >
                      {user.email}
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("admin.users.noEmail")}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: f.fechas }) : "—"}
                  </p>
                </div>
                {user.role ? (
                  <Badge variant={config.variant} className="flex items-center gap-1 pr-1">
                    {config.icon}
                    {user.role}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveRole(user); }}
                      title={t("admin.users.removeRoleOf", { role: user.role, name: user.full_name ?? t("admin.thisPerson") })}
                      aria-label={t("admin.users.removeRoleOf", { role: user.role, name: user.full_name ?? t("admin.thisPerson") })}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">{t("admin.noRole")}</span>
                )}
                {/* Ficha HR: sólo si la hay. El "Sin ficha HR" salía en TODAS las
                    tarjetas (hoy no hay un solo perfil vinculado) y era un renglón
                    de ruido por persona. */}
                {user.linked_employee && (
                  <button
                    onClick={() => navigate(`/hr/empleado/${user.linked_employee!.id}`)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {user.linked_employee.first_name} {user.linked_employee.last_name}
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default UsersGrid;

