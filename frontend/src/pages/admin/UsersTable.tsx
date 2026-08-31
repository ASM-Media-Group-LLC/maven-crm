import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, KeyRound, UserCog, X, ExternalLink, AtSign } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";

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
  const navigate = useNavigate();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Ficha HR</TableHead>
            <TableHead>Fecha de registro</TableHead>
            <TableHead className="sticky right-0 bg-card text-right shadow-[inset_6px_0_6px_-6px_rgba(0,0,0,0.35)]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatar_url ?? ""} />
                    <AvatarFallback>{(user.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{user.full_name || "Sin nombre"}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                {user.email || "—"}
              </TableCell>
              <TableCell>
                {user.role ? (
                  <Badge variant={roleBadgeVariant[user.role] ?? "outline"} className="inline-flex items-center gap-1 pr-1">
                    {user.role}
                    {user.manageable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveRole(user); }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">Sin rol</span>
                )}
              </TableCell>
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
                  <span className="text-muted-foreground text-xs">Sin ficha HR</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: es }) : "—"}
              </TableCell>
              <TableCell className="sticky right-0 bg-card text-right shadow-[inset_6px_0_6px_-6px_rgba(0,0,0,0.35)]">
                <TooltipProvider>
                  <div className="flex justify-end gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(user)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar</TooltipContent>
                    </Tooltip>
                    {/* Jerarquía (24/08): estas 3 solo se muestran si la RPC dijo que
                        puedes gestionar esa cuenta (nivel menor al tuyo y no eres tú).
                        Es UX — el candado real está en las edge functions. */}
                    {user.manageable && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditRole(user)}>
                              <UserCog className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Asignar rol</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onResetPassword(user)}>
                              <KeyRound className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reset contraseña</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMigrarCorreo(user)}>
                              <AtSign className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cambiar correo / crear casilla</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(user)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar</TooltipContent>
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

