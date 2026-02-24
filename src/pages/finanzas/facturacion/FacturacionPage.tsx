import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Clock, CheckCircle, DollarSign, Plus, Eye, Pencil, Trash2, RotateCcw,
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
  enviada: { variant: "outline", label: "Enviada" },
  pagada: { variant: "default", label: "Pagada" },
  vencida: { variant: "destructive", label: "Vencida" },
  reversada: { variant: "destructive", label: "Reversada" },
};

const PAYMENT_TABS = ["Todos", "PayPal", "Transferencia", "Crypto", "Otro"];
const FACTURA_TABS = ["Invoices", "Envío Masivo", "Notas de Pago", "Reversos", "Fees & Ajustes"] as const;
type FacturaTab = typeof FACTURA_TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function FacturacionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("*, creators(name, artistic_name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [facturaTab, setFacturaTab] = useState<FacturaTab>("Invoices");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentTab, setPaymentTab] = useState("Todos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const totalPendientes = invoices.filter(i => i.status === "enviada" || i.status === "vencida").length;
  const totalMonto = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalFee = invoices.reduce((s, i) => s + (Number(i.fee_amount) || 0), 0);
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const filtered = invoices.filter(inv => {
    const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "";
    const matchSearch = !search || creatorName.toLowerCase().includes(search.toLowerCase()) || inv.invoice_number.includes(search);
    const matchStatus = !statusFilter || inv.status === statusFilter;
    const matchPayment = paymentTab === "Todos" || (inv.payment_method || "").toLowerCase() === paymentTab.toLowerCase();
    const d = new Date(inv.created_at);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchStatus && matchPayment && matchFrom && matchTo;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Facturación</h1>
            <p className="text-sm text-muted-foreground">Gestión de invoices a creadores · {invoices.length} registros</p>
          </div>
          <Button size="sm"><Plus className="h-4 w-4 mr-1" />Crear Invoice</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {FACTURA_TABS.map(t => (
            <Button key={t} variant={facturaTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setFacturaTab(t)}>{t}</Button>
          ))}
        </div>

        {facturaTab !== "Invoices" ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">Próximamente: {facturaTab}</p>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Invoices" value={String(invoices.length)} icon={FileText} subtitle="Todos los registros" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Pendientes de Pago" value={String(totalPendientes)} icon={Clock} subtitle="Enviadas + vencidas" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor={totalPendientes > 0 ? "text-warning" : undefined} />
              <DashboardMetricCard label="Monto Total" value={fmt(totalMonto)} icon={DollarSign} subtitle="Suma de montos" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Fee Total" value={fmt(totalFee)} icon={DollarSign} subtitle="Suma de fees" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {PAYMENT_TABS.map(t => (
            <Button key={t} variant={paymentTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setPaymentTab(t)}>{t}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar creador o número..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="borrador">Borrador</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="pagada">Pagada</SelectItem>
              <SelectItem value="vencida">Vencida</SelectItem>
              <SelectItem value="reversada">Reversada</SelectItem>
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
            <div className="overflow-auto max-h-[calc(100vh-30rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Fee</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Total Neto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Vencimiento</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">{invoices.length === 0 ? "No hay invoices. Crea el primero." : "Sin resultados."}</TableCell></TableRow>
                  ) : filtered.map(inv => {
                    const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.borrador;
                    const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "—";
                    const initials = creatorName.slice(0, 2).toUpperCase();
                    return (
                      <TableRow key={inv.id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-semibold text-primary">{initials}</span>
                            </div>
                            <span className="text-sm">{creatorName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0)}</TableCell>
                        <TableCell className="text-sm">{fmt(Number(inv.fee_amount) || 0)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.net_amount) || 0)}</TableCell>
                        <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex items-center gap-1">
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inv)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(inv)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><RotateCcw className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Reversar</TooltipContent></Tooltip>
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
            {filtered.map(inv => {
              const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.borrador;
              const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "—";
              return (
                <Card key={inv.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setViewItem(inv)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">#{inv.invoice_number}</span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-sm font-medium">{creatorName}</p>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Monto: {fmt(Number(inv.amount) || 0)}</span>
                      <span>Neto: {fmt(Number(inv.net_amount) || 0)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </>
        )}
      </div>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle Invoice #{viewItem?.invoice_number}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>Creador:</strong> {(viewItem as any).creators?.artistic_name || (viewItem as any).creators?.name || "—"}</p>
              <p><strong>Monto:</strong> {fmt(Number(viewItem.amount) || 0)}</p>
              <p><strong>Fee ({viewItem.fee_type}):</strong> {fmt(Number(viewItem.fee_amount) || 0)}</p>
              <p><strong>Neto:</strong> {fmt(Number(viewItem.net_amount) || 0)}</p>
              <p><strong>Método:</strong> {viewItem.payment_method || "—"}</p>
              <p><strong>Estado:</strong> {viewItem.status}</p>
              <p><strong>Vencimiento:</strong> {viewItem.due_date || "—"}</p>
              {viewItem.notes && <p><strong>Notas:</strong> {viewItem.notes}</p>}
              {viewItem.reversal_reason && <p><strong>Razón reverso:</strong> {viewItem.reversal_reason}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar invoice?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará el invoice #{deleteItem?.invoice_number}.</AlertDialogDescription>
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
