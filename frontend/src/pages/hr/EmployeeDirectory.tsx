import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, Wifi, Building2, Laptop, Search, Plus, LayoutGrid, LayoutList, Trash2, Eye, Pencil, RefreshCw } from "lucide-react";
import { useEmployees, useDeleteEmployee, useDepartments } from "@/hooks/useEmployees";
import { useUpdateEmployee, useCreateEmployeeHistory } from "@/hooks/useEmployee";
import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { EmployeeAreaBadge } from "@/components/hr/EmployeeAreaBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { EMPLOYEE_STATUS_OPTIONS, CONTRACT_TYPES, WORK_MODALITIES } from "@/lib/hrConstants";
import { useAuth } from "@/hooks/useAuth";

/* ── KPI Cards ── usan KpiCard estándar (gradient + hover lift) */
const kpiCards = [
  { label: "Total Activos", subtitle: "En operación", icon: UserCheck, key: "active" as const, color: "bg-emerald-500" },
  { label: "Remotos", subtitle: "Trabajo remoto", icon: Wifi, key: "remote" as const, color: "bg-blue-500" },
  { label: "Híbridos", subtitle: "Modalidad híbrida", icon: Laptop, key: "hybrid" as const, color: "bg-amber-500" },
  { label: "Presenciales", subtitle: "En oficina", icon: Building2, key: "onsite" as const, color: "bg-violet-500" },
];

const MODALITY_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  remoto: { label: "Remoto", variant: "default" },
  hibrido: { label: "Híbrido", variant: "secondary" },
  presencial: { label: "Presencial", variant: "outline" },
};

