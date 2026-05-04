import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, CheckCircle, Calculator, Plus, Eye, Trash2, Lock,
  Search, X, ListIcon, LayoutGrid, FileDown, FileText, Mail, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { useNomina } from "./useNomina";
// generatePayrollPdf + generateBankFile pull jspdf — loaded on demand
// from the export buttons below so the nómina page stays light.
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  calculado: { variant: "outline", label: "Calculado" },
  cerrado: { variant: "default", label: "Cerrado" },
  pagado: { variant: "default", label: "Pagado" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function PeriodDetailContent({ item }: { item: any }) {
  const { data: deductions = [], isLoading } = useQuery({
    queryKey: ["nomina-deductions", item.period_name],
    queryFn: async () => {
      // Try matching month_year from period_name (e.g. "2025-02" or contains it)
      const { data, error } = await supabase
        .from("employee_deductions")
        .select("*, employees(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // Filter client-side by period match
      return (data ?? []).filter(d => item.period_name?.includes(d.month_year) || d.month_year?.includes(item.period_name?.slice(0, 7)));
    },
  });

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p><span className="text-muted-foreground">Periodo:</span> {item.period_name}</p>
        <p><span className="text-muted-foreground">Estado:</span> <Badge variant={STATUS_BADGE[item.status]?.variant || "outline"}>{STATUS_BADGE[item.status]?.label || item.status}</Badge></p>
        <p><span className="text-muted-foreground">Empleados:</span> {item.total_employees}</p>
        <p><span className="text-muted-foreground">Total Bruto:</span> {fmt(Number(item.gross_total) || 0)}</p>
        <p><span className="text-muted-foreground">Total Neto:</span> {fmt(Number(item.net_total) || 0)}</p>
        <p><span className="text-muted-foreground">Centro de Costo:</span> {item.cost_center || "—"}</p>
        {item.notes && <p><span className="text-muted-foreground">Notas:</span> {item.notes}</p>}
      </div>

      {/* Deducciones de HR */}
      <div className="border-t pt-3">
        <p className="text-sm font-medium mb-2">Deducciones Aplicadas (HR)</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Cargando...</p>
        ) : deductions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin deducciones asociadas a este periodo.</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {deductions.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded border border-border px-2 py-1.5">
                <div>
                  <span className="text-xs font-medium">{d.employees?.first_name} {d.employees?.last_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{d.deduction_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">${Number(d.amount).toLocaleString("es-CO")}</span>
                  <Badge variant={d.status === "applied" ? "default" : "secondary"} className="text-[10px]">{d.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const NOMINA_TABS = ["Cálculo", "Recibos", "Mail", "Batch"] as const;
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
  const [showCloseMonthDialog, setShowCloseMonthDialog] = useState(false);

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

  // Cerrar Mes
  const closeMonthMutation = useMutation({
    mutationFn: async () => {
      const openPeriods = periods.filter(p => p.status === "borrador" || p.status === "calculado");
      if (openPeriods.length === 0) throw new Error("No hay periodos abiertos");
      const ids = openPeriods.map(p => p.id);
      const { error } = await supabase.from("payroll_periods").update({ status: "cerrado" }).in("id", ids);
      if (error) throw error;
      // Generate bank files for each
      const { generateBankFile } = await import("./generatePayrollPdf");
      for (const p of openPeriods) {
        const pDetails = details.filter(d => d.payroll_period_id === p.id);
        generateBankFile(p, pDetails);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Mes cerrado. Archivo bancario generado. Recibos disponibles para envío." });
      setShowCloseMonthDialog(false);
    },
    onError: (e: any) => toast({ title: e.message || "Error al cerrar mes", variant: "destructive" }),
  });

  // QuickBooks export
  const exportQuickBooks = () => {
    const rows = batchPeriods.map(p => ({
      Date: new Date(p.created_at).toLocaleDateString("en-US"),
      Name: p.period_name,
      Memo: `Nómina ${p.period_name}`,
      Amount: Number(p.net_total) || 0,
      Account: p.cost_center || "Nómina",
    }));
    if (rows.length === 0) { toast({ title: "Sin periodos para exportar", variant: "destructive" }); return; }
    exportTableToExcel(rows, "quickbooks-nomina");
    toast({ title: "Archivo QuickBooks generado" });
  };

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
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const { generatePayrollPdf } = await import("./generatePayrollPdf");
                          generatePayrollPdf(p, details.filter(d => d.payroll_period_id === p.id));
                        }}>
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

      case "Batch":
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{batchPeriods.length} periodos elegibles para cierre</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={exportQuickBooks}><Download className="h-4 w-4 mr-1" />Exportar a QuickBooks</Button>
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
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const { generateBankFile } = await import("./generatePayrollPdf");
                          generateBankFile(p, details.filter(d => d.payroll_period_id === p.id));
                        }}>
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
            <Button size="sm" variant="outline" onClick={() => setShowCloseMonthDialog(true)} disabled={batchPeriods.length === 0}>
              <Lock className="h-4 w-4 mr-1" />Cerrar Mes
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loadingPeriods ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Periodos" value={String(periods.length)} icon={DollarSign} subtitle="Todos los registros" color="primary" />
              <DashboardMetricCard label="Borradores" value={String(totalBorradores)} icon={Clock} subtitle={periods.length > 0 ? `${((totalBorradores / periods.length) * 100).toFixed(0)}% del total` : "—"} color="warning" />
              <DashboardMetricCard label="Monto Bruto Total" value={fmt(totalBruto)} icon={DollarSign} subtitle="Suma bruta" color="accent" />
              <DashboardMetricCard label="Monto Neto Total" value={fmt(totalNeto)} icon={CheckCircle} subtitle="Suma neta" color="destructive" />
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

      {/* Cerrar Mes Dialog */}
      <AlertDialog open={showCloseMonthDialog} onOpenChange={setShowCloseMonthDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar el Mes?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta acción cerrará {batchPeriods.length} periodo(s) abierto(s) y generará los archivos bancarios correspondientes.</p>
              <div className="rounded-md border border-border p-3 bg-muted/50 space-y-1 text-sm">
                <p>Periodos a cerrar: <span className="font-medium">{batchPeriods.length}</span></p>
                <p>Monto total neto: <span className="font-medium">{fmt(batchPeriods.reduce((s, p) => s + (Number(p.net_total) || 0), 0))}</span></p>
              </div>
              <p className="text-xs text-muted-foreground">Una vez cerrado, no se podrán editar los periodos.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMonthMutation.mutate()} disabled={closeMonthMutation.isPending}>
              <Lock className="h-4 w-4 mr-1" />Confirmar Cierre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Periodo detail dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Periodo</DialogTitle></DialogHeader>
          {viewItem && <PeriodDetailContent item={viewItem} />}
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar periodo?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará "{deleteItem?.period_name}". Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem && deletePeriod.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
