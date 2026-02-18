import { Check, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RoleMatrixEntry } from "./useAuditoriaData";

interface Props {
  matrix: Record<string, RoleMatrixEntry>;
}

const permLabels = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Crear" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
] as const;

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
            <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">Módulo</TableHead>
            {roleNames.map((role) => (
              <TableHead key={role} colSpan={4} className="text-center border-l capitalize">
                {role}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-10" />
            {roleNames.map((role) =>
              permLabels.map((p) => (
                <TableHead key={`${role}-${p.key}`} className="text-center text-[10px] px-1 border-l first:border-l-0 min-w-[48px]">
                  {p.label}
                </TableHead>
              ))
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((mod) => (
            <TableRow key={mod}>
              <TableCell className="sticky left-0 bg-card z-10 font-medium capitalize text-xs">{mod}</TableCell>
              {roleNames.map((role) =>
                permLabels.map((p) => {
                  const perms = matrix[role]?.modules[mod];
                  const val = perms ? perms[p.key] : false;
                  return (
                    <TableCell key={`${role}-${mod}-${p.key}`} className="text-center px-1 border-l">
                      {val ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                      )}
                    </TableCell>
                  );
                })
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AuditoriaRoleMatrix;
