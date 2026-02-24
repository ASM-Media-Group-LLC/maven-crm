import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Download, Trash2, Plus, Search, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";

const REPORT_TABS = ["Ganancias & Comisiones", "Ventas por Creador", "Ventas Generales", "Estado de Cuenta por CC", "Comparativos Mensuales", "Por Método de Pago"] as const;
type ReportTab = typeof REPORT_TABS[number];

const REPORT_TYPES: Record<string, string> = {
  nomina: "Nómina",
  facturacion: "Facturación",
  comisiones: "Comisiones",
  consolidado: "Consolidado",
};

export default function ReportesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reportTab, setReportTab] = useState<ReportTab>("Ganancias & Comisiones");

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

  const hasFilters = search || typeFilter || dateFrom || dateTo;

  const filtered = reports.filter(r => {
    const matchSearch = !search || (REPORT_TYPES[r.report_type] || r.report_type).toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || r.report_type === typeFilter;
    const d = new Date(r.created_at);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
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
          <Button size="sm"><Plus className="h-4 w-4 mr-1" />Generar Reporte</Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {REPORT_TABS.map(t => (
            <Button key={t} variant={reportTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setReportTab(t)}>{t}</Button>
          ))}
        </div>

        {reportTab !== "Ganancias & Comisiones" ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">Próximamente: {reportTab}</p>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar reporte..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {Object.entries(REPORT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
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
                  <TableHead className="text-xs font-medium text-muted-foreground">Área</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Formato</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                )) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">{reports.length === 0 ? "No hay reportes generados." : "Sin resultados."}</TableCell></TableRow>
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
        </>
        )}
      </div>

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
