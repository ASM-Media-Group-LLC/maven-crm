import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, AlertTriangle, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2,
  Search, X, ListIcon, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { DEDUCTION_DISPLAY_TYPES, DEDUCTION_STATUSES, INFRACTION_CATEGORIES } from "@/lib/hrConstants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeductionRecord {
  id: string;
  employee_id: string;
  deduction_type: string;
  amount: number;
  description: string | null;
  month_year: string;
  status: string;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    employee_code: string | null;
    department_id: string | null;
  } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useDeductions() {
  return useQuery({
    queryKey: ["employee-deductions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_deductions")
        .select("*, employees(first_name, last_name, employee_code, department_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeductionRecord[];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function parseCategory(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(/^\[(.+?)\]/);
  return match ? match[1] : null;
}

function parseDescription(description: string | null): string {
  if (!description) return "";
  return description.replace(/^\[.+?\]\s*/, "");
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
  pending: { variant: "secondary", label: "Pendiente" },
  applied: { variant: "default", label: "Aplicada" },
  rejected: { variant: "destructive", label: "Rechazada" },
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRDeductions() {
  const navigate = useNavigate();
  const { data: deductions = [], isLoading } = useDeductions();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeTab, setTypeTab] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "applied" | "amount";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  // Modals
  const [viewItem, setViewItem] = useState<DeductionRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<DeductionRecord | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_deductions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-deductions-all"] });
      toast({ title: "Deducción eliminada" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalPending = deductions.filter((d) => d.status === "pending").length;
  const totalApplied = deductions.filter((d) => d.status === "applied").length;
  const totalAmount = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const filtered = deductions.filter((d) => {
    const emp = d.employees;
    const fullName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const matchSearch = !search || fullName.includes(search.toLowerCase());
    const matchStatus = !statusFilter || d.status === statusFilter;
    const matchType = !typeTab || d.deduction_type === typeTab;
    const matchDept = !deptTab || emp?.department_id === deptTab;
    const recordDate = new Date(d.created_at);
    const matchFrom = !dateFrom || recordDate >= dateFrom;
    const matchTo = !dateTo || recordDate <= dateTo;
    return matchSearch && matchStatus && matchType && matchDept && matchFrom && matchTo;
  });

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Deducciones</h1>
            <p className="text-sm text-muted-foreground">Gestión de adelantos e infracciones · {deductions.length} registros</p>
          </div>
          <Button size="sm" onClick={() => navigate("/hr/deducciones/nuevo")}>
            <Plus className="h-4 w-4 mr-1" />Nueva Deducción
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <KpiCard label="Total Deducciones" value={String(deductions.length)} icon={DollarSign} color="bg-blue-500" subtitle="Todos los registros" onClick={() => setKpiPopup("total")} />
              <KpiCard label="Pendientes" value={String(totalPending)} icon={Clock} color="bg-warning" subtitle={deductions.length > 0 ? `${((totalPending / deductions.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("pending")} />
              <KpiCard label="Aplicadas" value={String(totalApplied)} icon={CheckCircle} color="bg-success" subtitle={deductions.length > 0 ? `${((totalApplied / deductions.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("applied")} />
              <KpiCard label="Monto Total" value={formatAmount(totalAmount)} icon={Wallet} color="bg-rose-500" subtitle="Suma de todas las deducciones" onClick={() => setKpiPopup("amount")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>Todos</Button>
          {departments.map((d) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Type Sub-tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!typeTab ? "secondary" : "ghost"} size="sm" onClick={() => setTypeTab("")}>Todos</Button>
          {DEDUCTION_DISPLAY_TYPES.map((t) => (
            <Button key={t.value} variant={typeTab === t.value ? "secondary" : "ghost"} size="sm" onClick={() => setTypeTab(t.value)}>{t.label}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {DEDUCTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
          />

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />Limpiar filtros
            </Button>
          )}
        </div>

        {/* ── Table View ──────────────────────────────────────────────────── */}
        {viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Categoría</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        {deductions.length === 0
                          ? "No hay deducciones registradas. Haz clic en \"Nueva Deducción\" para empezar."
                          : "Sin resultados para los filtros aplicados."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ded) => {
                      const emp = ded.employees;
                      const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                      const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                      const typeLabel = DEDUCTION_DISPLAY_TYPES.find((t) => t.value === ded.deduction_type)?.label ?? ded.deduction_type;
                      const category = ded.deduction_type === "infraccion" ? parseCategory(ded.description) : null;
                      const catLabel = category ? (INFRACTION_CATEGORIES.find((c) => c.value === category)?.label ?? category) : "—";
                      const badge = STATUS_BADGE[ded.status] ?? STATUS_BADGE.pending;
                      return (
                        <TableRow key={ded.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium">{fullName}</p>
                                {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              {ded.deduction_type === "adelanto" ? <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                              {typeLabel}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{catLabel}</TableCell>
                          <TableCell className="text-sm font-medium">{formatAmount(ded.amount)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(ded.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ded)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ded)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* ── Grid View ──────────────────────────────────────────────────── */
          <div>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                {deductions.length === 0
                  ? "No hay deducciones registradas. Haz clic en \"Nueva Deducción\" para empezar."
                  : "Sin resultados para los filtros aplicados."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((ded) => {
                  const emp = ded.employees;
                  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                  const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                  const typeLabel = DEDUCTION_DISPLAY_TYPES.find((t) => t.value === ded.deduction_type)?.label ?? ded.deduction_type;
                  const badge = STATUS_BADGE[ded.status] ?? STATUS_BADGE.pending;
                  return (
                    <Card key={ded.id} className="group hover:shadow-md transition-all">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{fullName}</p>
                              {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                            </div>
                          </div>
                          <span className="text-sm font-semibold shrink-0">{formatAmount(ded.amount)}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm">
                            {ded.deduction_type === "adelanto" ? <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            {typeLabel}
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(ded.created_at), "dd/MM/yyyy")}</p>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ded)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ded)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Results counter */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {deductions.length} deducciones
          </p>
        )}
      </div>

      {/* ── View Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle de Deducción</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const typeLabel = DEDUCTION_DISPLAY_TYPES.find((t) => t.value === viewItem.deduction_type)?.label ?? viewItem.deduction_type;
            const category = viewItem.deduction_type === "infraccion" ? parseCategory(viewItem.description) : null;
            const catLabel = category ? (INFRACTION_CATEGORIES.find((c) => c.value === category)?.label ?? category) : null;
            const descText = parseDescription(viewItem.description);
            const badge = STATUS_BADGE[viewItem.status] ?? STATUS_BADGE.pending;
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-muted-foreground">Empleado</Label><p className="font-medium">{viewItem.employees ? `${viewItem.employees.first_name} ${viewItem.employees.last_name}` : "—"}</p></div>
                  <div><Label className="text-muted-foreground">Tipo</Label><p className="font-medium">{typeLabel}</p></div>
                  {catLabel && <div><Label className="text-muted-foreground">Categoría</Label><p className="font-medium">{catLabel}</p></div>}
                  <div><Label className="text-muted-foreground">Monto</Label><p className="font-medium">{formatAmount(viewItem.amount)}</p></div>
                  <div><Label className="text-muted-foreground">Fecha</Label><p className="font-medium">{format(new Date(viewItem.created_at), "dd/MM/yyyy")}</p></div>
                  <div><Label className="text-muted-foreground">Estado</Label><Badge variant={badge.variant}>{badge.label}</Badge></div>
                </div>
                {descText && <div><Label className="text-muted-foreground">Descripción</Label><p>{descText}</p></div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar deducción?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente esta deducción de {formatAmount(deleteItem?.amount ?? 0)}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Deducciones — ${deductions.length}`;
            case "pending": return `Pendientes — ${totalPending}`;
            case "applied": return `Aplicadas — ${totalApplied}`;
            case "amount": return `Monto Total — ${formatAmount(totalAmount)}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = deductions;
          if (kpiPopup === "pending") list = deductions.filter((d: any) => d.status === "pending");
          else if (kpiPopup === "applied") list = deductions.filter((d: any) => d.status === "applied");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "applied" ? "success" : status === "pending" ? "warning" : "default";
          return list.slice(0, 100).map((d: any): KpiRow => ({
            primary: d.employee_name ?? d.reason ?? "Sin concepto",
            secondary: d.month_year ?? d.deduction_type ?? undefined,
            right: formatAmount(d.amount || 0),
            rightTone: tone(d.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
