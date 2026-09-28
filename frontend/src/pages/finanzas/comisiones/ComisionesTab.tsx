import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Download, Eye, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { format } from "date-fns";
import NuevaComisionModal from "./NuevaComisionModal";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { estadoComision, metodoDePago } from "../estados";

function fmtUsd(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

// La etiqueta del estado sale de ../estados (en el idioma de la pantalla); acá solo el color.
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pendiente: "outline",
  pagado: "default",
  en_proceso: "secondary",
};

interface Props {
  renderFilterBar: (extraButtons?: React.ReactNode, showStatusFilter?: boolean) => React.ReactNode;
  currentFilters: { search: string; statusFilter: string; dateFrom?: Date; dateTo?: Date };
  setDeleteItem: (item: any) => void;
}

export default function ComisionesTab({ renderFilterBar, currentFilters }: Props) {
  const f = useFormato();
  const { t } = useLanguage();
  const fmt = (n: number) => fmtUsd(n, f.intl("es-CO"));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<any>(null);
  const [editingBlueId, setEditingBlueId] = useState<string | null>(null);
  const [editBlueValue, setEditBlueValue] = useState("");
  const [editingCommId, setEditingCommId] = useState<string | null>(null);
  const [editCommValue, setEditCommValue] = useState("");

  const { data: commissions = [], isLoading } = useQuery({
    queryKey: ["commissions"],
    queryFn: async () => {
      const { data: comms, error } = await supabase.from("commissions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const creatorIds = [...new Set((comms ?? []).map(c => c.creator_id).filter(Boolean))];
      if (creatorIds.length === 0) return (comms ?? []).map(c => ({ ...c, _creator: null }));
      const { data: creators } = await supabase.from("creators").select("id, name, artistic_name").in("id", creatorIds as string[]);
      const cMap = new Map((creators ?? []).map(c => [c.id, c]));
      return (comms ?? []).map(c => ({ ...c, _creator: c.creator_id ? cMap.get(c.creator_id) : null }));
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("commissions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, () => {
        queryClient.invalidateQueries({ queryKey: ["commissions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("commissions").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.created") });
      setShowCreate(false);
    },
    onError: () => toast({ title: t("finanzas.comm.toast.createError"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.deleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const updateCommMutation = useMutation({
    mutationFn: async ({ id, newPercentage, baseAmount, config }: { id: string; newPercentage: number; baseAmount: number; config: Record<string, any> }) => {
      const blueAmount = (config.blue_package && config.blue_amount > 0) ? config.blue_amount : 0;
      const newFinal = (baseAmount * newPercentage / 100) + blueAmount;
      const newConfig = { ...config, percentage: newPercentage };
      const { error } = await supabase.from("commissions").update({
        calculation_config: newConfig as any,
        final_amount: newFinal,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.updated") });
      setEditingCommId(null);
    },
    onError: () => toast({ title: t("finanzas.comm.toast.updateError"), variant: "destructive" }),
  });

  const updateBlueMutation = useMutation({
    mutationFn: async ({ id, newBlueAmount, baseAmount, config }: { id: string; newBlueAmount: number; baseAmount: number; config: Record<string, any> }) => {
      const percentage = config.percentage || 0;
      const newFinal = (baseAmount * percentage / 100) + newBlueAmount;
      const newConfig = { ...config, blue_amount: newBlueAmount };
      const { error } = await supabase.from("commissions").update({
        calculation_config: newConfig as any,
        final_amount: newFinal,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      toast({ title: t("finanzas.comm.toast.blueUpdated") });
      setEditingBlueId(null);
    },
    onError: () => toast({ title: t("finanzas.comm.toast.blueUpdateError"), variant: "destructive" }),
  });

  const filtered = commissions.filter(c => {
    const name = c._creator?.artistic_name || c._creator?.name || "";
    const matchSearch = !currentFilters.search || name.toLowerCase().includes(currentFilters.search.toLowerCase()) || (c.period || "").toLowerCase().includes(currentFilters.search.toLowerCase());
    const matchStatus = !currentFilters.statusFilter || c.status === currentFilters.statusFilter;
    const d = new Date(c.created_at);
    const matchFrom = !currentFilters.dateFrom || d >= currentFilters.dateFrom;
    const matchTo = !currentFilters.dateTo || d <= currentFilters.dateTo;
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  return (
    <>
      {renderFilterBar(
        <>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" />{t("finanzas.comm.create")}</Button>
          <Button size="sm" variant="outline" onClick={() => exportTableToExcel(filtered.map(c => {
            const cfg = (c.calculation_config || {}) as Record<string, any>;
            return {
              Creador: c._creator?.artistic_name || c._creator?.name || "",
              Periodo: c.period,
              Ganancia: c.base_amount,
              Comision: cfg.percentage ? `${cfg.percentage}%` : "—",
              Blue: cfg.blue_package && cfg.blue_amount > 0 ? cfg.blue_amount : 0,
              "Comision total": c.final_amount,
            };
          }), "comisiones")}>
            <Download className="h-4 w-4 mr-1" />{t("finanzas.common.export")}
          </Button>
        </>
      )}
      <p className="text-sm text-muted-foreground">{t("finanzas.comm.count", { n: filtered.length })}</p>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-30rem)]">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b">
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.creator")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.period")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.earnings")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.commission")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">Blue</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.totalToPay")}</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">{t("finanzas.comm.empty")}</TableCell></TableRow>
              ) : filtered.map(c => {
                const creatorName = c._creator?.artistic_name || c._creator?.name || "—";
                const initials = creatorName.slice(0, 2).toUpperCase();
                return (
                  <TableRow key={c.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-semibold text-primary">{initials}</span>
                        </div>
                        <span className="text-sm">{creatorName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.period || "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{fmt(Number(c.base_amount) || 0)}</TableCell>
                    <TableCell className="text-sm text-foreground font-medium">{(() => {
                      const cfg = (c.calculation_config || {}) as Record<string, any>;
                      if (editingCommId === c.id) {
                        return (
                          <Input
                            type="number"
                            className="h-7 w-24 text-sm"
                            value={editCommValue}
                            onChange={(e) => setEditCommValue(e.target.value)}
                            onBlur={() => {
                              const val = parseFloat(editCommValue) || 0;
                              updateCommMutation.mutate({ id: c.id, newPercentage: val, baseAmount: Number(c.base_amount) || 0, config: cfg });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { const val = parseFloat(editCommValue) || 0; updateCommMutation.mutate({ id: c.id, newPercentage: val, baseAmount: Number(c.base_amount) || 0, config: cfg }); }
                              if (e.key === "Escape") setEditingCommId(null);
                            }}
                            autoFocus
                          />
                        );
                      }
                      return (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => { setEditingCommId(c.id); setEditCommValue(String(cfg.percentage || 0)); }}
                        >
                          {cfg.percentage ? `${cfg.percentage}%` : "—"}
                        </span>
                      );
                    })()}</TableCell>
                    <TableCell className="text-sm font-medium">{(() => {
                      const cfg = (c.calculation_config || {}) as Record<string, any>;
                      if (editingBlueId === c.id) {
                        return (
                          <Input
                            type="number"
                            className="h-7 w-24 text-sm"
                            value={editBlueValue}
                            onChange={(e) => setEditBlueValue(e.target.value)}
                            onBlur={() => {
                              const val = parseFloat(editBlueValue) || 0;
                              updateBlueMutation.mutate({ id: c.id, newBlueAmount: val, baseAmount: Number(c.base_amount) || 0, config: cfg });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { const val = parseFloat(editBlueValue) || 0; updateBlueMutation.mutate({ id: c.id, newBlueAmount: val, baseAmount: Number(c.base_amount) || 0, config: cfg }); }
                              if (e.key === "Escape") setEditingBlueId(null);
                            }}
                            autoFocus
                          />
                        );
                      }
                      const blueVal = cfg.blue_package && cfg.blue_amount > 0 ? cfg.blue_amount : 0;
                      return (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => { setEditingBlueId(c.id); setEditBlueValue(String(cfg.blue_amount || 0)); }}
                        >
                          {blueVal > 0 ? fmt(blueVal) : "—"}
                        </span>
                      );
                    })()}</TableCell>
                    <TableCell className="text-sm font-medium text-primary">{fmt(Number(c.final_amount) || 0)}</TableCell>
                    <TableCell className="sticky right-0 bg-card group-hover:bg-muted">
                      <div className="flex items-center gap-1">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <NuevaComisionModal open={showCreate} onClose={() => setShowCreate(false)} onSubmit={data => createMutation.mutate(data)} isPending={createMutation.isPending} />

      {/* View detail dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("finanzas.comm.detailOf")}</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const config = (viewItem.calculation_config || {}) as Record<string, any>;
            return (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.creator")}</span><span className="font-medium">{viewItem._creator?.artistic_name || viewItem._creator?.name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.period")}</span><span>{viewItem.period || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.earnings")}</span><span className="font-medium">{fmt(Number(viewItem.base_amount) || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.commission")}</span><span className="text-destructive font-medium">{config.percentage ? `${config.percentage}%` : "—"}</span></div>
              {config.blue_package && config.blue_amount > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Blue</span><span className="font-medium">{fmt(config.blue_amount)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.totalToPay")}</span><span className="text-primary font-medium">{fmt(Number(viewItem.final_amount) || 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.status")}</span><Badge variant={STATUS_VARIANT[viewItem.status] || "outline"}>{estadoComision(t, viewItem.status)}</Badge></div>
              {viewItem.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.common.paymentMethod")}</span><span>{metodoDePago(t, viewItem.payment_method)}</span></div>}
              {viewItem.payment_date && <div className="flex justify-between"><span className="text-muted-foreground">{t("finanzas.comm.paymentDate")}</span><span>{format(new Date(viewItem.payment_date + "T12:00:00"), "dd/MM/yyyy")}</span></div>}
              {viewItem.notes && <div><span className="text-muted-foreground">{t("finanzas.common.notes")}:</span><p className="mt-1 text-foreground">{viewItem.notes}</p></div>}
            </div>);
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finanzas.comm.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("finanzas.comm.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
