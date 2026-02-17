import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Shield, UserCog, User } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const roleConfig: Record<string, { icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  admin: { icon: <Shield className="h-3 w-3" />, variant: "destructive" },
  manager: { icon: <UserCog className="h-3 w-3" />, variant: "default" },
  employee: { icon: <User className="h-3 w-3" />, variant: "secondary" },
};

interface UsersGridProps {
  users: AdminUser[];
  onEditRole: (user: AdminUser) => void;
}

const UsersGrid = ({ users, onEditRole }: UsersGridProps) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {users.map((user) => {
      const config = roleConfig[user.role ?? ""] ?? { icon: null, variant: "outline" as const };
      return (
        <Card key={user.id} className="group hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex flex-col items-center text-center gap-3">
              <Avatar className="h-16 w-16">
                <AvatarImage src={user.avatar_url ?? ""} />
                <AvatarFallback className="text-lg">{(user.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{user.full_name || "Sin nombre"}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: es }) : "—"}
                </p>
              </div>
              <Badge variant={config.variant} className="flex items-center gap-1">
                {config.icon}
                {user.role ?? "Sin rol"}
              </Badge>
              <Button variant="outline" size="sm" className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onEditRole(user)}>
                <Pencil className="h-3 w-3 mr-1" /> Cambiar rol
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    })}
  </div>
);

export default UsersGrid;
