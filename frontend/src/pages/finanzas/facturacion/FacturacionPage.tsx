import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2, Ban, RotateCcw, Send, Download, Mail,
  Search, X, LayoutGrid, List,
} from "lucide-react";
// jspdf + html2canvas loaded on demand inside handleDownloadPdf —
// these two libraries are big and only needed when the user clicks
// "download PDF" on a specific invoice.
import { usePaymentMethods } from "@/hooks/useFinancialConfig";
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
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
import CrearInvoiceModal from "./CrearInvoiceModal";
import ReversarInvoiceModal from "./ReversarInvoiceModal";
import InvoiceA4Preview from "./InvoiceA4Preview";
import PaymentNoteA4Preview from "./PaymentNoteA4Preview";
import ComisionesTab from "../comisiones/ComisionesTab";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "warning"; label: string }> = {
  borrador: { variant: "secondary", label: "Borrador" },
  enviada: { variant: "outline", label: "Enviada" },
  pagada: { variant: "default", label: "Pagada" },
  parcial: { variant: "outline", label: "Parcial" },
  vencida: { variant: "destructive", label: "Vencida" },
  reversada: { variant: "destructive", label: "Reversada" },
  cancelada: { variant: "destructive", label: "Cancelada" },
};

const getDisplayStatus = (inv: any): string => {
  if (inv.status === "enviada" && inv.due_date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(inv.due_date + "T12:00:00");
    if (due < today) return "vencida";
  }
  return inv.status;
};

const FACTURA_TABS = ["Invoices", "Notas de Pago", "Reversos", "Comisiones", "Mail", "Archivo de PagoMundo"] as const;
type FacturaTab = typeof FACTURA_TABS[number];

