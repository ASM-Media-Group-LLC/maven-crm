import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, KeyRound, UserCog, X, ExternalLink, AtSign } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { DriveFullToggle } from "./DriveFullToggle";
import { ExonerarCamaraToggle } from "./ExonerarCamaraToggle";

const roleBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  manager: "default",
  employee: "secondary",
};

interface UsersTableProps {
  users: AdminUser[];
  onEditRole: (user: AdminUser) => void;
  onEdit: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void;
  /** Cambiar el correo de acceso y crearle la casilla del equipo. */
  onMigrarCorreo: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  onRemoveRole: (user: AdminUser) => void;
}

const UsersTable = ({ users, onEditRole, onEdit, onResetPassword, onMigrarCorreo, onDelete, onRemoveRole }: UsersTableProps) => {
  const f = useFormato();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  // La columna "Ficha HR" mostraba "Sin ficha HR" en TODAS las filas (hoy no hay
  // un solo perfil vinculado a un empleado), gastando ancho sin informar nada.
  // No se saca la feature: la columna aparece en cuanto exista una vinculación.
  const hayFichasHR = users.some((u) => u.linked_employee);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.user")}</TableHead>
            <TableHead>{t("common.email")}</TableHead>
            <TableHead>{t("common.role")}</TableHead>
            {hayFichasHR && <TableHead>{t("admin.users.colHrRecord")}</TableHead>}
            <TableHead>{t("admin.users.colRegistered")}</TableHead>
            <TableHead className="sticky right-0 bg-card text-right shadow-[inset_6px_0_6px_-6px_rgba(0,0,0,0.35)]">{t("common.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="group/fila">
              <TableCell>
                <div className="flex items-center gap-3">
                  {/* UserAvatar y no un Avatar crudo: acá se perdía el muñequito
                      DiceBear de las 15 personas que eligieron uno (vive en
                      profiles.avatar_seed, no en avatar_url) y las iniciales salían
                      de un [0] que parte por la mitad los nombres con emoji. */}
                  <UserAvatar name={user.full_name} src={user.avatar_url} seed={user.avatar_seed} size="sm" />
                  <span className="font-medium">{user.full_name || t("admin.noName")}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[200px]">
                {/* En pantallas chicas el correo se trunca y no había forma de
                    copiarlo: clic = copiar el correo COMPLETO (no lo que se ve),
                    y el title muestra la dirección entera al pasar el mouse. */}
                {user.email ? (
                  <button
                    type="button"
                    title={t("admin.clickToCopy", { email: user.email })}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(user.email!);
                      toast({ title: t("admin.emailCopied"), description: user.email! });
                    }}
                    className="block w-full truncate text-left hover:text-foreground hover:underline decoration-dotted underline-offset-2 cursor-copy"
                  >
                    {user.email}
                  </button>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {user.role ? (
                  <Badge variant={roleBadgeVariant[user.role] ?? "outline"} className="inline-flex items-center gap-1 pr-1">
                    {user.role}
                    {user.manageable && (
                      // Quitar el rol es destructivo y vivía siempre visible dentro
                      // del badge, en una tabla densa: fácil de pegarle sin querer.
                      // Ahora aparece sólo al pasar el mouse por la fila.
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveRole(user); }}
                        title={t("admin.users.removeRoleOf", { role: user.role, name: user.full_name ?? t("admin.thisPerson") })}
                        aria-label={t("admin.users.removeRoleOf", { role: user.role, name: user.full_name ?? t("admin.thisPerson") })}
                        className="ml-0.5 rounded-full p-0.5 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover/fila:opacity-100 dark:hover:bg-white/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">{t("admin.noRole")}</span>
                )}
              </TableCell>
              {hayFichasHR && (
                <TableCell>
                  {user.linked_employee ? (
                    <button
                      onClick={() => navigate(`/hr/empleado/${user.linked_employee!.id}`)}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {user.linked_employee.first_name} {user.linked_employee.last_name}
                    </button>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="text-muted-foreground">
                {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: f.fechas }) : "—"}
              </TableCell>
              <TableCell className="sticky right-0 bg-card text-right shadow-[inset_6px_0_6px_-6px_rgba(0,0,0,0.35)]">
                <TooltipProvider>
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(user)} aria-label={t("common.edit")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t("common.edit")}</TooltipContent>
                    </Tooltip>
                    {/* Cambiar correo / crear casilla: TAMBIÉN sobre uno mismo.
                        `manageable` es false en tu propia fila, así que un admin no
                        podía asignarse su casilla y tenía que pedírselo a otro
                        (reporte de Jhon: le pasó a Jacke). Cambiar el propio correo
                        es benigno —mismo user_id y contraseña—, a diferencia de
                        cambiarse el rol o borrarse, que siguen ocultos. El backend
                        (`migrate_email`) ya permite el self-target. */}
                    {(user.manageable || user.id === authUser?.id) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMigrarCorreo(user)} aria-label={t("admin.users.changeEmail")}>
                            <AtSign className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("admin.users.changeEmail")}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Adendum de Drive: visible para toda fila (muestra el estado);
                        el candado real de escritura está en la RPC. */}
                    <DriveFullToggle user={user} />
                    <ExonerarCamaraToggle user={user} />
                    {/* Jerarquía (24/08): estas solo se muestran si la RPC dijo que
                        puedes gestionar esa cuenta (nivel menor al tuyo y no eres tú).
                        Es UX — el candado real está en las edge functions. */}
                    {user.manageable && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditRole(user)} aria-label={t("admin.users.assignRole")}>
                              <UserCog className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("admin.users.assignRole")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onResetPassword(user)} aria-label={t("admin.users.resetPassword")}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("admin.users.resetPassword")}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(user)} aria-label={t("common.delete")}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("common.delete")}</TooltipContent>
                        </Tooltip>
                      </>
                    )}
                  </div>
                </TooltipProvider>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UsersTable;

