import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign, Clock, CheckCircle, Calculator, Plus, Eye, Trash2,
  Search, X, ListIcon, LayoutGrid,
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
import { format } from "date-fns";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  calculado: { variant: "outline", label: "Calculado" },
  cerrado: { variant: "default", label: "Cerrado" },
  pagado: { variant: "default", label: "Pagado" },
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function NominaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ["payroll-periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-periods"] });
      toast({ title: "Periodo eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Nómina</h1>
            <p className="text-sm text-muted-foreground">Gestión de periodos de nómina · {periods.length} registros</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm"><Calculator className="h-4 w-4 mr-1" />Calcular Nómina</Button>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Crear Batch</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Periodos" value={String(periods.length)} icon={DollarSign} subtitle="Todos los registros" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Borradores" value={String(totalBorradores)} icon={Clock} subtitle={periods.length > 0 ? `${((totalBorradores / periods.length) * 100).toFixed(0)}% del total` : "—"} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor={totalBorradores > 0 ? "text-warning" : undefined} />
              <DashboardMetricCard label="Monto Bruto Total" value={formatCurrency(totalBruto)} icon={DollarSign} subtitle="Suma bruta" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Monto Neto Total" value={formatCurrency(totalNeto)} icon={CheckCircle} subtitle="Suma neta" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar periodo..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
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
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Empleados</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Bruto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">{periods.length === 0 ? "No hay periodos de nómina registrados." : "Sin resultados."}</TableCell></TableRow>
                  ) : filtered.map(p => {
                    const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.borrador;
                    return (
                      <TableRow key={p.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm font-medium">{p.period_name}</TableCell>
                        <TableCell className="text-sm">{p.total_employees}</TableCell>
                        <TableCell className="text-sm font-medium">{formatCurrency(Number(p.gross_total) || 0)}</TableCell>
                        <TableCell className="text-sm font-medium">{formatCurrency(Number(p.net_total) || 0)}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex items-center gap-1">
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(p)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
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
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewItem(p)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{p.period_name}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.total_employees} empleados</div>
                    <div className="flex justify-between text-sm">
                      <span>Bruto: {formatCurrency(Number(p.gross_total) || 0)}</span>
                      <span className="font-medium">Neto: {formatCurrency(Number(p.net_total) || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle del Periodo</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Periodo:</strong> {viewItem.period_name}</p>
              <p><strong>Rango:</strong> {viewItem.start_date} — {viewItem.end_date}</p>
              <p><strong>Empleados:</strong> {viewItem.total_employees}</p>
              <p><strong>Bruto:</strong> {formatCurrency(Number(viewItem.gross_total) || 0)}</p>
              <p><strong>Neto:</strong> {formatCurrency(Number(viewItem.net_total) || 0)}</p>
              <p><strong>Estado:</strong> {viewItem.status}</p>
              {viewItem.notes && <p><strong>Notas:</strong> {viewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar periodo?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará el periodo "{deleteItem?.period_name}" y todos sus detalles.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
