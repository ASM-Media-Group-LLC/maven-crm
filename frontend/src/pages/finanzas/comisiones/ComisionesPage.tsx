import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2, Send,
  Search, X, ListIcon, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
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
import StatChip from "@/components/StatChip";
import { PageHeader } from "@/components/ui/page-header";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import NuevaComisionModal from "./NuevaComisionModal";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { estadoComision, tipoComision } from "../estados";

// La etiqueta del estado sale de ../estados (en el idioma de la pantalla); acá solo el color.
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  proyectado: "outline",
  confirmado: "default",
  pagado: "secondary",
};

const TABS = ["En Tiempo Real", "Proyección", "Historial Batch"] as const;
// El valor de la pestaña es interno (filtra por estado); esto es lo que se lee.
const TAB_LABEL: Record<typeof TABS[number], TranslationKey> = {
  "En Tiempo Real": "finanzas.comm.tab.realtime",
  "Proyección": "finanzas.comm.tab.projection",
  "Historial Batch": "finanzas.comm.tab.batchHistory",
};

function fmtMonto(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function ComisionesPage() {
  const f = useFormato();
  const { t } = useLanguage();
  const fmt = (n: number) => fmtMonto(n, f.intl("es-CO"));
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

  const createCommission = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("commissions").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.created") });
    },
    onError: () => toast({ title: t("common.errorCreating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.deleted") });
      setDeleteItem(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>("En Tiempo Real");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "proyectadas" | "confirmadas" | "monto";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [viewItem, setViewItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const totalProyectadas = commissions.filter(c => c.status === "proyectado").length;
  const totalConfirmadas = commissions.filter(c => c.status === "confirmado").length;
  const totalEstimado = commissions.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0);

  const filtered = commissions.filter(c => {
    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "";
    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "";
    const matchSearch = !search || empName.toLowerCase().includes(search.toLowerCase()) || creatorName.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || (c as any).commission_type === typeFilter;
    // Filter by tab
    if (activeTab === "En Tiempo Real") return matchSearch && matchType && c.status === "proyectado";
    if (activeTab === "Proyección") return matchSearch && matchType && (c.status === "proyectado" || c.status === "confirmado");
    if (activeTab === "Historial Batch") return matchSearch && matchType && c.status === "pagado";
    return matchSearch && matchType;
  });

  const renderTable = () => (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-30rem)]">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b">
              <TableHead className="text-xs font-medium text-muted-foreground">{t("common.type")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.creator")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.base")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">%</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.estimated")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.final")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
            )) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">{t("finanzas.comm.emptyView")}</TableCell></TableRow>
            ) : filtered.map(c => {
              const variant = STATUS_VARIANT[c.status] ?? STATUS_VARIANT.proyectado;
              const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
              const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
              return (
                <TableRow key={c.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell><Badge variant="outline" className="text-[10px]">{tipoComision(t, (c as any).commission_type)}</Badge></TableCell>
                  <TableCell className="text-sm">{empName}</TableCell>
                  <TableCell className="text-sm">{creatorName}</TableCell>
                  <TableCell className="text-sm">{fmt(Number(c.base_amount) || 0)}</TableCell>
                  <TableCell className="text-sm">{Number(c.percentage) || 0}%</TableCell>
                  <TableCell className="text-sm">{fmt(Number(c.estimated_amount) || 0)}</TableCell>
                  <TableCell className="text-sm font-medium">{fmt(Number(c.final_amount) || 0)}</TableCell>
                  <TableCell><Badge variant={variant}>{estadoComision(t, STATUS_VARIANT[c.status] ? c.status : "proyectado")}</Badge></TableCell>
                  <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                    <div className="flex items-center gap-1">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("finanzas.common.commissions")}
          subtitle={t("finanzas.comm.subtitle", { n: commissions.length })}
          actions={
            <>
              <Button size="sm" onClick={() => setShowNewModal(true)}><Plus className="h-4 w-4 mr-1" />{t("finanzas.comm.new")}</Button>
              {activeTab === "Historial Batch" && (
                <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filtered.map(c => ({ Periodo: c.period, Base: c.base_amount, Porcentaje: c.percentage, Estimada: c.estimated_amount, Final: c.final_amount, Estado: c.status })), "comisiones-batch")}>
                  <Send className="h-4 w-4 mr-1" />{t("finanzas.comm.exportQb")}
                </Button>
              )}
            </>
          }
        />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label={t("finanzas.comm.kpi.total")} value={String(commissions.length)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.comm.kpi.totalHint")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("finanzas.comm.kpi.projected")} value={String(totalProyectadas)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={t("common.pendingPl")} onClick={() => setKpiPopup("proyectadas")} />
              <StatChip label={t("finanzas.comm.kpi.confirmed")} value={String(totalConfirmadas)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={t("finanzas.comm.kpi.confirmedHint")} onClick={() => setKpiPopup("confirmadas")} />
              <StatChip label={t("finanzas.comm.kpi.estimated")} value={fmt(totalEstimado)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("finanzas.comm.kpi.estimatedHint")} onClick={() => setKpiPopup("monto")} />
            </>
          )}
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map(pestana => (
            <Button key={pestana} variant={activeTab === pestana ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(pestana)}>{t(TAB_LABEL[pestana])}</Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("finanzas.common.searchEmployeeOrCreator")} className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter || undefined} onValueChange={v => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("common.type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              <SelectItem value="laboral">{t("finanzas.commType.labor")}</SelectItem>
              <SelectItem value="comercial">{t("finanzas.commType.commercial")}</SelectItem>
            </SelectContent>
          </Select>
          {(search || typeFilter) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setTypeFilter(""); }}>
              <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
            </Button>
          )}
        </div>

        {renderTable()}
      </div>

      <NuevaComisionModal open={showNewModal} onClose={() => setShowNewModal(false)} onSubmit={data => createCommission.mutate(data)} isPending={createCommission.isPending} />

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("finanzas.comm.detail")}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <p><strong>{t("common.type")}:</strong> {tipoComision(t, (viewItem as any).commission_type)}</p>
              <p><strong>{t("common.method")}:</strong> {(viewItem as any).calculation_method || "fixed_percentage"}</p>
              <p><strong>{t("finanzas.common.employee")}:</strong> {viewItem.employees ? `${(viewItem as any).employees.first_name} ${(viewItem as any).employees.last_name}` : "—"}</p>
              <p><strong>{t("finanzas.common.creator")}:</strong> {(viewItem as any).creators?.artistic_name || (viewItem as any).creators?.name || "—"}</p>
              <p><strong>{t("finanzas.common.period")}:</strong> {viewItem.period}</p>
              <p><strong>{t("finanzas.common.base")}:</strong> {fmt(Number(viewItem.base_amount) || 0)}</p>
              <p><strong>{t("finanzas.common.percentage")}:</strong> {Number(viewItem.percentage) || 0}%</p>
              <p><strong>{t("finanzas.common.estimated")}:</strong> {fmt(Number(viewItem.estimated_amount) || 0)}</p>
              <p><strong>{t("finanzas.common.final")}:</strong> {fmt(Number(viewItem.final_amount) || 0)}</p>
              <p><strong>{t("common.status")}:</strong> {estadoComision(t, viewItem.status)}</p>
              {viewItem.notes && <p><strong>{t("finanzas.common.notes")}:</strong> {viewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finanzas.comm.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("finanzas.kpi.empty")}
        title={(() => {
          switch (kpiPopup) {
            case "total": return t("finanzas.comm.popup.total", { n: commissions.length });
            case "proyectadas": return t("finanzas.comm.popup.projected", { n: totalProyectadas });
            case "confirmadas": return t("finanzas.comm.popup.confirmed", { n: totalConfirmadas });
            case "monto": return t("finanzas.comm.popup.estimated", { amount: fmt(totalEstimado) });
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = commissions;
          if (kpiPopup === "proyectadas") list = commissions.filter((c: any) => c.status === "proyectado");
          else if (kpiPopup === "confirmadas") list = commissions.filter((c: any) => c.status === "confirmado");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "pagado" ? "success" : status === "confirmado" ? "default" : "warning";
          return list.slice(0, 100).map((c: any): KpiRow => ({
            primary: c.employees ? `${c.employees.first_name ?? ""} ${c.employees.last_name ?? ""}`.trim() : t("finanzas.common.noName"),
            secondary: c.creators?.artistic_name ?? c.creators?.name ?? c.area ?? undefined,
            right: fmt(Number(c.estimated_amount) || 0),
            rightTone: tone(c.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
