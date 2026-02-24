import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import HRPageHeader from "@/components/hr/HRPageHeader";
import EmployeeAreaBadge from "@/components/hr/EmployeeAreaBadge";
import { useEmployees, useDepartments } from "@/hooks/useEmployees";
import { Users } from "lucide-react";

const MODALITY_LABELS: Record<string, string> = {
  remoto: "Remoto",
  hibrido: "Híbrido",
  presencial: "Presencial",
};

export default function HRDirectoryLookup() {
  const navigate = useNavigate();
  const { data: employees, isLoading } = useEmployees();
  const { data: departments } = useDepartments();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!employees) return [];
    let list = employees.filter((e) => e.status === "activo");
    if (deptFilter !== "all") list = list.filter((e) => e.department_id === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q) ||
          (e.phone ?? "").includes(q) ||
          (e.mobile ?? "").includes(q) ||
          (e.positions?.name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [employees, search, deptFilter]);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background border-b px-6 pt-6 pb-4 space-y-4">
        <HRPageHeader
          title="Directorio"
          subtitle="Consulta rápida de datos del equipo"
          icon={Users}
        />

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email, teléfono, cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los departamentos</SelectItem>
              {departments?.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead>Modalidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    No se encontraron empleados
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/hr/empleado/${emp.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={emp.profile_photo_url ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {emp.first_name[0]}{emp.last_name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{emp.first_name} {emp.last_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{emp.positions?.name ?? "—"}</TableCell>
                    <TableCell>
                      <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.mobile ?? emp.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {emp.city || emp.country ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[emp.city, emp.country].filter(Boolean).join(", ")}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{MODALITY_LABELS[emp.work_modality ?? ""] ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
