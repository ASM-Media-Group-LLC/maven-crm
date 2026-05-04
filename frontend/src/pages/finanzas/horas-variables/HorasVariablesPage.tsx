import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, DollarSign, TrendingUp, Wallet, Plus, Eye, Trash2, Search, X, Download,
  CheckCircle, Banknote, ArrowRightLeft, LayoutGrid, List,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePayrollParams } from "@/hooks/useFinancialConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import NuevaComisionModal from "../comisiones/NuevaComisionModal";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const TABS = ["Horas Extra", "Banco de Horas", "Comisiones"] as const;
type HVTab = typeof TABS[number];

const COMISION_STATUS: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  proyectado: { variant: "outline", label: "Proyectado" },
  confirmado: { variant: "default", label: "Confirmado" },
  pagado: { variant: "secondary", label: "Pagado" },
};

export default function HorasVariablesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<HVTab>("Horas Extra");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const { params: payrollParams } = usePayrollParams();
  const hourValue = payrollParams?.hour_bank?.hour_value ?? 15;

  // Banco de Horas modals
  const [payItem, setPayItem] = useState<any>(null);
  const [compensateItem, setCompensateItem] = useState<any>(null);
  const [compHours, setCompHours] = useState("");
  const [compReason, setCompReason] = useState("");

  // Horas Extra filters
  const [horasSearch, setHorasSearch] = useState("");
  const [horasPeriodFilter, setHorasPeriodFilter] = useState("");

  // Banco de Horas filters
  const [bancoSearch, setBancoSearch] = useState("");
  const [bancoStatusFilter, setBancoStatusFilter] = useState("");

  // Comisiones state
  const [showComisionModal, setShowComisionModal] = useState(false);
  const [comisionSearch, setComisionSearch] = useState("");
  const [comisionTypeFilter, setComisionTypeFilter] = useState("");
  const [comisionViewItem, setComisionViewItem] = useState<any>(null);
  const [comisionDeleteItem, setComisionDeleteItem] = useState<any>(null);

  const { data: horasDetails = [], isLoading: loadingHoras } = useQuery({
    queryKey: ["hv-payroll-details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_details")
        .select("*, employees(first_name, last_name, employee_code), payroll_periods(period_name, status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["hv-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*, employees(first_name, last_name, employee_code), creators(name, artistic_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const createCommission = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("commissions").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-commissions"] });
      toast({ title: "Comisión creada" });
    },
    onError: () => toast({ title: "Error al crear", variant: "destructive" }),
  });

  const deleteCommission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-commissions"] });
      toast({ title: "Comisión eliminada" });
      setComisionDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // Pay hours mutation
  const payHoursMutation = useMutation({
    mutationFn: async (detail: any) => {
      const amount = Number(detail.hour_bank_amount) || (Number(detail.hour_bank_hours) * hourValue);
      const { error } = await supabase.from("payroll_details").update({
        hour_bank_hours: 0,
        hour_bank_amount: 0,
        overtime_amount: (Number(detail.overtime_amount) || 0) + amount,
      }).eq("id", detail.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-payroll-details"] });
      toast({ title: "Horas pagadas exitosamente" });
      setPayItem(null);
    },
    onError: () => toast({ title: "Error al pagar horas", variant: "destructive" }),
  });

  // Compensate hours mutation
  const compensateHoursMutation = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const detail = horasDetails.find(d => d.id === id);
      if (!detail) throw new Error("Not found");
      const newHours = Math.max(0, (Number(detail.hour_bank_hours) || 0) - hours);
      const ratio = Number(detail.hour_bank_hours) > 0 ? newHours / Number(detail.hour_bank_hours) : 0;
      const newAmount = (Number(detail.hour_bank_amount) || 0) * ratio;
      const { error } = await supabase.from("payroll_details").update({
        hour_bank_hours: newHours,
        hour_bank_amount: newAmount,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-payroll-details"] });
      toast({ title: "Horas compensadas exitosamente" });
      setCompensateItem(null);
      setCompHours("");
      setCompReason("");
    },
    onError: () => toast({ title: "Error al compensar", variant: "destructive" }),
  });

  // Computed
  const totalOvertimeHours = horasDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
  const totalOvertimeAmount = horasDetails.reduce((s, d) => s + (Number(d.overtime_amount) || 0), 0);
  const totalBankHours = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_hours) || 0), 0);
  const totalBankAmount = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_amount) || 0), 0);
  const uniqueEmps = new Set(horasDetails.map(d => d.employee_id)).size;

  const filteredCommissions = commissions.filter(c => {
    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "";
    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "";
    const matchSearch = !comisionSearch || empName.toLowerCase().includes(comisionSearch.toLowerCase()) || creatorName.toLowerCase().includes(comisionSearch.toLowerCase());
    const matchType = !comisionTypeFilter || (c as any).commission_type === comisionTypeFilter;
    return matchSearch && matchType;
  });

  const exportQuickBooks = () => {
    const rows = commissions.filter(c => c.status === "confirmado" || c.status === "pagado").map(c => ({
      Date: new Date(c.created_at).toLocaleDateString("en-US"),
      Name: c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—",
      Memo: `Comisión ${(c as any).commission_type} - ${c.period}`,
      Amount: Number(c.final_amount) || Number(c.estimated_amount) || 0,
      Account: c.cost_center || "Comisiones",
    }));
    if (rows.length === 0) { toast({ title: "Sin comisiones para exportar", variant: "destructive" }); return; }
    exportTableToExcel(rows, "quickbooks-comisiones");
    toast({ title: "Archivo QuickBooks generado" });
  };

  const getBankStatus = (d: any) => {
    const hours = Number(d.hour_bank_hours) || 0;
    const amount = Number(d.hour_bank_amount) || 0;
    if (hours === 0 && amount === 0) return "Compensadas";
    if (hours > 0) return "Acumuladas";
    return "Pagadas";
  };

  // Get unique periods for filter
  const uniquePeriods = Array.from(new Set(horasDetails.map(d => (d as any).payroll_periods?.period_name).filter(Boolean)));

  const horasExtraFiltered = horasDetails.filter(d => {
    if (Number(d.overtime_hours) <= 0) return false;
    const empName = d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "";
    const matchSearch = !horasSearch || empName.toLowerCase().includes(horasSearch.toLowerCase());
    const matchPeriod = !horasPeriodFilter || (d as any).payroll_periods?.period_name === horasPeriodFilter;
    return matchSearch && matchPeriod;
  });

  const bancoFiltered = horasDetails.filter(d => {
    if (Number(d.hour_bank_hours) <= 0 && Number(d.overtime_amount) <= 0) return false;
    const empName = d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "";
    const matchSearch = !bancoSearch || empName.toLowerCase().includes(bancoSearch.toLowerCase());
    const status = getBankStatus(d);
    const matchStatus = !bancoStatusFilter || status === bancoStatusFilter;
    return matchSearch && matchStatus;
  });

  const renderTab = () => {
    switch (tab) {
      case "Horas Extra":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empleado..." className="pl-8" value={horasSearch} onChange={e => setHorasSearch(e.target.value)} />
              </div>
              <Select value={horasPeriodFilter || undefined} onValueChange={v => setHorasPeriodFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Periodo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {uniquePeriods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const rows = horasExtraFiltered.map(d => ({
                  Empleado: d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—",
                  Horas: Number(d.overtime_hours) || 0,
                  Monto: Number(d.overtime_amount) || 0,
                  Periodo: (d as any).payroll_periods?.period_name || "—",
                }));
                if (rows.length === 0) { toast({ title: "Sin registros para exportar", variant: "destructive" }); return; }
                exportTableToExcel(rows, "horas-extra");
                toast({ title: "Archivo exportado" });
              }}><Download className="h-4 w-4 mr-1" />Exportar</Button>
              {(horasSearch || horasPeriodFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setHorasSearch(""); setHorasPeriodFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>
            {loadingHoras ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : horasExtraFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4"><Clock className="h-8 w-8 text-muted-foreground" /></div>
                <h3 className="text-sm font-medium text-foreground mb-1">Sin registros de horas extra</h3>
                <p className="text-xs text-muted-foreground max-w-xs">Las horas extra aparecerán aquí cuando se registren en la nómina de cada periodo.</p>
              </div>
            ) : viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-26rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Horas</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {horasExtraFiltered.map(d => (
                      <TableRow key={d.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{Number(d.overtime_hours) || 0}h</TableCell>
                        <TableCell className="text-sm">{fmt(Number(d.overtime_amount) || 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {horasExtraFiltered.map(d => (
                  <div key={d.id} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                    <p className="text-sm font-medium">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</p>
                    <p className="text-xl font-bold text-foreground mt-2">{Number(d.overtime_hours) || 0}h</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{fmt(Number(d.overtime_amount) || 0)}</span>
                      <span>{(d as any).payroll_periods?.period_name || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "Banco de Horas":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empleado..." className="pl-8" value={bancoSearch} onChange={e => setBancoSearch(e.target.value)} />
              </div>
              <Select value={bancoStatusFilter || undefined} onValueChange={v => setBancoStatusFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="Acumuladas">Acumuladas</SelectItem>
                  <SelectItem value="Pagadas">Pagadas</SelectItem>
                  <SelectItem value="Compensadas">Compensadas</SelectItem>
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              {(bancoSearch || bancoStatusFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setBancoSearch(""); setBancoStatusFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>
            {loadingHoras ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : bancoFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4"><Wallet className="h-8 w-8 text-muted-foreground" /></div>
                <h3 className="text-sm font-medium text-foreground mb-1">Sin registros en banco de horas</h3>
                <p className="text-xs text-muted-foreground max-w-xs">El banco de horas acumula horas extra que pueden ser pagadas o compensadas con tiempo libre.</p>
              </div>
            ) : viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-26rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Horas</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Valor</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bancoFiltered.map(d => {
                      const status = getBankStatus(d);
                      const hasHours = Number(d.hour_bank_hours) > 0;
                      return (
                        <TableRow key={d.id} className="hover:bg-muted/30">
                          <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                          <TableCell className="text-sm font-medium">{Number(d.hour_bank_hours) || 0}h</TableCell>
                          <TableCell className="text-sm">{fmt(Number(d.hour_bank_amount) || 0)}</TableCell>
                          <TableCell><Badge variant={status === "Acumuladas" ? "secondary" : status === "Pagadas" ? "default" : "outline"}>{status}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            {hasHours && (
                              <div className="flex items-center gap-1">
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPayItem(d)}><Banknote className="h-3.5 w-3.5 mr-1" />Pagar</Button></TooltipTrigger><TooltipContent>Pagar horas acumuladas</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCompensateItem(d)}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Compensar</Button></TooltipTrigger><TooltipContent>Compensar con tiempo libre</TooltipContent></Tooltip>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {bancoFiltered.map(d => {
                  const status = getBankStatus(d);
                  const hasHours = Number(d.hour_bank_hours) > 0;
                  return (
                    <div key={d.id} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={status === "Acumuladas" ? "secondary" : status === "Pagadas" ? "default" : "outline"} className="text-[10px]">{status}</Badge>
                      </div>
                      <p className="text-sm font-medium">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</p>
                      <p className="text-xl font-bold text-foreground mt-2">{Number(d.hour_bank_hours) || 0}h</p>
                      <p className="text-xs text-muted-foreground mt-1">{fmt(Number(d.hour_bank_amount) || 0)}</p>
                      {hasHours && (
                        <div className="flex items-center gap-1 mt-3">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPayItem(d)}><Banknote className="h-3.5 w-3.5 mr-1" />Pagar</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCompensateItem(d)}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Compensar</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "Comisiones":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar empleado o creador..." className="pl-8" value={comisionSearch} onChange={e => setComisionSearch(e.target.value)} />
              </div>
              <Select value={comisionTypeFilter || undefined} onValueChange={v => setComisionTypeFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="laboral">Laboral</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" onClick={() => setShowComisionModal(true)}><Plus className="h-4 w-4 mr-1" />Nueva Comisión</Button>
              <Button size="sm" variant="outline" onClick={exportQuickBooks}><Download className="h-4 w-4 mr-1" />QuickBooks</Button>
              {(comisionSearch || comisionTypeFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setComisionSearch(""); setComisionTypeFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>
            {viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-30rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Base</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">%</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estimada</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Final</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCommissions ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    )) : filteredCommissions.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">Sin comisiones registradas.</TableCell></TableRow>
                    ) : filteredCommissions.map(c => {
                      const badge = COMISION_STATUS[c.status] ?? COMISION_STATUS.proyectado;
                      const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
                      const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
                      return (
                        <TableRow key={c.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell><Badge variant="outline" className="text-[10px]">{(c as any).commission_type === "comercial" ? "Comercial" : "Laboral"}</Badge></TableCell>
                          <TableCell className="text-sm">{empName}</TableCell>
                          <TableCell className="text-sm">{creatorName}</TableCell>
                          <TableCell className="text-sm">{fmt(Number(c.base_amount) || 0)}</TableCell>
                          <TableCell className="text-sm">{Number(c.percentage) || 0}%</TableCell>
                          <TableCell className="text-sm">{fmt(Number(c.estimated_amount) || 0)}</TableCell>
                          <TableCell className="text-sm font-medium">{fmt(Number(c.final_amount) || 0)}</TableCell>
                          <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setComisionViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setComisionDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCommissions.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-12">Sin comisiones.</div>
                ) : filteredCommissions.map(c => {
                  const badge = COMISION_STATUS[c.status] ?? COMISION_STATUS.proyectado;
                  const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
                  const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
                  return (
                    <div key={c.id} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px]">{(c as any).commission_type === "comercial" ? "Comercial" : "Laboral"}</Badge>
                        <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                      </div>
                      <p className="text-sm font-medium">{empName}</p>
                      <p className="text-xs text-muted-foreground">{creatorName}</p>
                      <p className="text-xl font-bold text-foreground mt-2">{fmt(Number(c.final_amount) || 0)}</p>
                      <div className="flex items-center gap-1 mt-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setComisionViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setComisionDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Horas & Variables</h1>
            <p className="text-sm text-muted-foreground">Gestión de horas extra, banco de horas y comisiones</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs globales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(loadingHoras || loadingCommissions) ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Horas Extra" value={`${totalOvertimeHours}h`} icon={Clock} subtitle={`${uniqueEmps} empleados`} color="primary" />
              <DashboardMetricCard label="Banco de Horas" value={`${totalBankHours}h`} icon={Wallet} subtitle={fmt(totalBankAmount)} color="accent" />
              <DashboardMetricCard label="Total Comisiones" value={fmt(commissions.reduce((s, c) => s + (Number(c.final_amount) || 0), 0))} icon={DollarSign} subtitle={`${commissions.length} registros`} color="warning" />
              <DashboardMetricCard label="Empleados Activos" value={String(uniqueEmps)} icon={TrendingUp} subtitle="Con registros" color="muted" />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {TABS.map(t => (
            <Button key={t} variant={tab === t ? "secondary" : "ghost"} size="sm" onClick={() => setTab(t)}>{t}</Button>
          ))}
        </div>

        {renderTab()}
      </div>

      <NuevaComisionModal open={showComisionModal} onClose={() => setShowComisionModal(false)} onSubmit={data => createCommission.mutate(data)} isPending={createCommission.isPending} />

      {/* Pay Hours Dialog */}
      <Dialog open={!!payItem} onOpenChange={() => setPayItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pagar Horas Acumuladas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Empleado: <span className="font-medium text-foreground">{payItem?.employees ? `${payItem.employees.first_name} ${payItem.employees.last_name}` : "—"}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Horas: <span className="font-medium text-foreground">{Number(payItem?.hour_bank_hours) || 0}h</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Monto a pagar: <span className="font-medium text-foreground">{fmt(Number(payItem?.hour_bank_amount) || (Number(payItem?.hour_bank_hours) * hourValue) || 0)}</span> <span className="text-muted-foreground">({fmt(hourValue)}/h)</span>
            </p>
            <p className="text-xs text-muted-foreground">Al confirmar, las horas se marcarán como pagadas y el monto se sumará a overtime_amount.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayItem(null)}>Cancelar</Button>
            <Button onClick={() => payItem && payHoursMutation.mutate(payItem)} disabled={payHoursMutation.isPending}>
              <Banknote className="h-4 w-4 mr-1" />Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compensate Hours Dialog */}
      <Dialog open={!!compensateItem} onOpenChange={() => setCompensateItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Compensar Horas</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Empleado: <span className="font-medium text-foreground">{compensateItem?.employees ? `${compensateItem.employees.first_name} ${compensateItem.employees.last_name}` : "—"}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Horas disponibles: <span className="font-medium text-foreground">{Number(compensateItem?.hour_bank_hours) || 0}h</span>
            </p>
            <div>
              <Label>Horas a compensar</Label>
              <Input type="number" placeholder="0" value={compHours} onChange={e => setCompHours(e.target.value)} max={Number(compensateItem?.hour_bank_hours) || 0} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Textarea placeholder="Motivo de la compensación..." value={compReason} onChange={e => setCompReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompensateItem(null)}>Cancelar</Button>
            <Button onClick={() => compensateItem && compensateHoursMutation.mutate({ id: compensateItem.id, hours: Number(compHours) })} disabled={!compHours || !compReason || compensateHoursMutation.isPending}>
              <ArrowRightLeft className="h-4 w-4 mr-1" />Compensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Commission Dialog */}
      <Dialog open={!!comisionViewItem} onOpenChange={() => setComisionViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle de Comisión</DialogTitle></DialogHeader>
          {comisionViewItem && (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Tipo:</span> {(comisionViewItem as any).commission_type}</p>
              <p><span className="text-muted-foreground">Periodo:</span> {comisionViewItem.period}</p>
              <p><span className="text-muted-foreground">Base:</span> {fmt(Number(comisionViewItem.base_amount) || 0)}</p>
              <p><span className="text-muted-foreground">Porcentaje:</span> {Number(comisionViewItem.percentage) || 0}%</p>
              <p><span className="text-muted-foreground">Estimada:</span> {fmt(Number(comisionViewItem.estimated_amount) || 0)}</p>
              <p><span className="text-muted-foreground">Final:</span> {fmt(Number(comisionViewItem.final_amount) || 0)}</p>
              <p><span className="text-muted-foreground">Estado:</span> {comisionViewItem.status}</p>
              {comisionViewItem.notes && <p><span className="text-muted-foreground">Notas:</span> {comisionViewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Commission Dialog */}
      <AlertDialog open={!!comisionDeleteItem} onOpenChange={() => setComisionDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar comisión?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => comisionDeleteItem && deleteCommission.mutate(comisionDeleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
