import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, CheckCircle, Calculator, Plus, Eye, Trash2, Lock,
  Search, X, ListIcon, LayoutGrid, FileDown, FileText, Mail, Wallet, TrendingUp, Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import CalcularNominaModal from "./CalcularNominaModal";
import CrearBatchModal from "./CrearBatchModal";
import NuevaComisionModal from "../comisiones/NuevaComisionModal";
import { useNomina } from "./useNomina";
import { generatePayrollPdf, generateBankFile } from "./generatePayrollPdf";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  calculado: { variant: "outline", label: "Calculado" },
  cerrado: { variant: "default", label: "Cerrado" },
  pagado: { variant: "default", label: "Pagado" },
};

const COMISION_STATUS: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  proyectado: { variant: "outline", label: "Proyectado" },
  confirmado: { variant: "default", label: "Confirmado" },
  pagado: { variant: "secondary", label: "Pagado" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const NOMINA_TABS = ["Cálculo", "Recibos", "Mail", "Horas Extra", "Banco de Horas", "Comisiones", "Batch"] as const;
type NominaTab = typeof NOMINA_TABS[number];

export default function NominaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nominaTab, setNominaTab] = useState<NominaTab>("Cálculo");
  const { periods, employees, details, loadingPeriods, loadingDetails, createPeriod, batchClose, deletePeriod } = useNomina();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

  // Comisiones state
  const [showComisionModal, setShowComisionModal] = useState(false);
  const [comisionSearch, setComisionSearch] = useState("");
  const [comisionTypeFilter, setComisionTypeFilter] = useState("");
  const [comisionViewItem, setComisionViewItem] = useState<any>(null);
  const [comisionDeleteItem, setComisionDeleteItem] = useState<any>(null);

  // Comisiones query
  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["commissions"],
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
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
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
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: "Comisión eliminada" });
      setComisionDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // Horas extra query
  const { data: horasDetails = [], isLoading: loadingHoras } = useQuery({
    queryKey: ["payroll-details-horas"],
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

  const totalBorradores = periods.filter(p => p.status === "borrador").length;
  const totalBruto = periods.reduce((s, p) => s + (Number(p.gross_total) || 0), 0);
  const totalNeto = periods.reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const filtered = periods.filter(p => {
    const matchSearch = !search || p.period_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    const d = new Date(p.created_at);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  const isLocked = (status: string) => status === "cerrado" || status === "pagado";
  const batchPeriods = periods.filter(p => p.status === "borrador" || p.status === "calculado");
  const pagados = periods.filter(p => p.status === "pagado" || p.status === "cerrado");

  // Horas computed
  const totalOvertimeHours = horasDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
  const totalOvertimeAmount = horasDetails.reduce((s, d) => s + (Number(d.overtime_amount) || 0), 0);
  const totalBankHours = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_hours) || 0), 0);
  const totalBankAmount = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_amount) || 0), 0);
  const uniqueEmps = new Set(horasDetails.map(d => d.employee_id)).size;

  // Comisiones computed
  const filteredCommissions = commissions.filter(c => {
    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "";
    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "";
    const matchSearch = !comisionSearch || empName.toLowerCase().includes(comisionSearch.toLowerCase()) || creatorName.toLowerCase().includes(comisionSearch.toLowerCase());
    const matchType = !comisionTypeFilter || (c as any).commission_type === comisionTypeFilter;
    return matchSearch && matchType;
  });

  const renderTabContent = () => {
    switch (nominaTab) {
      case "Recibos":
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{pagados.length} periodos con recibo disponible</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagados.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin recibos disponibles.</TableCell></TableRow>
                  ) : pagados.map(p => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                      <TableCell><Badge variant="default">{p.status}</Badge></TableCell>
                      <TableCell className="text-sm font-medium">{fmt(Number(p.net_total) || 0)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => generatePayrollPdf(p, details.filter(d => d.payroll_period_id === p.id))}>
                          <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );

      case "Mail":
        return (
          <div className="space-y-5">
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <Mail className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-1">Envío de Recibos por Correo</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Envía recibos de nómina a los empleados automáticamente por correo electrónico. Selecciona un periodo cerrado o pagado para generar y enviar los recibos.
              </p>
              <Button size="sm" variant="outline" className="mt-4" disabled>
                <Mail className="h-4 w-4 mr-1" />Próximamente
              </Button>
            </div>
          </div>
        );

      case "Horas Extra":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingHoras ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <DashboardMetricCard label="Total Horas Extra" value={String(totalOvertimeHours)} icon={Clock} subtitle={`${uniqueEmps} empleados`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
                  <DashboardMetricCard label="Costo Total" value={fmt(totalOvertimeAmount)} icon={DollarSign} subtitle="Monto acumulado" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
                  <DashboardMetricCard label="Promedio por Empleado" value={uniqueEmps > 0 ? (totalOvertimeHours / uniqueEmps).toFixed(1) + "h" : "0h"} icon={TrendingUp} subtitle="Horas extra" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Horas</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHoras ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : horasDetails.filter(d => Number(d.overtime_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin registros de horas extra.</TableCell></TableRow>
                  ) : horasDetails.filter(d => Number(d.overtime_hours) > 0).map(d => (
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
        );

      case "Banco de Horas":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {loadingHoras ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <DashboardMetricCard label="Horas Acumuladas" value={String(totalBankHours)} icon={Wallet} subtitle="Banco total" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
                  <DashboardMetricCard label="Valor Total" value={fmt(totalBankAmount)} icon={DollarSign} subtitle="Valoración" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Horas Acumuladas</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Valor</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Último Periodo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHoras ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : horasDetails.filter(d => Number(d.hour_bank_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin registros en banco de horas.</TableCell></TableRow>
                  ) : horasDetails.filter(d => Number(d.hour_bank_hours) > 0).map(d => (
                    <TableRow key={d.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{Number(d.hour_bank_hours) || 0}h</TableCell>
                      <TableCell className="text-sm">{fmt(Number(d.hour_bank_amount) || 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );

      case "Comisiones":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {loadingCommissions ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <DashboardMetricCard label="Total Registros" value={String(commissions.length)} icon={TrendingUp} subtitle="Todas las comisiones" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
                  <DashboardMetricCard label="Proyectadas" value={String(commissions.filter(c => c.status === "proyectado").length)} icon={Clock} subtitle="Pendientes" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" />
                  <DashboardMetricCard label="Confirmadas" value={String(commissions.filter(c => c.status === "confirmado").length)} icon={CheckCircle} subtitle="Listas para pago" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
                  <DashboardMetricCard label="Monto Estimado" value={fmt(commissions.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0))} icon={DollarSign} subtitle="Suma estimada" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
                </>
              )}
            </div>
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
              <Button size="sm" onClick={() => setShowComisionModal(true)}><Plus className="h-4 w-4 mr-1" />Nueva Comisión</Button>
              {(comisionSearch || comisionTypeFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setComisionSearch(""); setComisionTypeFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>
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
          </div>
        );

      case "Batch":
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{batchPeriods.length} periodos elegibles para cierre</p>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setShowBatchModal(true)}><Plus className="h-4 w-4 mr-1" />Crear Batch</Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchPeriods.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin periodos abiertos para cerrar.</TableCell></TableRow>
                  ) : batchPeriods.map(p => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                      <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                      <TableCell className="text-sm font-medium">{fmt(Number(p.net_total) || 0)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => generateBankFile(p, details.filter(d => d.payroll_period_id === p.id))}>
                          <FileText className="h-3.5 w-3.5 mr-1" />CSV
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );

      default: // Cálculo
        return (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar periodo..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter || undefined} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="calculado">Calculado</SelectItem>
                  <SelectItem value="cerrado">Cerrado</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}><ListIcon className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Limpiar
                </Button>
              )}
            </div>

            {viewMode === "list" ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-auto max-h-[calc(100vh-28rem)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 bg-card border-b">
                        <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Empleados</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Total Bruto</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPeriods ? Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                      )) : filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">{periods.length === 0 ? "No hay periodos de nómina." : "Sin resultados."}</TableCell></TableRow>
                      ) : filtered.map(p => {
                        const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.borrador;
                        const locked = isLocked(p.status);
                        return (
                          <TableRow key={p.id} className="group hover:bg-muted/30 transition-colors">
                            <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                            <TableCell className="text-sm">{p.total_employees}</TableCell>
                            <TableCell className="text-sm font-medium">{fmt(Number(p.gross_total) || 0)}</TableCell>
                            <TableCell className="text-sm font-medium">{fmt(Number(p.net_total) || 0)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Badge variant={badge.variant}>{badge.label}</Badge>
                                {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                              </div>
                            </TableCell>
                            <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                              <div className="flex items-center gap-1">
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(p)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                                {!locked && (
                                  <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                                )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => {
                  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.borrador;
                  const locked = isLocked(p.status);
                  return (
                    <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewItem(p)}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{p.period_name}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">{p.total_employees} empleados</div>
                        <div className="flex justify-between text-sm">
                          <span>Bruto: {fmt(Number(p.gross_total) || 0)}</span>
                          <span className="font-medium">Neto: {fmt(Number(p.net_total) || 0)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Nómina</h1>
            <p className="text-sm text-muted-foreground">Gestión de periodos de nómina · {periods.length} registros</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCalcModal(true)}><Calculator className="h-4 w-4 mr-1" />Calcular Nómina</Button>
            <Button size="sm" variant="outline" onClick={() => setShowBatchModal(true)}><Plus className="h-4 w-4 mr-1" />Crear Batch</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingPeriods ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Periodos" value={String(periods.length)} icon={DollarSign} subtitle="Todos los registros" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Borradores" value={String(totalBorradores)} icon={Clock} subtitle={periods.length > 0 ? `${((totalBorradores / periods.length) * 100).toFixed(0)}% del total` : "—"} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor={totalBorradores > 0 ? "text-warning" : undefined} />
              <DashboardMetricCard label="Monto Bruto Total" value={fmt(totalBruto)} icon={DollarSign} subtitle="Suma bruta" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Monto Neto Total" value={fmt(totalNeto)} icon={CheckCircle} subtitle="Suma neta" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </>
          )}
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {NOMINA_TABS.map(t => (
            <Button key={t} variant={nominaTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setNominaTab(t)}>{t}</Button>
          ))}
        </div>
        {renderTabContent()}
      </div>

      <CalcularNominaModal open={showCalcModal} onClose={() => setShowCalcModal(false)} employees={employees} onSubmit={data => createPeriod.mutate(data)} isPending={createPeriod.isPending} />
      <CrearBatchModal open={showBatchModal} onClose={() => setShowBatchModal(false)} periods={periods} onSubmit={(ids, reason) => batchClose.mutate({ ids, reason })} isPending={batchClose.isPending} />
      <NuevaComisionModal open={showComisionModal} onClose={() => setShowComisionModal(false)} onSubmit={data => createCommission.mutate(data)} isPending={createCommission.isPending} />

      {/* Periodo detail dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle del Periodo</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Periodo:</strong> {viewItem.period_name}</p>
              <p><strong>Rango:</strong> {viewItem.start_date} — {viewItem.end_date}</p>
              <p><strong>Empleados:</strong> {viewItem.total_employees}</p>
              <p><strong>Bruto:</strong> {fmt(Number(viewItem.gross_total) || 0)}</p>
              <p><strong>Neto:</strong> {fmt(Number(viewItem.net_total) || 0)}</p>
              <p><strong>Estado:</strong> {viewItem.status} {isLocked(viewItem.status) && "🔒"}</p>
              <p><strong>Centro de Costo:</strong> {viewItem.cost_center || "—"}</p>
              {viewItem.notes && <p><strong>Notas:</strong> {viewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comision detail dialog */}
      <Dialog open={!!comisionViewItem} onOpenChange={() => setComisionViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle Comisión</DialogTitle></DialogHeader>
          {comisionViewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Tipo:</strong> {(comisionViewItem as any).commission_type === "comercial" ? "Comercial" : "Laboral"}</p>
              <p><strong>Empleado:</strong> {comisionViewItem.employees ? `${(comisionViewItem as any).employees.first_name} ${(comisionViewItem as any).employees.last_name}` : "—"}</p>
              <p><strong>Creador:</strong> {(comisionViewItem as any).creators?.artistic_name || (comisionViewItem as any).creators?.name || "—"}</p>
              <p><strong>Periodo:</strong> {comisionViewItem.period}</p>
              <p><strong>Base:</strong> {fmt(Number(comisionViewItem.base_amount) || 0)}</p>
              <p><strong>Porcentaje:</strong> {Number(comisionViewItem.percentage) || 0}%</p>
              <p><strong>Estimada:</strong> {fmt(Number(comisionViewItem.estimated_amount) || 0)}</p>
              <p><strong>Final:</strong> {fmt(Number(comisionViewItem.final_amount) || 0)}</p>
              <p><strong>Estado:</strong> {comisionViewItem.status}</p>
              {comisionViewItem.notes && <p><strong>Notas:</strong> {comisionViewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete periodo dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar periodo?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará "{deleteItem?.period_name}" permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem && deletePeriod.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete comision dialog */}
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
