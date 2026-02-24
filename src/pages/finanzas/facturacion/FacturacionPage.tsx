import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2, RotateCcw, Send, Download, Mail,
  Search, X, LayoutGrid, List,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import CrearInvoiceModal from "./CrearInvoiceModal";
import ReversarInvoiceModal from "./ReversarInvoiceModal";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  enviada: { variant: "outline", label: "Enviada" },
  pagada: { variant: "default", label: "Pagada" },
  parcial: { variant: "outline", label: "Parcial" },
  vencida: { variant: "destructive", label: "Vencida" },
  reversada: { variant: "destructive", label: "Reversada" },
};

const FACTURA_TABS = ["Invoices", "Notas de Pago", "Reversos", "Fees & Ajustes", "Mail", "Archivo de PagoMundo"] as const;
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

  const createInvoice = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoices").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice creado" });
    },
    onError: () => toast({ title: "Error al crear", variant: "destructive" }),
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("invoices").update({ status: "reversada", reversal_reason: reason }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice reversado" });
    },
    onError: () => toast({ title: "Error al reversar", variant: "destructive" }),
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("invoices").update({ status: "enviada" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoices enviados masivamente" });
      setBulkSelected([]);
    },
    onError: () => toast({ title: "Error en envío masivo", variant: "destructive" }),
  });

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

  const [search, setSearch] = useState("");
  const [facturaTab, setFacturaTab] = useState<FacturaTab>("Invoices");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reverseItem, setReverseItem] = useState<any>(null);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const totalPendientes = invoices.filter(i => i.status === "enviada" || i.status === "vencida").length;
  const totalMonto = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalFee = invoices.reduce((s, i) => s + (Number(i.fee_amount) || 0), 0);
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const getTabFiltered = () => {
    let base = invoices;
    if (facturaTab === "Notas de Pago") base = invoices.filter(i => i.status === "pagada" || i.status === "parcial");
    else if (facturaTab === "Mail") base = invoices.filter(i => i.status === "borrador");

    return base.filter(inv => {
      const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "";
      const matchSearch = !search || creatorName.toLowerCase().includes(search.toLowerCase()) || inv.invoice_number.includes(search);
      const matchStatus = !statusFilter || inv.status === statusFilter;
      const d = new Date(inv.created_at);
      const matchFrom = !dateFrom || d >= dateFrom;
      const matchTo = !dateTo || d <= dateTo;
      return matchSearch && matchStatus && matchFrom && matchTo;
    });
  };

  const filtered = getTabFiltered();

  const toggleBulk = (id: string) => setBulkSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const renderInvoiceTable = (showBulkCheckbox = false) => (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-30rem)]">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b">
              {showBulkCheckbox && <TableHead className="w-10" />}
              <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Fee</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Neto</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Vencimiento</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: showBulkCheckbox ? 9 : 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={showBulkCheckbox ? 9 : 8} className="text-center text-muted-foreground py-12">Sin resultados.</TableCell></TableRow>
            ) : filtered.map(inv => {
              const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.borrador;
              const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "—";
              const initials = creatorName.slice(0, 2).toUpperCase();
              const canEdit = inv.status === "borrador" || inv.status === "enviada";
              return (
                <TableRow key={inv.id} className="group hover:bg-muted/30 transition-colors">
                  {showBulkCheckbox && (
                    <TableCell><Checkbox checked={bulkSelected.includes(inv.id)} onCheckedChange={() => toggleBulk(inv.id)} /></TableCell>
                  )}
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
                      {canEdit && (
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(inv)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                      )}
                      {canEdit && (
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setReverseItem(inv)}><RotateCcw className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Reversar</TooltipContent></Tooltip>
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
  );

  const renderTabContent = () => {
    switch (facturaTab) {
      case "Notas de Pago":
        return (
          <>
            <p className="text-sm text-muted-foreground">{filtered.length} invoices pagados o parciales</p>
            {renderInvoiceTable()}
          </>
        );

      case "Reversos":
        return (
          <>
            <p className="text-sm text-muted-foreground">{invoices.filter(i => i.status === "reversada").length} invoices reversados</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Razón del Reverso</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.filter(i => i.status === "reversada").length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Sin reversos registrados.</TableCell></TableRow>
                    ) : invoices.filter(i => i.status === "reversada").map(inv => (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.reversal_reason || "—"}</TableCell>
                        <TableCell className="text-sm">{format(new Date(inv.created_at), "dd/MM/yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        );

      case "Fees & Ajustes":
        return (
          <>
            <p className="text-sm text-muted-foreground">Detalle de fees aplicados a invoices</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Tipo Fee</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Fee</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto Neto</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.filter(i => Number(i.fee_amount) > 0).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Sin fees registrados.</TableCell></TableRow>
                    ) : invoices.filter(i => Number(i.fee_amount) > 0).map(inv => (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm font-mono">#{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">{(inv as any).creators?.artistic_name || (inv as any).creators?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{inv.fee_type || "PayPal"}</TableCell>
                        <TableCell className="text-sm font-medium text-destructive">{fmt(Number(inv.fee_amount) || 0)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.net_amount) || 0)}</TableCell>
                        <TableCell><Badge variant={STATUS_BADGE[inv.status]?.variant || "outline"}>{STATUS_BADGE[inv.status]?.label || inv.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        );

      case "Mail":
        return (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filtered.length} invoices en borrador disponibles para envío masivo</p>
              {bulkSelected.length > 0 && (
                <Button size="sm" onClick={() => bulkSendMutation.mutate(bulkSelected)} disabled={bulkSendMutation.isPending}>
                  <Send className="h-4 w-4 mr-1" />Enviar ({bulkSelected.length})
                </Button>
              )}
            </div>
            {renderInvoiceTable(true)}
          </>
        );

      case "Archivo de PagoMundo":
        return (
          <div className="space-y-5">
            <div className="rounded-lg border border-dashed border-border p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <h3 className="text-sm font-medium text-foreground mb-1">Generador de Archivos de Dispersión</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Genera archivos CSV compatibles con PagoMundo para la dispersión de pagos a creadores. Selecciona los invoices pagados y genera el archivo de dispersión bancaria.
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => {
                const pagados = invoices.filter(i => i.status === "pagada");
                if (pagados.length === 0) {
                  toast({ title: "Sin invoices pagados para dispersión", variant: "destructive" });
                  return;
                }
                exportTableToExcel(pagados.map(inv => ({
                  Numero: inv.invoice_number,
                  Creador: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "",
                  Monto: inv.amount,
                  Fee: inv.fee_amount,
                  Neto: inv.net_amount,
                  Metodo: inv.payment_method,
                  Vencimiento: inv.due_date,
                })), "pagomundo-dispersion");
                toast({ title: "Archivo de dispersión generado" });
              }}>
                <Download className="h-4 w-4 mr-1" />Generar Archivo
              </Button>
            </div>
          </div>
        );

      default: // Invoices
        return viewMode === "list" ? renderInvoiceTable() : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12">Sin resultados.</div>
            ) : filtered.map(inv => {
              const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.borrador;
              const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "—";
              return (
                <div key={inv.id} className="rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-muted-foreground">#{inv.invoice_number}</span>
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">{creatorName}</p>
                  <p className="text-lg font-bold text-foreground mt-1">{fmt(Number(inv.amount) || 0)}</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>Fee: {fmt(Number(inv.fee_amount) || 0)}</span>
                    <span>{inv.due_date ? format(new Date(inv.due_date), "dd/MM/yyyy") : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-3">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inv)}><Eye className="h-3.5 w-3.5" /></Button>
                    {(inv.status === "borrador" || inv.status === "enviada") && (
                      <>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteItem(inv)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setReverseItem(inv)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Facturación</h1>
            <p className="text-sm text-muted-foreground">Gestión de invoices a creadores · {invoices.length} registros</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setShowCreateModal(true)}><Plus className="h-4 w-4 mr-1" />Crear Invoice</Button>
            <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filtered.map(inv => ({ Numero: inv.invoice_number, Creador: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "", Monto: inv.amount, Fee: inv.fee_amount, Neto: inv.net_amount, Estado: inv.status, Metodo: inv.payment_method, Vencimiento: inv.due_date })), "invoices")}>
              <Download className="h-4 w-4 mr-1" />Exportar
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs globales */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
            <>
              <DashboardMetricCard label="Total Invoices" value={String(invoices.length)} icon={FileText} subtitle="Todos" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Pendientes" value={String(totalPendientes)} icon={Clock} subtitle="Enviadas + vencidas" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" valueColor={totalPendientes > 0 ? "text-warning" : undefined} />
              <DashboardMetricCard label="Monto Total" value={fmt(totalMonto)} icon={DollarSign} subtitle="Suma" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Fee Total" value={fmt(totalFee)} icon={DollarSign} subtitle="Fees cobrados" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {FACTURA_TABS.map(t => (
            <Button key={t} variant={facturaTab === t ? "secondary" : "ghost"} size="sm" onClick={() => { setFacturaTab(t); setBulkSelected([]); }}>{t}</Button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar creador o número..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {facturaTab === "Invoices" && (
            <Select value={statusFilter || undefined} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="borrador">Borrador</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="reversada">Reversada</SelectItem>
              </SelectContent>
            </Select>
          )}
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          )}
        </div>

        {renderTabContent()}
      </div>

      <CrearInvoiceModal open={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={data => createInvoice.mutate(data)} isPending={createInvoice.isPending} />
      <ReversarInvoiceModal open={!!reverseItem} onClose={() => setReverseItem(null)} invoice={reverseItem} onSubmit={(id, reason) => reverseMutation.mutate({ id, reason })} isPending={reverseMutation.isPending} />

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Invoice #{viewItem?.invoice_number}</DialogTitle></DialogHeader>
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
