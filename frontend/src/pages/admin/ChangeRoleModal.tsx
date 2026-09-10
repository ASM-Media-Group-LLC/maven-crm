import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { Shield, UserCog, User, Headphones, DollarSign, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AdminUser } from "./useAdminUsers";
import type { AppRole } from "@/hooks/useUserRole";

interface ChangeRoleModalProps {
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (userId: string, role: AppRole) => void;
  isLoading: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  admin: <Shield className="h-4 w-4" />,
  manager: <UserCog className="h-4 w-4" />,
  employee: <User className="h-4 w-4" />,
  agent: <Headphones className="h-4 w-4" />,
  closer: <DollarSign className="h-4 w-4" />,
  supervisor: <Eye className="h-4 w-4" />,
};

const colorMap: Record<string, string> = {
  admin: "text-red-500",
  manager: "text-amber-500",
  employee: "text-blue-500",
  agent: "text-green-500",
  closer: "text-purple-500",
  supervisor: "text-cyan-500",
};

const ChangeRoleModal = ({ user, open, onOpenChange, onConfirm, isLoading }: ChangeRoleModalProps) => {
  const [selectedRole, setSelectedRole] = useState<AppRole>(user?.role ?? "employee");

  // Fetch roles dynamically from roles_config
  const { data: activeRoles = [] } = useQuery({
    queryKey: ["roles-config-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles_config")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

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
              <UserAvatar name={user.full_name} src={user.avatar_url} seed={user.avatar_seed} size="md" />
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
                  {activeRoles.map((r) => (
                    <SelectItem key={r.name} value={r.name}>
                      <div className="flex items-center gap-2">
                        <span className={colorMap[r.name] || "text-muted-foreground"}>
                          {iconMap[r.name] || <User className="h-4 w-4" />}
                        </span>
                        <span className="capitalize">{r.name}</span>
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
