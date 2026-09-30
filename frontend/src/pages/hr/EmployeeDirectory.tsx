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
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { EMPLOYEE_STATUS_OPTIONS, CONTRACT_TYPES, WORK_MODALITIES } from "@/lib/hrConstants";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato } from "@/pages/admin/ConFormato";
import { etiquetaHrO, valorGuardado } from "./etiquetasHr";

/* ── KPI Cards ── usan StatChip del reskin */
const kpiCards: { label: TranslationKey; subtitle: TranslationKey; icon: typeof UserCheck; key: "active" | "remote" | "hybrid" | "onsite"; color: string }[] = [
  { label: "hrg.dir.kpi.active", subtitle: "hrg.dir.kpi.activeHint", icon: UserCheck, key: "active", color: "bg-success" },
  { label: "hrg.dir.kpi.remote", subtitle: "hrg.dir.kpi.remoteHint", icon: Wifi, key: "remote", color: "bg-primary" },
  { label: "hrg.dir.kpi.hybrid", subtitle: "hrg.dir.kpi.hybridHint", icon: Laptop, key: "hybrid", color: "bg-warning" },
  { label: "hrg.dir.kpi.onsite", subtitle: "hrg.dir.kpi.onsiteHint", icon: Building2, key: "onsite", color: "bg-primary" },
];

// La modalidad guardada (employees.work_modality) → cómo se pinta el badge. La
// etiqueta sale de etiquetasHr.
const MODALITY_BADGE: Record<string, "default" | "secondary" | "outline"> = {
  remoto: "default",
  hibrido: "secondary",
  presencial: "outline",
};

