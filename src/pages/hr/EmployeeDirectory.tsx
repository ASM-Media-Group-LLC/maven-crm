import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, UserMinus, Clock, Search, Plus, LayoutGrid, LayoutList, Trash2, Eye, Pencil } from "lucide-react";
import { useEmployees, useDeleteEmployee, useDepartments } from "@/hooks/useEmployees";
import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { EmployeeAreaBadge } from "@/components/hr/EmployeeAreaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

/* ── KPI Cards (same pattern as ContactosKPICards) ── */
const kpiCards = [
  { label: "Total Empleados", subtitle: "Registrados", icon: Users, key: "total" as const, colorClass: "text-muted-foreground", bgClass: "bg-muted", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-muted-foreground/10 hover:to-transparent hover:border-muted-foreground/20" },
  { label: "Activos", subtitle: "En nómina", icon: UserCheck, key: "active" as const, colorClass: "text-success", bgClass: "bg-success/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-success/15 hover:to-transparent hover:border-success/40" },
  { label: "En Licencia", subtitle: "Vacaciones / Licencia", icon: Clock, key: "leave" as const, colorClass: "text-warning", bgClass: "bg-warning/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:to-transparent hover:border-warning/40" },
  { label: "Inactivos", subtitle: "Suspendidos / Inactivos", icon: UserMinus, key: "inactive" as const, colorClass: "text-destructive", bgClass: "bg-destructive/20", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40" },
];

/* ── Directory Table ── */
function DirectoryTable({ employees, isLoading, navigate, onDelete }: { employees: any[]; isLoading: boolean; navigate: any; onDelete: (id: string) => void }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empleado</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Ingreso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-24">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-12">No se encontraron empleados</TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => (
              <TableRow key={emp.id} className="cursor-pointer" onClick={() => navigate(`/hr/empleado/${emp.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {emp.profile_photo_url ? (
                        <img src={emp.profile_photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="text-xs font-medium text-primary">{emp.first_name[0]}{emp.last_name[0]}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-muted-foreground">{emp.email ?? "—"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{emp.employee_code ?? "—"}</TableCell>
                <TableCell><EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} /></TableCell>
                <TableCell className="text-sm">{emp.positions?.name ?? "—"}</TableCell>
                <TableCell className="text-xs capitalize">{emp.contract_type ?? "—"}</TableCell>
                <TableCell className="text-xs">{emp.hire_date ? format(new Date(emp.hire_date), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell><EmployeeStatusBadge status={emp.status} /></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/hr/empleado/${emp.id}`)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/hr/empleado/${emp.id}`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(emp.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Directory Grid ── */
function DirectoryGrid({ employees, isLoading, navigate, onDelete }: { employees: any[]; isLoading: boolean; navigate: any; onDelete: (id: string) => void }) {
  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
    </div>
  );
  if (employees.length === 0) return <div className="text-center text-muted-foreground py-12">No se encontraron empleados</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {employees.map((emp) => (
        <Card key={emp.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(`/hr/empleado/${emp.id}`)}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {emp.profile_photo_url ? (
                  <img src={emp.profile_photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <span className="text-sm font-medium text-primary">{emp.first_name[0]}{emp.last_name[0]}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{emp.first_name} {emp.last_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{emp.employee_code ?? "—"}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} />
              <p className="text-xs text-muted-foreground">{emp.positions?.name ?? "Sin cargo"}</p>
            </div>
            <div className="flex items-center justify-between">
              <EmployeeStatusBadge status={emp.status} />
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); navigate(`/hr/empleado/${emp.id}`); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(emp.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Main Page ── */
export default function EmployeeDirectory() {
  const navigate = useNavigate();
  const { data: employees = [], isLoading } = useEmployees();
  const { data: departments = [] } = useDepartments();
  const deleteEmployee = useDeleteEmployee();

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = employees.filter((e) => {
    const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
    const matchSearch = fullName.includes(search.toLowerCase()) ||
      (e.employee_code?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (e.email?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchDept = !deptFilter || e.department_id === deptFilter;
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const totalActive = employees.filter((e) => e.status === "activo").length;
  const totalLeave = employees.filter((e) => e.status === "en_licencia" || e.status === "vacaciones").length;
  const totalInactive = employees.filter((e) => e.status === "inactivo" || e.status === "suspendido").length;

  const toDelete = employees.find((e) => e.id === deleteId);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* ── Header ── */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Directorio de Empleados</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Total: {employees.length} empleados registrados</p>
          </div>
          <Button onClick={() => navigate("/hr/empleado/nuevo")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Empleado
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map((card) => {
            const val = card.key === "total" ? employees.length : card.key === "active" ? totalActive : card.key === "leave" ? totalLeave : totalInactive;
            return (
              <Card key={card.key} className={`transition-all duration-200 ${card.hoverClass}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <div className={`flex h-8 w-8 items-center justify-center rounded-md ${card.bgClass}`}>
                      <card.icon className={`h-4 w-4 ${card.colorClass}`} />
                    </div>
                  </div>
                  <p className={`mt-2 text-2xl font-bold ${card.colorClass}`}>{val}</p>
                  <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Department tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          <Button
            variant={!deptFilter ? "secondary" : "ghost"}
            size="sm"
            className="text-sm"
            onClick={() => setDeptFilter("")}
          >
            Todos
          </Button>
          {departments.map((d) => (
            <Button
              key={d.id}
              variant={deptFilter === d.id ? "secondary" : "ghost"}
              size="sm"
              className="text-sm"
              onClick={() => setDeptFilter(deptFilter === d.id ? "" : d.id)}
            >
              {d.name}
            </Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, código o email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="inactivo">Inactivo</SelectItem>
              <SelectItem value="en_licencia">En Licencia</SelectItem>
              <SelectItem value="vacaciones">Vacaciones</SelectItem>
              <SelectItem value="suspendido">Suspendido</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("table")}>
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>

        {/* Table / Grid */}
        {viewMode === "table"
          ? <DirectoryTable employees={filtered} isLoading={isLoading} navigate={navigate} onDelete={setDeleteId} />
          : <DirectoryGrid employees={filtered} isLoading={isLoading} navigate={navigate} onDelete={setDeleteId} />
        }
      </div>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{toDelete?.first_name} {toDelete?.last_name}</strong> y todos sus registros asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { deleteEmployee.mutate(deleteId); setDeleteId(null); } }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
