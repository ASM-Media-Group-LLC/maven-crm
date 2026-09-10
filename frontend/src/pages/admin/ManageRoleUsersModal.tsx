import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserMinus, UserPlus, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useAdminUsers } from "./useAdminUsers";
import type { RoleConfig } from "./useRoles";

interface ManageRoleUsersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleConfig | null;
  onAssign: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
  isMutating: boolean;
}

interface PendingAssign {
  userId: string;
  userName: string;
  currentRole: string | null;
}

const ManageRoleUsersModal = ({
  open,
  onOpenChange,
  role,
  onAssign,
  onRemove,
  isMutating,
}: ManageRoleUsersModalProps) => {
  const [assignedSearch, setAssignedSearch] = useState("");
  const [availableSearch, setAvailableSearch] = useState("");
  const [pendingAssign, setPendingAssign] = useState<PendingAssign | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ userId: string; userName: string } | null>(null);

  const { users, isLoading } = useAdminUsers();

  const assignedIds = useMemo(() => new Set(role?.members.map((m) => m.id) ?? []), [role]);

  const assignedMembers = useMemo(() => {
    if (!role) return [];
    const q = assignedSearch.trim().toLowerCase();
    return role.members.filter((m) => !q || m.full_name.toLowerCase().includes(q));
  }, [role, assignedSearch]);

  const availableUsers = useMemo(() => {
    const q = availableSearch.trim().toLowerCase();
    return users
      .filter((u) => !assignedIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        return (
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
        );
      });
  }, [users, assignedIds, availableSearch]);

  const handleAddClick = (userId: string, userName: string, currentRole: string | null) => {
    if (!role) return;
    // Si el user ya tenía otro rol, confirmamos para evitar sobrescrituras silenciosas.
    if (currentRole && currentRole !== role.name) {
      setPendingAssign({ userId, userName, currentRole });
    } else {
      onAssign(userId, role.name);
    }
  };

  const handleRemoveClick = (userId: string, userName: string) => {
    setPendingRemove({ userId, userName });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Gestionar usuarios — <span className="capitalize">{role?.name ?? ""}</span>
            </DialogTitle>
            <DialogDescription>
              {role
                ? `${role.user_count} usuario${role.user_count !== 1 ? "s" : ""} con este rol.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="assigned" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="assigned">Asignados ({role?.user_count ?? 0})</TabsTrigger>
              <TabsTrigger value="available">Agregar</TabsTrigger>
            </TabsList>

            <TabsContent value="assigned" className="flex-1 flex flex-col min-h-0 mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario..."
                  value={assignedSearch}
                  onChange={(e) => setAssignedSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="flex-1 min-h-[280px] border rounded-md">
                {assignedMembers.length === 0 ? (
                  <EmptyState
                    className="py-12"
                    icon={<UserPlus className="h-8 w-8 text-muted-foreground" />}
                    title={role?.user_count === 0 ? "Aún no hay usuarios con este rol." : "No hay resultados."}
                  />
                ) : (
                  <ul className="divide-y">
                    {assignedMembers.map((m) => (
                      <li key={m.id} className="flex items-center justify-between p-3 hover:bg-muted/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar name={m.full_name} src={m.avatar_url} size="sm" />
                          <span className="text-sm truncate">{m.full_name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                          onClick={() => handleRemoveClick(m.id, m.full_name)}
                          disabled={isMutating}
                        >
                          <UserMinus className="h-4 w-4 mr-1" />
                          Quitar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="available" className="flex-1 flex flex-col min-h-0 mt-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuario por nombre o email..."
                  value={availableSearch}
                  onChange={(e) => setAvailableSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="flex-1 min-h-[280px] border rounded-md">
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : availableUsers.length === 0 ? (
                  <EmptyState
                    className="py-12"
                    icon={<UserPlus className="h-8 w-8 text-muted-foreground" />}
                    title={users.length === 0 ? "No hay usuarios." : "Todos los usuarios ya tienen este rol o no coinciden con la búsqueda."}
                  />
                ) : (
                  <ul className="divide-y">
                    {availableUsers.map((u) => (
                      <li key={u.id} className="flex items-center justify-between p-3 hover:bg-muted/40">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar name={u.full_name ?? "U"} src={u.avatar_url} size="sm" />
                          <div className="min-w-0">
                            <p className="text-sm truncate">{u.full_name || "Sin nombre"}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {u.email && (
                                <span className="text-xs text-muted-foreground truncate">{u.email}</span>
                              )}
                              {u.role && (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {u.role}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          onClick={() => handleAddClick(u.id, u.full_name ?? "Sin nombre", u.role)}
                          disabled={isMutating}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Agregar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingAssign}
        onOpenChange={(o) => !o && setPendingAssign(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar rol del usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAssign && role && (
                <>
                  <span className="font-medium">{pendingAssign.userName}</span> tiene actualmente el rol{" "}
                  <Badge variant="outline" className="capitalize ml-1">{pendingAssign.currentRole}</Badge>. Al
                  agregarlo a <Badge variant="outline" className="capitalize ml-1">{role.name}</Badge> se
                  reemplazará su rol actual (un usuario solo puede tener un rol).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingAssign && role) {
                  onAssign(pendingAssign.userId, role.name);
                }
                setPendingAssign(null);
              }}
            >
              Reemplazar rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingRemove}
        onOpenChange={(o) => !o && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar usuario del rol?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove && role && (
                <>
                  <span className="font-medium">{pendingRemove.userName}</span> quedará sin rol asignado.
                  No podrá acceder a módulos hasta que le asignes otro rol.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRemove) {
                  onRemove(pendingRemove.userId);
                }
                setPendingRemove(null);
              }}
            >
              Quitar del rol
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ManageRoleUsersModal;