/* ── Directory Table ── */
function DirectoryTable({ employees, isLoading, navigate, onDelete, onChangeStatus }: { employees: any[]; isLoading: boolean; navigate: any; onDelete: (id: string) => void; onChangeStatus: (emp: any) => void }) {
  const { t } = useLanguage();
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("hrg.employee")}</TableHead>
            <TableHead>{t("common.code")}</TableHead>
            <TableHead>{t("hrg.department")}</TableHead>
            <TableHead>{t("hrg.opt.histField.position_id")}</TableHead>
            <TableHead>{t("hrg.dir.modality")}</TableHead>
            <TableHead>{t("hrg.dir.contract")}</TableHead>
            <TableHead>{t("hrg.dir.hired")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead className="w-28">{t("common.actions")}</TableHead>
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
              <TableCell colSpan={9} className="text-center text-muted-foreground py-12">{t("hrg.dir.empty")}</TableCell>
            </TableRow>
          ) : (
            employees.map((emp) => {
              const mod = { label: etiquetaHrO(t, "modality", emp.work_modality), variant: MODALITY_BADGE[emp.work_modality] ?? "outline" };
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
                  <TableCell className="text-xs capitalize">{etiquetaHrO(t, "contract", emp.contract_type)}</TableCell>
                  <TableCell className="text-xs">{emp.hire_date ? format(new Date(emp.hire_date), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell><EmployeeStatusBadge status={emp.status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/hr/empleado/${emp.id}`)} aria-label={t("common.view")}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(`/hr/empleado/${emp.id}`)} aria-label={t("common.edit")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onChangeStatus(emp)} aria-label={t("hrg.dir.changeStatus")}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => onDelete(emp.id)} aria-label={t("common.delete")}>
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
  const { t } = useLanguage();
  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
    </div>
  );
  if (employees.length === 0) return <div className="text-center text-muted-foreground py-12">{t("hrg.dir.empty")}</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {employees.map((emp) => {
        const mod = { label: etiquetaHrO(t, "modality", emp.work_modality), variant: MODALITY_BADGE[emp.work_modality] ?? "outline" };
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
                <p className="text-xs text-muted-foreground">{emp.positions?.name ?? t("hrg.dir.noPosition")}</p>
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
  const { t } = useLanguage();

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
          <DialogTitle>{t("hrg.dir.changeStatus")}</DialogTitle>
          <DialogDescription>
            {employee ? `${employee.first_name} ${employee.last_name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("hrg.dir.newStatus")}</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder={t("hrg.dir.selectStatus")} /></SelectTrigger>
              <SelectContent>
                {EMPLOYEE_STATUS_OPTIONS.filter(s => s.value !== employee?.status).map(s => (
                  <SelectItem key={s.value} value={s.value}>{etiquetaHrO(t, "empStatus", s.value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("hrg.dir.reason")} <span className="text-destructive">*</span></Label>
            <Textarea placeholder={t("hrg.dir.reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!newStatus || !reason.trim() || updateEmployee.isPending}>
            {updateEmployee.isPending ? t("hrg.saving") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Main Page ── */
export default function EmployeeDirectory() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
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
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title={t("hrg.dir.title")}
          subtitle={t("hrg.dir.subtitle", { active: activeEmps.length, total: employees.length })}
          actions={
            <Button onClick={() => navigate("/hr/empleado/nuevo")}>
              <Plus className="h-4 w-4 mr-2" />
              {t("hrg.dir.new")}
            </Button>
          }
        />
      </header>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards — clickeables, abren modal con la lista filtrada */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpiCards.map((card) => (
            <StatChip key={card.key} label={t(card.label)} value={kpiValues[card.key]} icon={<card.icon className="h-3.5 w-3.5" />} color={card.color} hint={t(card.subtitle)} onClick={() => setKpiPopup(card.key)} />
          ))}
        </div>

        {/* Department tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
          <Button variant={!deptFilter ? "secondary" : "ghost"} size="sm" className="text-sm" onClick={() => setDeptFilter("")}>{t("common.all")}</Button>
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
            <Input placeholder={t("hrg.dir.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {EMPLOYEE_STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{etiquetaHrO(t, "empStatus", s.value)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modalityFilter || undefined} onValueChange={(v) => setModalityFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("hrg.dir.modality")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.allF")}</SelectItem>
              {WORK_MODALITIES.map(m => <SelectItem key={m.value} value={m.value}>{etiquetaHrO(t, "modality", m.value)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={contractFilter || undefined} onValueChange={(v) => setContractFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("hrg.dir.contract")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {CONTRACT_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{etiquetaHrO(t, "contract", c.value)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1 border rounded-md p-0.5">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("table")} aria-label={t("hrg.dir.viewTable")}>
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{t(filtered.length === 1 ? "hrg.dir.result" : "hrg.dir.results", { n: filtered.length })}</p>

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
            <AlertDialogTitle>{t("hrg.dir.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <ConFormato
                texto={t("hrg.dir.deleteBody")}
                piezas={{ name: <strong>{toDelete?.first_name} {toDelete?.last_name}</strong> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) { deleteEmployee.mutate(deleteId); setDeleteId(null); } }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change status modal */}
      <ChangeStatusModal employee={statusEmployee} open={!!statusEmployee} onClose={() => setStatusEmployee(null)} />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("hrg.noRecordsToShow")}
        title={(() => {
          switch (kpiPopup) {
            case "active": return t("hrg.kpiTitle", { label: t("hrg.dir.kpi.active"), value: activeEmps.length });
            case "remote": return t("hrg.kpiTitle", { label: t("hrg.dir.kpi.remote"), value: totalRemote });
            case "hybrid": return t("hrg.kpiTitle", { label: t("hrg.dir.kpi.hybrid"), value: totalHybrid });
            case "onsite": return t("hrg.kpiTitle", { label: t("hrg.dir.kpi.onsite"), value: totalOnsite });
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
            primary: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.full_name || t("hrg.noName"),
            secondary: e.position ?? e.department_name ?? undefined,
            // En español, la modalidad tal cual (así estaba); en inglés, con su etiqueta.
            right: valorGuardado(t, language, "modality", e.work_modality) ?? "—",
          }));
        })()}
      />
    </main>
  );
}
