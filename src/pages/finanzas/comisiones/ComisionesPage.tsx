import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  proyectado: { variant: "outline", label: "Proyectado" },
  confirmado: { variant: "default", label: "Confirmado" },
  pagado: { variant: "secondary", label: "Pagado" },
};

const TABS = ["En Tiempo Real", "Proyección", "Historial Batch"];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ComisionesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: commissions = [], isLoading } = useQuery({
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

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("En Tiempo Real");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: "Comisión eliminada" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const totalProyectadas = commissions.filter(c => c.status === "proyectado").length;
  const totalConfirmadas = commissions.filter(c => c.status === "confirmado").length;
  const totalEstimado = commissions.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0);

  const filtered = commissions.filter(c => {
    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "";
    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "";
    return !search || empName.toLowerCase().includes(search.toLowerCase()) || creatorName.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Comisiones</h1>
            <p className="text-sm text-muted-foreground">Gestión de comisiones de empleados · {commissions.length} registros</p>
          </div>
          <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Comisión</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Registros" value={String(commissions.length)} icon={TrendingUp} subtitle="Todas las comisiones" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Proyectadas" value={String(totalProyectadas)} icon={Clock} subtitle="Pendientes de confirmación" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor={totalProyectadas > 0 ? "text-warning" : undefined} />
              <DashboardMetricCard label="Confirmadas" value={String(totalConfirmadas)} icon={CheckCircle} subtitle="Listas para pago" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Monto Estimado Total" value={fmt(totalEstimado)} icon={DollarSign} subtitle="Suma estimada" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado o creador..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}><ListIcon className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          {search && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setSearch("")}>
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
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">{commissions.length === 0 ? "No hay comisiones registradas." : "Sin resultados."}</TableCell></TableRow>
                  ) : filtered.map(c => {
                    const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.proyectado;
                    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
                    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
                    return (
                      <TableRow key={c.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm">{empName}</TableCell>
                        <TableCell className="text-sm">{creatorName}</TableCell>
                        <TableCell className="text-sm">{fmt(Number(c.base_amount) || 0)}</TableCell>
                        <TableCell className="text-sm">{Number(c.percentage) || 0}%</TableCell>
                        <TableCell className="text-sm">{fmt(Number(c.estimated_amount) || 0)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(c.final_amount) || 0)}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex items-center gap-1">
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
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
            {filtered.map(c => {
              const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.proyectado;
              const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
              const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
              return (
                <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewItem(c)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{empName}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{creatorName} · {c.period}</p>
                    <div className="flex justify-between text-sm">
                      <span>Est: {fmt(Number(c.estimated_amount) || 0)}</span>
                      <span className="font-medium">Final: {fmt(Number(c.final_amount) || 0)}</span>
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
          <DialogHeader><DialogTitle>Detalle Comisión</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Empleado:</strong> {viewItem.employees ? `${(viewItem as any).employees.first_name} ${(viewItem as any).employees.last_name}` : "—"}</p>
              <p><strong>Creador:</strong> {(viewItem as any).creators?.artistic_name || (viewItem as any).creators?.name || "—"}</p>
              <p><strong>Periodo:</strong> {viewItem.period}</p>
              <p><strong>Base:</strong> {fmt(Number(viewItem.base_amount) || 0)}</p>
              <p><strong>Porcentaje:</strong> {Number(viewItem.percentage) || 0}%</p>
              <p><strong>Estimada:</strong> {fmt(Number(viewItem.estimated_amount) || 0)}</p>
              <p><strong>Final:</strong> {fmt(Number(viewItem.final_amount) || 0)}</p>
              <p><strong>Estado:</strong> {viewItem.status}</p>
              {viewItem.notes && <p><strong>Notas:</strong> {viewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar comisión?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
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