/* ── Directory Table ── */
function DirectoryTable({ employees, isLoading, navigate, onDelete, onChangeStatus }: { employees: any[]; isLoading: boolean; navigate: any; onDelete: (id: string) => void; onChangeStatus: (emp: any) => void }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empleado</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Modalidad</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Ingreso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-28">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 9 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground py-12">No se encontraron empleados</TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => {
              const mod = MODALITY_BADGE[emp.work_modality] ?? { label: emp.work_modality ?? "—", variant: "outline" as const };
              return (
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
                  <TableCell><Badge variant={mod.variant}>{mod.label}</Badge></TableCell>
                  <TableCell className="text-xs capitalize">{CONTRACT_TYPES.find(c => c.value === emp.contract_type)?.label ?? emp.contract_type ?? "—"}</TableCell>
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
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onChangeStatus(emp)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(emp.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
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
      {employees.map((emp) => {
        const mod = MODALITY_BADGE[emp.work_modality] ?? { label: emp.work_modality ?? "—", variant: "outline" as const };
        return (
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
                <div className="flex items-center gap-2">
                  <EmployeeAreaBadge departmentName={emp.departments?.name} departmentCode={emp.departments?.code} />
                  <Badge variant={mod.variant} className="text-xs">{mod.label}</Badge>
                </div>
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
        );
      })}
    </div>
  );
}

/* ── Change Status Modal ── */
function ChangeStatusModal({ employee, open, onClose }: { employee: any; open: boolean; onClose: () => void }) {
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const updateEmployee = useUpdateEmployee();
  const createHistory = useCreateEmployeeHistory();
  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!newStatus || !reason.trim() || !employee) return;
    await updateEmployee.mutateAsync({ id: employee.id, data: { status: newStatus } });
    await createHistory.mutateAsync({
      employee_id: employee.id,
      change_type: "status_change",
      field_changed: "status",
      old_value: employee.status,
      new_value: newStatus,
      reason: reason.trim(),
      created_by: user?.id ?? null,
    });
    setNewStatus("");
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar Estado</DialogTitle>
          <DialogDescription>
            {employee ? `${employee.first_name} ${employee.last_name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nuevo Estado</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_STATUS_OPTIONS.filter(s => s.value !== employee?.status).map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Motivo <span className="text-destructive">*</span></Label>
            <Textarea placeholder="Motivo del cambio de estado..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!newStatus || !reason.trim() || updateEmployee.isPending}>
            {updateEmployee.isPending ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [modalityFilter, setModalityFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusEmployee, setStatusEmployee] = useState<any>(null);
  type KpiKey = "active" | "remote" | "hybrid" | "onsite";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const filtered = employees.filter((e) => {
    const fullName = `${e.first_name} ${e.last_name}`.toLowerCase();
    const matchSearch = fullName.includes(search.toLowerCase()) ||
      (e.employee_code?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (e.email?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchDept = !deptFilter || e.department_id === deptFilter;
    const matchStatus = !statusFilter || e.status === statusFilter;
    const matchModality = !modalityFilter || e.work_modality === modalityFilter;
    const matchContract = !contractFilter || e.contract_type === contractFilter;
    return matchSearch && matchDept && matchStatus && matchModality && matchContract;
  });

  const activeEmps = employees.filter((e) => e.status === "activo");
  const totalRemote = activeEmps.filter((e) => e.work_modality === "remoto").length;
  const totalHybrid = activeEmps.filter((e) => e.work_modality === "hibrido").length;
  const totalOnsite = activeEmps.filter((e) => e.work_modality === "presencial").length;

  const kpiValues: Record<string, number> = {
    active: activeEmps.length,
    remote: totalRemote,
    hybrid: totalHybrid,
    onsite: totalOnsite,
  };

  const toDelete = employees.find((e) => e.id === deleteId);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* ── Header ── */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Empleados Activos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Hub de gestión del equipo activo · {activeEmps.length} activos de {employees.length} total</p>
          </div>
          <Button onClick={() => navigate("/hr/empleado/nuevo")}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Empleado
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards — clickeables, abren modal con la lista filtrada */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpiCards.map((card) => (
            <KpiCard
              key={card.key}
              label={card.label}
              value={kpiValues[card.key]}
              icon={card.icon}
              color={card.color}
              subtitle={card.subtitle}
              onClick={() => setKpiPopup(card.key)}
            />
          ))}
        </div>

        {/* Department tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          <Button variant={!deptFilter ? "secondary" : "ghost"} size="sm" className="text-sm" onClick={() => setDeptFilter("")}>Todos</Button>
          {departments.map((d) => (
            <Button key={d.id} variant={deptFilter === d.id ? "secondary" : "ghost"} size="sm" className="text-sm" onClick={() => setDeptFilter(deptFilter === d.id ? "" : d.id)}>
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
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {EMPLOYEE_STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modalityFilter || undefined} onValueChange={(v) => setModalityFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Modalidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {WORK_MODALITIES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractFilter || undefined} onValueChange={(v) => setContractFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Contrato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {CONTRACT_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
          ? <DirectoryTable employees={filtered} isLoading={isLoading} navigate={navigate} onDelete={setDeleteId} onChangeStatus={setStatusEmployee} />
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

      {/* Change status modal */}
      <ChangeStatusModal employee={statusEmployee} open={!!statusEmployee} onClose={() => setStatusEmployee(null)} />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "active": return `Total Activos — ${activeEmps.length}`;
            case "remote": return `Remotos — ${totalRemote}`;
            case "hybrid": return `Híbridos — ${totalHybrid}`;
            case "onsite": return `Presenciales — ${totalOnsite}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = activeEmps;
          if (kpiPopup === "remote") list = activeEmps.filter((e: any) => e.work_modality === "remoto");
          else if (kpiPopup === "hybrid") list = activeEmps.filter((e: any) => e.work_modality === "hibrido");
          else if (kpiPopup === "onsite") list = activeEmps.filter((e: any) => e.work_modality === "presencial");
          return list.slice(0, 100).map((e: any): KpiRow => ({
            primary: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.full_name || "Sin nombre",
            secondary: e.position ?? e.department_name ?? undefined,
            right: e.work_modality ?? "—",
          }));
        })()}
      />
    </main>
  );
}
