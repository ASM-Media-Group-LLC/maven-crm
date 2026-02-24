import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Trash2, Plus, Search, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { generateReport } from "./generateReport";
import { format } from "date-fns";

const REPORT_TABS = ["Estado de Cuenta CC", "Reportes Generales"] as const;
type ReportTab = typeof REPORT_TABS[number];

const REPORT_TYPES: Record<string, string> = {
  nomina: "Nómina",
  facturacion: "Facturación",
  comisiones: "Comisiones",
  consolidado: "Consolidado",
  ventas_creador: "Ventas por Creador",
  comparativos: "Comparativos Mensuales",
  metodo_pago: "Por Método de Pago",
};

export default function ReportesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportTab, setReportTab] = useState<ReportTab>("Estado de Cuenta CC");
  const [showGenModal, setShowGenModal] = useState(false);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["financial-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_reports").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Generate modal state
  const [genType, setGenType] = useState("comisiones");
  const [genFormat, setGenFormat] = useState<"csv" | "excel">("excel");
  const [genArea, setGenArea] = useState("");
  const [genDateFrom, setGenDateFrom] = useState<Date | undefined>();
  const [genDateTo, setGenDateTo] = useState<Date | undefined>();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      toast({ title: "Reporte eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      let reportData: any[] = [];
      if (genType === "comisiones") {
        const { data } = await supabase.from("commissions").select("period, base_amount, percentage, estimated_amount, final_amount, status, area, cost_center");
        reportData = data || [];
      } else if (genType === "facturacion") {
        const { data } = await supabase.from("invoices").select("invoice_number, amount, fee_amount, net_amount, status, payment_method, due_date");
        reportData = data || [];
      } else if (genType === "nomina") {
        const { data } = await supabase.from("payroll_periods").select("period_name, total_employees, gross_total, net_total, status, cost_center");
        reportData = data || [];
      } else {
        const { data: inv } = await supabase.from("invoices").select("invoice_number, amount, status");
        const { data: pay } = await supabase.from("payroll_periods").select("period_name, net_total, status");
        reportData = [...(inv || []).map(i => ({ ...i, tipo: "Invoice" })), ...(pay || []).map(p => ({ ...p, tipo: "Nómina" }))];
      }

      generateReport(reportData, genType, genFormat);

      const { data: user } = await supabase.auth.getUser();
      await supabase.from("financial_reports").insert({
        report_type: genType,
        format: genFormat,
        area: genArea || null,
        period_from: genDateFrom ? format(genDateFrom, "yyyy-MM-dd") : null,
        period_to: genDateTo ? format(genDateTo, "yyyy-MM-dd") : null,
        created_by: user.user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      toast({ title: "Reporte generado y descargado" });
      setShowGenModal(false);
    },
    onError: () => toast({ title: "Error al generar reporte", variant: "destructive" }),
  });

  const hasFilters = search || typeFilter || dateFrom || dateTo;

  const filtered = reports.filter(r => {
    const matchSearch = !search || (REPORT_TYPES[r.report_type] || r.report_type).toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || r.report_type === typeFilter;
    const d = new Date(r.created_at);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    // Tab-based filtering
    if (reportTab === "Estado de Cuenta CC") {
      return matchSearch && matchType && matchFrom && matchTo && r.area;
    }
    return matchSearch && matchType && matchFrom && matchTo;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Reportes</h1>
            <p className="text-sm text-muted-foreground">Generación y descarga de reportes financieros · {reports.length} generados</p>
          </div>
          <Button size="sm" onClick={() => setShowGenModal(true)}><Plus className="h-4 w-4 mr-1" />Generar Reporte</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {REPORT_TABS.map(t => (
            <Button key={t} variant={reportTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setReportTab(t)}>{t}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar reporte..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {reportTab === "Reportes Generales" && (
            <Select value={typeFilter || undefined} onValueChange={v => setTypeFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {Object.entries(REPORT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setTypeFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-3.5 w-3.5 mr-1" />Limpiar
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-20rem)]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-card border-b">
                  <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Área / CC</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Formato</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                )) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">{reports.length === 0 ? "No hay reportes. Genera el primero." : "Sin resultados."}</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{REPORT_TYPES[r.report_type] || r.report_type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.period_from && r.period_to ? `${r.period_from} — ${r.period_to}` : "—"}</TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{(r.format || "csv").toUpperCase()}</Badge></TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                      <div className="flex items-center gap-1">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Download className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Descargar</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(r)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Generate Report Modal */}
      <Dialog open={showGenModal} onOpenChange={setShowGenModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generar Reporte</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de Reporte</Label>
              <Select value={genType} onValueChange={setGenType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Periodo</Label>
              <DateRangePicker from={genDateFrom} to={genDateTo} onApply={(f, t) => { setGenDateFrom(f); setGenDateTo(t); }} />
            </div>
            <div>
              <Label>Área / CC</Label>
              <Select value={genArea || undefined} onValueChange={v => setGenArea(v === "__all__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="chatters">Chatters</SelectItem>
                  <SelectItem value="closers">Closers</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={genFormat} onValueChange={v => setGenFormat(v as "csv" | "excel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenModal(false)}>Cancelar</Button>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <Download className="h-4 w-4 mr-1" />Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
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
