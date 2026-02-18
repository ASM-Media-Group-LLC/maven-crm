import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";
import type { AuditoriaUser } from "./useAuditoriaData";

interface Props {
  users: AuditoriaUser[];
  search: string;
}

const roleBadgeColor: Record<string, string> = {
  admin: "bg-red-500/10 text-red-500 border-red-500/30",
  manager: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  employee: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  agent: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  supervisor: "bg-violet-500/10 text-violet-500 border-violet-500/30",
  closer: "bg-pink-500/10 text-pink-500 border-pink-500/30",
};

const AuditoriaUsersTable = ({ users, search }: Props) => {
  const filtered = search.trim()
    ? users.filter((u) => (u.full_name || "").toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol(es)</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.full_name || "Sin nombre"}</TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {user.roles.length > 0 ? (
                    user.roles.map((r, i) => (
                      <Badge key={i} variant="outline" className={roleBadgeColor[r.role] || ""}>
                        {r.role}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {user.roles.length === 0 ? (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Sin rol
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">OK</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AuditoriaUsersTable;