function fmt(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function FacturacionPage() {
  const navigate = useNavigate();
  const f = useFormato();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { methods: configuredPaymentMethods } = usePaymentMethods();
  const [crearOpen, setCrearOpen] = useState(false);
  type KpiKey = "total" | "pendientes" | "monto" | "fee";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      // PII: vista enmascarada bajo alias `creators` (phone real solo admin).
      const { data, error } = await supabase.from("invoices").select("*, creators:v_creators(id, name, artistic_name, phone, creator_business(billing_address)), invoice_templates(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: paymentNotes = [], isLoading: isLoadingNotes } = useQuery({
    queryKey: ["payment_notes"],
    queryFn: async () => {
      const { data: payments, error: pErr } = await supabase.from("creator_payments").select("*").order("created_at", { ascending: false });
      if (pErr) throw pErr;
      const creatorIds = [...new Set((payments ?? []).map(p => p.creator_id))];
      if (creatorIds.length === 0) return [];
      const { data: creators } = await supabase.from("creators").select("id, name, artistic_name").in("id", creatorIds);
      const cMap = new Map((creators ?? []).map(c => [c.id, c]));
      return (payments ?? []).map(p => ({ ...p, _creator: cMap.get(p.creator_id) }));
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch1 = supabase
      .channel("invoices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => {
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
      })
      .subscribe();
    const ch2 = supabase
      .channel("payment-notes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "creator_payments" }, () => {
        queryClient.invalidateQueries({ queryKey: ["payment_notes"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [queryClient]);

  const deletePaymentNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_notes"] });
      toast({ title: "Nota de pago eliminada" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
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

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").update({ status: "cancelada" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice cancelado" });
      setCancelItem(null);
    },
    onError: () => toast({ title: "Error al cancelar", variant: "destructive" }),
  });

  type TabFilters = { search: string; statusFilter: string; dateFrom?: Date; dateTo?: Date; viewMode: "list" | "grid" };
  const defaultFilters: TabFilters = { search: "", statusFilter: "", dateFrom: undefined, dateTo: undefined, viewMode: "list" };

  const [filtersByTab, setFiltersByTab] = useState<Record<FacturaTab, TabFilters>>({
    "Invoices": { ...defaultFilters },
    "Notas de Pago": { ...defaultFilters },
    "Reversos": { ...defaultFilters },
    "Comisiones": { ...defaultFilters },
    "Mail": { ...defaultFilters },
    "Archivo de PagoMundo": { ...defaultFilters },
  });
  const [facturaTab, setFacturaTab] = useState<FacturaTab>("Invoices");
  const [viewItem, setViewItem] = useState<any>(null);
  const [viewNoteItem, setViewNoteItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [cancelItem, setCancelItem] = useState<any>(null);
  const [reverseItem, setReverseItem] = useState<any>(null);
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);

  const currentFilters = filtersByTab[facturaTab];
  const updateFilter = (patch: Partial<TabFilters>) =>
    setFiltersByTab(prev => ({ ...prev, [facturaTab]: { ...prev[facturaTab], ...patch } }));

  const totalPendientes = invoices.filter(i => i.status === "enviada" || i.status === "vencida").length;
  const totalMonto = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalFee = invoices.reduce((s, i) => s + (Number(i.fee_amount) || 0), 0);
  const hasFilters = currentFilters.search || currentFilters.statusFilter || currentFilters.dateFrom || currentFilters.dateTo;

  const getTabFiltered = () => {
    let base = invoices;
    if (facturaTab === "Notas de Pago") base = invoices.filter(i => i.status === "pagada" || i.status === "parcial");
    else if (facturaTab === "Mail") base = invoices.filter(i => i.status === "borrador");

    return base.filter(inv => {
      const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "";
      const matchSearch = !currentFilters.search || creatorName.toLowerCase().includes(currentFilters.search.toLowerCase()) || inv.invoice_number.includes(currentFilters.search);
      const matchStatus = !currentFilters.statusFilter || inv.status === currentFilters.statusFilter;
      const d = new Date(inv.created_at);
      const matchFrom = !currentFilters.dateFrom || d >= currentFilters.dateFrom;
      const matchTo = !currentFilters.dateTo || d <= currentFilters.dateTo;
      return matchSearch && matchStatus && matchFrom && matchTo;
    });
  };

  const filtered = getTabFiltered();

  const toggleBulk = (id: string) => setBulkSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleDownloadPdf = useCallback(async (inv: any) => {
    // Lazy-load all the heavy export deps (jspdf + html2canvas + the
    // off-screen invoice preview component + react-dom/client) so the
    // page itself loads light.
    const [
      { createRoot },
      { default: InvoiceA4PreviewComp },
      { default: jsPDF },
      { default: html2canvas },
    ] = await Promise.all([
      import("react-dom/client"),
      import("./InvoiceA4Preview"),
      import("jspdf"),
      import("html2canvas"),
    ]);

    // Create a temporary wrapper
    const wrapper = document.createElement("div");
    wrapper.style.position = "fixed";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "0";
    document.body.appendChild(wrapper);

    const root = createRoot(wrapper);
    root.render(<InvoiceA4PreviewComp invoice={inv} template={inv?.invoice_templates} />);

    // Wait for render
    await new Promise(r => setTimeout(r, 500));

    const a4El = wrapper.querySelector("div > div") as HTMLElement;
    if (!a4El) { root.unmount(); wrapper.remove(); return; }

    const canvas = await html2canvas(a4El, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfW = 210;
    const pdfH = 297;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
    pdf.save(`Invoice-${inv.invoice_number || "draft"}.pdf`);

    root.unmount();
    wrapper.remove();
  }, []);

  const renderInvoiceTable = (showBulkCheckbox = false) => (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-30rem)]">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b">
              {showBulkCheckbox && <TableHead className="w-10" />}
              <TableHead className="text-xs font-medium text-muted-foreground">Número</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Vencimiento</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: showBulkCheckbox ? 7 : 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={showBulkCheckbox ? 7 : 6} className="text-center text-muted-foreground py-12">Sin resultados.</TableCell></TableRow>
            ) : filtered.map(inv => {
              const displayStatus = getDisplayStatus(inv);
              const badge = STATUS_BADGE[displayStatus] ?? STATUS_BADGE.borrador;
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
                  <TableCell className="text-sm whitespace-nowrap">
                    {(inv as any).period_start && (inv as any).period_end
                      ? `${format(new Date((inv as any).period_start + "T12:00:00"), "dd/MM/yyyy")} — ${format(new Date((inv as any).period_end + "T12:00:00"), "dd/MM/yyyy")}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{inv.due_date ? format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                  <TableCell><Badge variant={badge.variant as any}>{badge.label}</Badge></TableCell>
                  <TableCell className="sticky right-0 bg-card group-hover:bg-muted">
                    <div className="flex items-center gap-1">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inv)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadPdf(inv)}><Download className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Descargar PDF</TooltipContent></Tooltip>
                      {canEdit && (
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setCancelItem(inv)}><Ban className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Cancelar</TooltipContent></Tooltip>
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

  const renderFilterBar = (extraButtons?: React.ReactNode, showStatusFilter = false) => (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar creador o número..." className="pl-8" value={currentFilters.search} onChange={e => updateFilter({ search: e.target.value })} />
      </div>
      {showStatusFilter && (
        <Select value={currentFilters.statusFilter || undefined} onValueChange={v => updateFilter({ statusFilter: v === "__all__" ? "" : v })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="pagada">Pagada</SelectItem>
            <SelectItem value="parcial">Parcial</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
            <SelectItem value="reversada">Reversada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      )}
      <DateRangePicker from={currentFilters.dateFrom} to={currentFilters.dateTo} onApply={(f, t) => updateFilter({ dateFrom: f, dateTo: t })} />
      <div className="inline-flex items-center rounded-md border border-border">
        <Button variant={currentFilters.viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => updateFilter({ viewMode: "list" })}><List className="h-4 w-4" /></Button>
        <Button variant={currentFilters.viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => updateFilter({ viewMode: "grid" })}><LayoutGrid className="h-4 w-4" /></Button>
      </div>
      {extraButtons}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0" onClick={() => setFiltersByTab(prev => ({ ...prev, [facturaTab]: { ...defaultFilters } }))}>
          <X className="h-3.5 w-3.5 mr-1" />Limpiar
        </Button>
      )}
    </div>
  );

  const renderInvoiceGrid = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {filtered.length === 0 ? (
        <div className="col-span-full text-center text-muted-foreground py-12">Sin resultados.</div>
      ) : filtered.map(inv => {
        const displayStatus = getDisplayStatus(inv);
        const badge = STATUS_BADGE[displayStatus] ?? STATUS_BADGE.borrador;
        const creatorName = (inv as any).creators?.artistic_name || (inv as any).creators?.name || "—";
        return (
          <div key={inv.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground">#{inv.invoice_number}</span>
              <Badge variant={badge.variant as any}>{badge.label}</Badge>
            </div>
            <p className="text-sm font-medium truncate">{creatorName}</p>
            <div className="mt-2 text-xs text-muted-foreground">
              {(inv as any).period_start && (inv as any).period_end
                ? `${format(new Date((inv as any).period_start + "T12:00:00"), "dd/MM/yyyy")} — ${format(new Date((inv as any).period_end + "T12:00:00"), "dd/MM/yyyy")}`
                : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Vence: {inv.due_date ? format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}
            </div>
            <div className="flex items-center gap-1 mt-3">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inv)}><Eye className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownloadPdf(inv)}><Download className="h-3.5 w-3.5" /></Button>
              {(inv.status === "borrador" || inv.status === "enviada") && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setCancelItem(inv)}><Ban className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setReverseItem(inv)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderTabContent = () => {
    switch (facturaTab) {
      case "Notas de Pago": {
        const NOTE_STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
          pending: { variant: "outline", label: "Pendiente" },
          paid: { variant: "default", label: "Pagada" },
          cancelled: { variant: "destructive", label: "Cancelada" },
        };
        const filteredNotes = paymentNotes.filter(n => {
          const name = n._creator?.artistic_name || n._creator?.name || "";
          const matchSearch = !currentFilters.search || name.toLowerCase().includes(currentFilters.search.toLowerCase());
          const matchStatus = !currentFilters.statusFilter || n.status === currentFilters.statusFilter;
          const d = new Date(n.created_at!);
          const matchFrom = !currentFilters.dateFrom || d >= currentFilters.dateFrom;
          const matchTo = !currentFilters.dateTo || d <= currentFilters.dateTo;
          return matchSearch && matchStatus && matchFrom && matchTo;
        });
        return (
          <>
            {renderFilterBar(
              <>
                <Button size="sm" onClick={() => navigate("/finanzas/facturacion/notasdepago/nueva")}><Plus className="h-4 w-4 mr-1" />Crear Nota</Button>
                <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filteredNotes.map(n => ({ Creador: n._creator?.artistic_name || n._creator?.name || "", Monto: n.amount, Tipo: n.payment_type, Metodo: n.payment_method, Estado: n.status, Vencimiento: n.due_date, Creado: n.created_at })), "notas-pago")}>
                  <Download className="h-4 w-4 mr-1" />Exportar
                </Button>
              </>
            )}
            <p className="text-sm text-muted-foreground">{filteredNotes.length} notas de pago</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-30rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Método</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Vencimiento</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Creado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingNotes ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    )) : filteredNotes.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Sin notas de pago.</TableCell></TableRow>
                    ) : filteredNotes.map(n => {
                      const creatorName = n._creator?.artistic_name || n._creator?.name || "—";
                      const initials = creatorName.slice(0, 2).toUpperCase();
                      const badge = NOTE_STATUS_BADGE[n.status || "pending"] ?? NOTE_STATUS_BADGE.pending;
                      return (
                        <TableRow key={n.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-[10px] font-semibold text-primary">{initials}</span>
                              </div>
                              <span className="text-sm">{creatorName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{fmt(Number(n.amount) || 0, f)}</TableCell>
                          <TableCell className="text-sm">{n.payment_type || "—"}</TableCell>
                          <TableCell className="text-sm">{n.payment_method || "—"}</TableCell>
                          <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{n.due_date ? format(new Date(n.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{n.created_at ? format(new Date(n.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewNoteItem(n)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(n)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        );
      }

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
                        <TableCell className="text-sm font-medium">{fmt(Number(inv.amount) || 0, f)}</TableCell>
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

      case "Comisiones":
        return <ComisionesTab
          renderFilterBar={renderFilterBar}
          currentFilters={currentFilters}
          setDeleteItem={setDeleteItem}
        />;

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
        return (
          <>
            {renderFilterBar(
              <>
                <Button size="sm" onClick={() => setCrearOpen(true)}><Plus className="h-4 w-4 mr-1" />Crear Invoice</Button>
                <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filtered.map(inv => ({ Numero: inv.invoice_number, Creador: (inv as any).creators?.artistic_name || (inv as any).creators?.name || "", Periodo: ((inv as any).period_start && (inv as any).period_end) ? `${(inv as any).period_start} — ${(inv as any).period_end}` : "", Vencimiento: inv.due_date })), "invoices")}>
                  <Download className="h-4 w-4 mr-1" />Exportar
                </Button>
              </>,
              true
            )}
            {currentFilters.viewMode === "list" ? renderInvoiceTable() : renderInvoiceGrid()}
          </>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title="Facturación"
          subtitle={<>Gestión de invoices a creadores · {invoices.length} registros</>}
        />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs globales — clickeables, abren modal con detalle */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label="Total Invoices" value={String(invoices.length)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-primary" hint="Todos" onClick={() => setKpiPopup("total")} />
              <StatChip label="Pendientes" value={String(totalPendientes)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint="Enviadas + vencidas" onClick={() => setKpiPopup("pendientes")} />
              <StatChip label="Monto Total" value={fmt(totalMonto, f)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-success" hint="Suma" onClick={() => setKpiPopup("monto")} />
              <StatChip label="Fee Total" value={fmt(totalFee, f)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-destructive" hint="Fees cobrados" onClick={() => setKpiPopup("fee")} />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
          {FACTURA_TABS.map(t => (
            <Button key={t} variant={facturaTab === t ? "secondary" : "ghost"} size="sm" onClick={() => { setFacturaTab(t); setBulkSelected([]); }}>{t}</Button>
          ))}
        </div>

        {renderTabContent()}
      </div>

      {/* CrearInvoiceModal removed — now uses dedicated page */}
      <ReversarInvoiceModal open={!!reverseItem} onClose={() => setReverseItem(null)} invoice={reverseItem} onSubmit={(id, reason) => reverseMutation.mutate({ id, reason })} isPending={reverseMutation.isPending} />

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent
          className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden"
        >
          {viewItem && <InvoiceA4Preview invoice={viewItem as any} template={(viewItem as any)?.invoice_templates} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewNoteItem} onOpenChange={() => setViewNoteItem(null)}>
        <DialogContent
          className="max-w-fit bg-transparent border-none shadow-none p-0 [&>button:last-child]:hidden"
        >
          {viewNoteItem && <PaymentNoteA4Preview note={viewNoteItem} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar nota de pago?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará esta nota de pago permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => { if (!deleteItem) return; deletePaymentNoteMutation.mutate(deleteItem.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelItem} onOpenChange={() => setCancelItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar invoice #{cancelItem?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>El invoice se marcará como cancelado. Esta acción no elimina el registro.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (!cancelItem) return; cancelMutation.mutate(cancelItem.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirmar Cancelación</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CrearInvoiceModal
        open={crearOpen}
        onClose={() => setCrearOpen(false)}
        onSubmit={(data) => { createInvoice.mutate(data); setCrearOpen(false); }}
        isPending={createInvoice.isPending}
      />

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Invoices — ${invoices.length}`;
            case "pendientes": return `Invoices Pendientes — ${totalPendientes}`;
            case "monto": return `Monto Total — ${fmt(totalMonto, f)}`;
            case "fee": return `Fees Cobrados — ${fmt(totalFee, f)}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "total": return "Listado completo";
            case "pendientes": return "Status enviada o vencida";
            case "monto": return "Sumatoria del campo amount";
            case "fee": return "Sumatoria del campo fee_amount";
            default: return undefined;
          }
        })()}
        rows={(() => {
          let list = invoices;
          if (kpiPopup === "pendientes") list = invoices.filter(i => i.status === "enviada" || i.status === "vencida");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "pagada" ? "success" : status === "vencida" ? "destructive" : status === "enviada" ? "warning" : "default";
          return list.map((i): KpiRow => ({
            primary: (i as any).recipient_name || `Invoice ${(i as any).invoice_number ?? i.id.slice(0, 8)}`,
            secondary: `${i.status} · ${i.created_at ? format(new Date(i.created_at), "dd MMM yyyy") : "—"}`,
            right: kpiPopup === "fee" ? fmt(Number((i as any).fee_amount) || 0, f) : fmt(Number(i.amount) || 0, f),
            rightTone: tone(i.status as string),
          }));
        })()}
      />
    </div>
  );
}
