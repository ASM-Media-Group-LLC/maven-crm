import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Shield, UserCog, User } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import type { AppRole } from "@/hooks/useUserRole";

interface ChangeRoleModalProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: string, role: AppRole) => void;
  isLoading: boolean;
}

const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string }> = {
  admin: { label: "Admin", icon: <Shield className="h-4 w-4" />, color: "text-red-500" },
  manager: { label: "Manager", icon: <UserCog className="h-4 w-4" />, color: "text-amber-500" },
  employee: { label: "Employee", icon: <User className="h-4 w-4" />, color: "text-blue-500" },
};

const ChangeRoleModal = ({ user, open, onOpenChange, onConfirm, isLoading }: ChangeRoleModalProps) => {
  const [selectedRole, setSelectedRole] = useState<AppRole>(user?.role ?? "employee");

  const handleConfirm = () => {
    if (user) onConfirm(user.id, selectedRole);
  };

  // Reset selected role when user changes
  if (user && selectedRole !== (user.role ?? "employee") && !open) {
    setSelectedRole(user.role ?? "employee");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar Rol</DialogTitle>
        </DialogHeader>

        {user && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user.avatar_url ?? ""} />
                <AvatarFallback>{(user.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user.full_name || "Sin nombre"}</p>
                <p className="text-sm text-muted-foreground">Rol actual: {user.role ?? "Sin rol"}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Nuevo rol</label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(roleConfig) as AppRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      <div className="flex items-center gap-2">
                        <span className={roleConfig[role].color}>{roleConfig[role].icon}</span>
                        <span>{roleConfig[role].label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isLoading || selectedRole === user?.role}>
            {isLoading ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeRoleModal;
