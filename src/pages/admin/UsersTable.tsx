import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import type { AdminUser } from "./useAdminUsers";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const roleBadgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  manager: "default",
  employee: "secondary",
};

interface UsersTableProps {
  users: AdminUser[];
  onEditRole: (user: AdminUser) => void;
}

const UsersTable = ({ users, onEditRole }: UsersTableProps) => (
  <div className="rounded-md border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Fecha de registro</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
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
            <TableCell>
              <Badge variant={roleBadgeVariant[user.role ?? ""] ?? "outline"}>
                {user.role ?? "Sin rol"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {user.created_at ? format(new Date(user.created_at), "dd MMM yyyy", { locale: es }) : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" onClick={() => onEditRole(user)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default UsersTable;
