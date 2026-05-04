import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RoleMatrixEntry } from "./useAuditoriaData";

interface Props {
  matrix: Record<string, RoleMatrixEntry>;
}

const scopeLabels: Record<string, string> = {
  all: "Global",
  subordinates: "Subordinados",
  self: "Propio",
};

const scopeColors: Record<string, string> = {
  all: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  subordinates: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  self: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

const AuditoriaRoleMatrix = ({ matrix }: Props) => {
  const roleNames = Object.keys(matrix);

  // Collect all unique modules across all roles
  const allModules = new Set<string>();
  for (const entry of Object.values(matrix)) {
    for (const mod of Object.keys(entry.modules)) {
      allModules.add(mod);
    }
  }
  const modules = Array.from(allModules).sort();

  if (roleNames.length === 0 || modules.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        No hay permisos configurados para mostrar la matriz.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Módulo</TableHead>
            {roleNames.map((role) => (
              <TableHead key={role} colSpan={2} className="text-center border-l capitalize">
                {role}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-10" />
            {roleNames.map((role) => (
              <>
                <TableHead key={`${role}-access`} className="text-center text-[10px] px-2 border-l min-w-[60px]">
                  Acceso
                </TableHead>
                <TableHead key={`${role}-scope`} className="text-center text-[10px] px-2 min-w-[80px]">
                  Alcance
                </TableHead>
              </>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((mod) => (
            <TableRow key={mod}>
              <TableCell className="sticky left-0 bg-card z-10 font-medium capitalize text-xs">{mod}</TableCell>
              {roleNames.map((role) => {
                const perms = matrix[role]?.modules[mod];
                const hasAccess = perms?.can_view || false;
                const scope = perms?.data_scope || "all";
                return (
                  <>
                    <TableCell key={`${role}-${mod}-access`} className="text-center px-2 border-l">
                      {hasAccess ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell key={`${role}-${mod}-scope`} className="text-center px-2">
                      {hasAccess ? (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${scopeColors[scope] || ""}`}>
                          {scopeLabels[scope] || scope}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/30 text-[10px]">—</span>
                      )}
                    </TableCell>
                  </>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AuditoriaRoleMatrix;
