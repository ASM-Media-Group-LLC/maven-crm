import { useState } from "react";
import {
  DollarSign, Clock, CheckCircle, Calculator, Plus, Eye, Trash2, Lock,
  Search, X, ListIcon, LayoutGrid, FileDown, FileText,
} from "lucide-react";
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
import { useNomina } from "./useNomina";
import { generatePayrollPdf, generateBankFile } from "./generatePayrollPdf";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  calculado: { variant: "outline", label: "Calculado" },
  cerrado: { variant: "default", label: "Cerrado" },
  pagado: { variant: "default", label: "Pagado" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const NOMINA_TABS = ["Cálculo de Nómina", "Tiempo Real", "Batch", "Recibos de Pago", "Archivos Bancarios"] as const;
type NominaTab = typeof NOMINA_TABS[number];

export default function NominaPage() {
  const [nominaTab, setNominaTab] = useState<NominaTab>("Cálculo de Nómina");
  const { periods, employees, details, loadingPeriods, createPeriod, batchClose, deletePeriod } = useNomina();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [showCalcModal, setShowCalcModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);

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

  // Tiempo Real tab data
  const proyeccionBase = employees.reduce((s, e) => s + (Number(e.base_salary) || 0), 0);

  // Batch tab data
  const batchPeriods = periods.filter(p => p.status === "borrador" || p.status === "calculado");

  // Recibos tab data
  const pagados = periods.filter(p => p.status === "pagado" || p.status === "cerrado");

  const renderTabContent = () => {
    switch (nominaTab) {
      case "Tiempo Real":
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <DashboardMetricCard label="Proyección Nómina" value={fmt(proyeccionBase)} icon={Calculator} subtitle={`${employees.length} empleados activos`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Periodos Abiertos" value={String(batchPeriods.length)} icon={Clock} subtitle="Borrador + calculado" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" />
              <DashboardMetricCard label="Empleados Activos" value={String(employees.length)} icon={CheckCircle} subtitle="Nómina actual" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Código</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Salario Base</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(e => (
                    <TableRow key={e.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{e.first_name} {e.last_name}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">{e.employee_code}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(Number(e.base_salary) || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      case "Batch":
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{batchPeriods.length} periodos elegibles para cierre</p>
              <Button size="sm" onClick={() => setShowBatchModal(true)}><Plus className="h-4 w-4 mr-1" />Crear Batch</Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchPeriods.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin periodos abiertos para cerrar.</TableCell></TableRow>
                  ) : batchPeriods.map(p => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                      <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                      <TableCell className="text-sm font-medium">{fmt(Number(p.net_total) || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      case "Recibos de Pago":
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
      case "Archivos Bancarios":
        return (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{pagados.length} periodos disponibles para archivo bancario</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagados.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin periodos disponibles.</TableCell></TableRow>
                  ) : pagados.map(p => (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                      <TableCell className="text-sm font-medium">{fmt(Number(p.net_total) || 0)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => generateBankFile(p, details.filter(d => d.payroll_period_id === p.id))}>
                          <FileText className="h-3.5 w-3.5 mr-1" />Generar CSV
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      default: // Cálculo de Nómina
        return (
          <>
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
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {NOMINA_TABS.map(t => (
            <Button key={t} variant={nominaTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setNominaTab(t)}>{t}</Button>
          ))}
        </div>
        {renderTabContent()}
      </div>

      <CalcularNominaModal open={showCalcModal} onClose={() => setShowCalcModal(false)} employees={employees} onSubmit={data => createPeriod.mutate(data)} isPending={createPeriod.isPending} />
      <CrearBatchModal open={showBatchModal} onClose={() => setShowBatchModal(false)} periods={periods} onSubmit={(ids, reason) => batchClose.mutate({ ids, reason })} isPending={batchClose.isPending} />

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
    </div>
  );
}
