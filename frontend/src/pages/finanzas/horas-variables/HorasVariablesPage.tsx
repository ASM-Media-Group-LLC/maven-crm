import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, DollarSign, TrendingUp, Wallet, Plus, Eye, Trash2, Search, X, Download,
  CheckCircle, Banknote, ArrowRightLeft, LayoutGrid, List,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
import { usePayrollParams } from "@/hooks/useFinancialConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import NuevaComisionModal from "../comisiones/NuevaComisionModal";
import { exportTableToExcel } from "@/pages/finanzas/reportes/generateReport";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { crudoEnEspanol, estadoComision, tipoComision, tipoComisionGuardado } from "../estados";

function fmtMonto(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

const TABS = ["Horas Extra", "Banco de Horas", "Comisiones"] as const;
type HVTab = typeof TABS[number];
// El valor de la pestaña es interno; esto es lo que se lee.
const TAB_LABEL: Record<HVTab, TranslationKey> = {
  "Horas Extra": "finanzas.common.overtime",
  "Banco de Horas": "finanzas.common.hourBank",
  "Comisiones": "finanzas.common.commissions",
};

// La etiqueta del estado sale de ../estados (en el idioma de la pantalla); acá solo el color.
const COMISION_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  proyectado: "outline",
  confirmado: "default",
  pagado: "secondary",
};

// El estado del banco de horas es interno (se calcula, no se guarda) y sirve de
// valor del filtro; esto es lo que se lee.
const BANCO_LABEL: Record<string, TranslationKey> = {
  Acumuladas: "finanzas.hv.bank.accrued",
  Pagadas: "finanzas.hv.bank.paid",
  Compensadas: "finanzas.hv.bank.compensated",
};

export default function HorasVariablesPage() {
  const f = useFormato();
  const { t, language } = useLanguage();
  const fmt = (n: number) => fmtMonto(n, f.intl("es-CO"));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<HVTab>("Horas Extra");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const { params: payrollParams } = usePayrollParams();
  const hourValue = payrollParams?.hour_bank?.hour_value ?? 15;

  type KpiKey = "horasExtra" | "banco" | "comisiones" | "empleados";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  // Banco de Horas modals
  const [payItem, setPayItem] = useState<any>(null);
  const [compensateItem, setCompensateItem] = useState<any>(null);
  const [compHours, setCompHours] = useState("");
  const [compReason, setCompReason] = useState("");

  // Horas Extra filters
  const [horasSearch, setHorasSearch] = useState("");
  const [horasPeriodFilter, setHorasPeriodFilter] = useState("");

  // Banco de Horas filters
  const [bancoSearch, setBancoSearch] = useState("");
  const [bancoStatusFilter, setBancoStatusFilter] = useState("");

  // Comisiones state
  const [showComisionModal, setShowComisionModal] = useState(false);
  const [comisionSearch, setComisionSearch] = useState("");
  const [comisionTypeFilter, setComisionTypeFilter] = useState("");
  const [comisionViewItem, setComisionViewItem] = useState<any>(null);
  const [comisionDeleteItem, setComisionDeleteItem] = useState<any>(null);

  const { data: horasDetails = [], isLoading: loadingHoras } = useQuery({
    queryKey: ["hv-payroll-details"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_details")
        .select("*, employees(first_name, last_name, employee_code), payroll_periods(period_name, status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["hv-commissions"],
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
      queryClient.invalidateQueries({ queryKey: ["hv-commissions"] });
      toast({ title: t("finanzas.comm.toast.created") });
    },
    onError: () => toast({ title: t("common.errorCreating"), variant: "destructive" }),
  });

  const deleteCommission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-commissions"] });
      toast({ title: t("finanzas.comm.toast.deleted") });
      setComisionDeleteItem(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  // Pay hours mutation
  const payHoursMutation = useMutation({
    mutationFn: async (detail: any) => {
      const amount = Number(detail.hour_bank_amount) || (Number(detail.hour_bank_hours) * hourValue);
      const { error } = await supabase.from("payroll_details").update({
        hour_bank_hours: 0,
        hour_bank_amount: 0,
        overtime_amount: (Number(detail.overtime_amount) || 0) + amount,
      }).eq("id", detail.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-payroll-details"] });
      toast({ title: t("finanzas.hv.toast.paid") });
      setPayItem(null);
    },
    onError: () => toast({ title: t("finanzas.hv.toast.payError"), variant: "destructive" }),
  });

  // Compensate hours mutation
  const compensateHoursMutation = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const detail = horasDetails.find(d => d.id === id);
      if (!detail) throw new Error("Not found");
      const newHours = Math.max(0, (Number(detail.hour_bank_hours) || 0) - hours);
      const ratio = Number(detail.hour_bank_hours) > 0 ? newHours / Number(detail.hour_bank_hours) : 0;
      const newAmount = (Number(detail.hour_bank_amount) || 0) * ratio;
      const { error } = await supabase.from("payroll_details").update({
        hour_bank_hours: newHours,
        hour_bank_amount: newAmount,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hv-payroll-details"] });
      toast({ title: t("finanzas.hv.toast.compensated") });
      setCompensateItem(null);
      setCompHours("");
      setCompReason("");
    },
    onError: () => toast({ title: t("finanzas.hv.toast.compensateError"), variant: "destructive" }),
  });

  // Computed
  const totalOvertimeHours = horasDetails.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
  const totalOvertimeAmount = horasDetails.reduce((s, d) => s + (Number(d.overtime_amount) || 0), 0);
  const totalBankHours = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_hours) || 0), 0);
  const totalBankAmount = horasDetails.reduce((s, d) => s + (Number(d.hour_bank_amount) || 0), 0);
  const uniqueEmps = new Set(horasDetails.map(d => d.employee_id)).size;

  const filteredCommissions = commissions.filter(c => {
    const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "";
    const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "";
    const matchSearch = !comisionSearch || empName.toLowerCase().includes(comisionSearch.toLowerCase()) || creatorName.toLowerCase().includes(comisionSearch.toLowerCase());
    const matchType = !comisionTypeFilter || (c as any).commission_type === comisionTypeFilter;
    return matchSearch && matchType;
  });

  const exportQuickBooks = () => {
    // Archivo para QuickBooks: el Memo y la cuenta van en español, sea cual sea el idioma de la pantalla.
    const rows = commissions.filter(c => c.status === "confirmado" || c.status === "pagado").map(c => ({
      Date: new Date(c.created_at).toLocaleDateString("en-US"),
      Name: c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—",
      Memo: `Comisión ${(c as any).commission_type} - ${c.period}`,
      Amount: Number(c.final_amount) || Number(c.estimated_amount) || 0,
      Account: c.cost_center || "Comisiones",
    }));
    if (rows.length === 0) { toast({ title: t("finanzas.hv.toast.noCommissionsToExport"), variant: "destructive" }); return; }
    exportTableToExcel(rows, "quickbooks-comisiones");
    toast({ title: t("finanzas.common.qbGenerated") });
  };

  const getBankStatus = (d: any) => {
    const hours = Number(d.hour_bank_hours) || 0;
    const amount = Number(d.hour_bank_amount) || 0;
    if (hours === 0 && amount === 0) return "Compensadas";
    if (hours > 0) return "Acumuladas";
    return "Pagadas";
  };

  // Get unique periods for filter
  const uniquePeriods = Array.from(new Set(horasDetails.map(d => (d as any).payroll_periods?.period_name).filter(Boolean)));

  const horasExtraFiltered = horasDetails.filter(d => {
    if (Number(d.overtime_hours) <= 0) return false;
    const empName = d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "";
    const matchSearch = !horasSearch || empName.toLowerCase().includes(horasSearch.toLowerCase());
    const matchPeriod = !horasPeriodFilter || (d as any).payroll_periods?.period_name === horasPeriodFilter;
    return matchSearch && matchPeriod;
  });

  const bancoFiltered = horasDetails.filter(d => {
    if (Number(d.hour_bank_hours) <= 0 && Number(d.overtime_amount) <= 0) return false;
    const empName = d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "";
    const matchSearch = !bancoSearch || empName.toLowerCase().includes(bancoSearch.toLowerCase());
    const status = getBankStatus(d);
    const matchStatus = !bancoStatusFilter || status === bancoStatusFilter;
    return matchSearch && matchStatus;
  });

  const renderTab = () => {
    switch (tab) {
      case "Horas Extra":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("finanzas.common.searchEmployee")} className="pl-8" value={horasSearch} onChange={e => setHorasSearch(e.target.value)} />
              </div>
              <Select value={horasPeriodFilter || undefined} onValueChange={v => setHorasPeriodFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t("finanzas.common.period")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  {uniquePeriods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                const rows = horasExtraFiltered.map(d => ({
                  Empleado: d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—",
                  Horas: Number(d.overtime_hours) || 0,
                  Monto: Number(d.overtime_amount) || 0,
                  Periodo: (d as any).payroll_periods?.period_name || "—",
                }));
                if (rows.length === 0) { toast({ title: t("finanzas.hv.toast.noRecordsToExport"), variant: "destructive" }); return; }
                exportTableToExcel(rows, "horas-extra");
                toast({ title: t("finanzas.hv.toast.exported") });
              }}><Download className="h-4 w-4 mr-1" />{t("finanzas.common.export")}</Button>
              {(horasSearch || horasPeriodFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setHorasSearch(""); setHorasPeriodFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
                </Button>
              )}
            </div>
            {loadingHoras ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : horasExtraFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4"><Clock className="h-8 w-8 text-muted-foreground" /></div>
                <h3 className="text-sm font-medium text-foreground mb-1">{t("finanzas.hv.otEmpty")}</h3>
                <p className="text-xs text-muted-foreground max-w-xs">{t("finanzas.hv.otEmptyDesc")}</p>
              </div>
            ) : viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-26rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.hours")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.amount")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.period")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {horasExtraFiltered.map(d => (
                      <TableRow key={d.id} className="hover:bg-muted/30">
                        <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                        <TableCell className="text-sm font-medium">{Number(d.overtime_hours) || 0}h</TableCell>
                        <TableCell className="text-sm">{fmt(Number(d.overtime_amount) || 0)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {horasExtraFiltered.map(d => (
                  <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-muted/30 transition-colors">
                    <p className="text-sm font-medium">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</p>
                    <p className="text-xl font-bold text-foreground mt-2">{Number(d.overtime_hours) || 0}h</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{fmt(Number(d.overtime_amount) || 0)}</span>
                      <span>{(d as any).payroll_periods?.period_name || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "Banco de Horas":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("finanzas.common.searchEmployee")} className="pl-8" value={bancoSearch} onChange={e => setBancoSearch(e.target.value)} />
              </div>
              <Select value={bancoStatusFilter || undefined} onValueChange={v => setBancoStatusFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  {Object.entries(BANCO_LABEL).map(([valor, clave]) => (
                    <SelectItem key={valor} value={valor}>{t(clave)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              {(bancoSearch || bancoStatusFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setBancoSearch(""); setBancoStatusFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
                </Button>
              )}
            </div>
            {loadingHoras ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : bancoFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4"><Wallet className="h-8 w-8 text-muted-foreground" /></div>
                <h3 className="text-sm font-medium text-foreground mb-1">{t("finanzas.hv.bankEmpty")}</h3>
                <p className="text-xs text-muted-foreground max-w-xs">{t("finanzas.hv.bankEmptyDesc")}</p>
              </div>
            ) : viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-26rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.hours")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.value")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.period")}</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bancoFiltered.map(d => {
                      const status = getBankStatus(d);
                      const hasHours = Number(d.hour_bank_hours) > 0;
                      return (
                        <TableRow key={d.id} className="hover:bg-muted/30">
                          <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                          <TableCell className="text-sm font-medium">{Number(d.hour_bank_hours) || 0}h</TableCell>
                          <TableCell className="text-sm">{fmt(Number(d.hour_bank_amount) || 0)}</TableCell>
                          <TableCell><Badge variant={status === "Acumuladas" ? "secondary" : status === "Pagadas" ? "default" : "outline"}>{t(BANCO_LABEL[status])}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            {hasHours && (
                              <div className="flex items-center gap-1">
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPayItem(d)}><Banknote className="h-3.5 w-3.5 mr-1" />{t("finanzas.hv.pay")}</Button></TooltipTrigger><TooltipContent>{t("finanzas.hv.payTooltip")}</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCompensateItem(d)}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />{t("finanzas.hv.compensate")}</Button></TooltipTrigger><TooltipContent>{t("finanzas.hv.compensateTooltip")}</TooltipContent></Tooltip>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {bancoFiltered.map(d => {
                  const status = getBankStatus(d);
                  const hasHours = Number(d.hour_bank_hours) > 0;
                  return (
                    <div key={d.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant={status === "Acumuladas" ? "secondary" : status === "Pagadas" ? "default" : "outline"} className="text-[10px]">{t(BANCO_LABEL[status])}</Badge>
                      </div>
                      <p className="text-sm font-medium">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</p>
                      <p className="text-xl font-bold text-foreground mt-2">{Number(d.hour_bank_hours) || 0}h</p>
                      <p className="text-xs text-muted-foreground mt-1">{fmt(Number(d.hour_bank_amount) || 0)}</p>
                      {hasHours && (
                        <div className="flex items-center gap-1 mt-3">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPayItem(d)}><Banknote className="h-3.5 w-3.5 mr-1" />{t("finanzas.hv.pay")}</Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCompensateItem(d)}><ArrowRightLeft className="h-3.5 w-3.5 mr-1" />{t("finanzas.hv.compensate")}</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case "Comisiones":
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("finanzas.common.searchEmployeeOrCreator")} className="pl-8" value={comisionSearch} onChange={e => setComisionSearch(e.target.value)} />
              </div>
              <Select value={comisionTypeFilter || undefined} onValueChange={v => setComisionTypeFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-36"><SelectValue placeholder={t("common.type")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  <SelectItem value="laboral">{t("finanzas.commType.labor")}</SelectItem>
                  <SelectItem value="comercial">{t("finanzas.commType.commercial")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="inline-flex items-center rounded-md border border-border">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-r-none" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" onClick={() => setShowComisionModal(true)}><Plus className="h-4 w-4 mr-1" />{t("finanzas.comm.new")}</Button>
              <Button size="sm" variant="outline" onClick={exportQuickBooks}><Download className="h-4 w-4 mr-1" />QuickBooks</Button>
              {(comisionSearch || comisionTypeFilter) && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setComisionSearch(""); setComisionTypeFilter(""); }}>
                  <X className="h-3.5 w-3.5 mr-1" />{t("finanzas.common.clear")}
                </Button>
              )}
            </div>
            {viewMode === "list" ? (
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
                    {loadingCommissions ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    )) : filteredCommissions.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">{t("finanzas.comm.empty")}</TableCell></TableRow>
                    ) : filteredCommissions.map(c => {
                      const estado = COMISION_VARIANT[c.status] ? c.status : "proyectado";
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
                          <TableCell><Badge variant={COMISION_VARIANT[estado]}>{estadoComision(t, estado)}</Badge></TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setComisionViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setComisionDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCommissions.length === 0 ? (
                  <div className="col-span-full text-center text-muted-foreground py-12">{t("finanzas.hv.noCommissions")}</div>
                ) : filteredCommissions.map(c => {
                  const estado = COMISION_VARIANT[c.status] ? c.status : "proyectado";
                  const empName = c.employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : "—";
                  const creatorName = (c as any).creators?.artistic_name || (c as any).creators?.name || "—";
                  return (
                    <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px]">{tipoComision(t, (c as any).commission_type)}</Badge>
                        <Badge variant={COMISION_VARIANT[estado]} className="text-[10px]">{estadoComision(t, estado)}</Badge>
                      </div>
                      <p className="text-sm font-medium">{empName}</p>
                      <p className="text-xs text-muted-foreground">{creatorName}</p>
                      <p className="text-xl font-bold text-foreground mt-2">{fmt(Number(c.final_amount) || 0)}</p>
                      <div className="flex items-center gap-1 mt-3">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setComisionViewItem(c)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setComisionDeleteItem(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader title={t("finanzas.hv.title")} subtitle={t("finanzas.hv.subtitle")} />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* KPIs globales — clickeables, abren modal */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {(loadingHoras || loadingCommissions) ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
            <>
              <StatChip label={t("finanzas.hv.kpi.totalOt")} value={`${totalOvertimeHours}h`} icon={<Clock className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.common.employeesCount", { n: uniqueEmps })} onClick={() => setKpiPopup("horasExtra")} />
              <StatChip label={t("finanzas.common.hourBank")} value={`${totalBankHours}h`} icon={<Wallet className="h-3.5 w-3.5" />} color="bg-success" hint={fmt(totalBankAmount)} onClick={() => setKpiPopup("banco")} />
              <StatChip label={t("finanzas.hv.kpi.totalCommissions")} value={fmt(commissions.reduce((s, c) => s + (Number(c.final_amount) || 0), 0))} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-warning" hint={t("finanzas.common.records", { n: commissions.length })} onClick={() => setKpiPopup("comisiones")} />
              <StatChip label={t("finanzas.dash.kpi.activeEmployees")} value={String(uniqueEmps)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-accent" hint={t("finanzas.hv.kpi.withRecords")} onClick={() => setKpiPopup("empleados")} />
            </>
          )}
        </div>

        {/* Tab bar */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
          {TABS.map(pestana => (
            <Button key={pestana} variant={tab === pestana ? "secondary" : "ghost"} size="sm" onClick={() => setTab(pestana)}>{t(TAB_LABEL[pestana])}</Button>
          ))}
        </div>

        {renderTab()}
      </div>

      <NuevaComisionModal open={showComisionModal} onClose={() => setShowComisionModal(false)} onSubmit={data => createCommission.mutate(data)} isPending={createCommission.isPending} />

      {/* Pay Hours Dialog */}
      <Dialog open={!!payItem} onOpenChange={() => setPayItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("finanzas.hv.payDialog.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("finanzas.common.employee")}: <span className="font-medium text-foreground">{payItem?.employees ? `${payItem.employees.first_name} ${payItem.employees.last_name}` : "—"}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("finanzas.common.hours")}: <span className="font-medium text-foreground">{Number(payItem?.hour_bank_hours) || 0}h</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("finanzas.hv.payDialog.amount")}: <span className="font-medium text-foreground">{fmt(Number(payItem?.hour_bank_amount) || (Number(payItem?.hour_bank_hours) * hourValue) || 0)}</span> <span className="text-muted-foreground">({fmt(hourValue)}/h)</span>
            </p>
            <p className="text-xs text-muted-foreground">{t("finanzas.hv.payDialog.note")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayItem(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => payItem && payHoursMutation.mutate(payItem)} disabled={payHoursMutation.isPending}>
              <Banknote className="h-4 w-4 mr-1" />{t("finanzas.hv.payDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compensate Hours Dialog */}
      <Dialog open={!!compensateItem} onOpenChange={() => setCompensateItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("finanzas.hv.compDialog.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("finanzas.common.employee")}: <span className="font-medium text-foreground">{compensateItem?.employees ? `${compensateItem.employees.first_name} ${compensateItem.employees.last_name}` : "—"}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("finanzas.hv.compDialog.available")}: <span className="font-medium text-foreground">{Number(compensateItem?.hour_bank_hours) || 0}h</span>
            </p>
            <div>
              <Label>{t("finanzas.hv.compDialog.hours")}</Label>
              <Input type="number" placeholder="0" value={compHours} onChange={e => setCompHours(e.target.value)} max={Number(compensateItem?.hour_bank_hours) || 0} />
            </div>
            <div>
              <Label>{t("finanzas.common.reason")}</Label>
              <Textarea placeholder={t("finanzas.hv.compDialog.reasonPlaceholder")} value={compReason} onChange={e => setCompReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompensateItem(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => compensateItem && compensateHoursMutation.mutate({ id: compensateItem.id, hours: Number(compHours) })} disabled={!compHours || !compReason || compensateHoursMutation.isPending}>
              <ArrowRightLeft className="h-4 w-4 mr-1" />{t("finanzas.hv.compensate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Commission Dialog */}
      <Dialog open={!!comisionViewItem} onOpenChange={() => setComisionViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("finanzas.comm.detailOf")}</DialogTitle></DialogHeader>
          {comisionViewItem && (
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">{t("common.type")}:</span> {crudoEnEspanol(language, tipoComisionGuardado, t, (comisionViewItem as any).commission_type)}</p>
              <p><span className="text-muted-foreground">{t("finanzas.common.period")}:</span> {comisionViewItem.period}</p>
              <p><span className="text-muted-foreground">{t("finanzas.common.base")}:</span> {fmt(Number(comisionViewItem.base_amount) || 0)}</p>
              <p><span className="text-muted-foreground">{t("finanzas.common.percentage")}:</span> {Number(comisionViewItem.percentage) || 0}%</p>
              <p><span className="text-muted-foreground">{t("finanzas.common.estimated")}:</span> {fmt(Number(comisionViewItem.estimated_amount) || 0)}</p>
              <p><span className="text-muted-foreground">{t("finanzas.common.final")}:</span> {fmt(Number(comisionViewItem.final_amount) || 0)}</p>
              <p><span className="text-muted-foreground">{t("common.status")}:</span> {crudoEnEspanol(language, estadoComision, t, comisionViewItem.status)}</p>
              {comisionViewItem.notes && <p><span className="text-muted-foreground">{t("finanzas.common.notes")}:</span> {comisionViewItem.notes}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Commission Dialog */}
      <AlertDialog open={!!comisionDeleteItem} onOpenChange={() => setComisionDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finanzas.comm.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => comisionDeleteItem && deleteCommission.mutate(comisionDeleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("finanzas.kpi.empty")}
        title={(() => {
          switch (kpiPopup) {
            case "horasExtra": return t("finanzas.hv.popup.ot", { n: totalOvertimeHours });
            case "banco": return t("finanzas.hv.popup.bank", { n: totalBankHours, amount: fmt(totalBankAmount) });
            case "comisiones": return t("finanzas.hv.popup.commissions", { n: commissions.length });
            case "empleados": return t("finanzas.hv.popup.employees", { n: uniqueEmps });
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "horasExtra": return t("finanzas.hv.popup.otSub", { amount: fmt(totalOvertimeAmount) });
            case "banco": return t("finanzas.hv.popup.bankSub", { n: horasDetails.filter(d => Number(d.hour_bank_hours) > 0).length });
            case "comisiones": return `Total: ${fmt(commissions.reduce((s, c) => s + (Number(c.final_amount) || 0), 0))}`;
            case "empleados": return t("finanzas.hv.popup.employeesSub");
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          if (kpiPopup === "horasExtra") {
            return horasDetails.filter(d => Number(d.overtime_hours) > 0).map((d): KpiRow => ({
              primary: (d as any).employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : t("finanzas.hv.row.employeeId", { id: d.employee_id?.slice(0, 8) ?? "—" }),
              secondary: t("finanzas.control.hoursExtra", { n: d.overtime_hours ?? 0 }),
              right: fmt(Number(d.overtime_amount) || 0),
              rightTone: "default",
            }));
          }
          if (kpiPopup === "banco") {
            return horasDetails.filter(d => Number(d.hour_bank_hours) > 0).map((d): KpiRow => ({
              primary: (d as any).employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : t("finanzas.hv.row.employeeId", { id: d.employee_id?.slice(0, 8) ?? "—" }),
              secondary: t("finanzas.hv.row.inBank", { n: d.hour_bank_hours ?? 0 }),
              right: fmt(Number(d.hour_bank_amount) || 0),
              rightTone: "success",
            }));
          }
          if (kpiPopup === "comisiones") {
            const tone = (status: string): KpiRow["rightTone"] =>
              status === "pagado" ? "success" : status === "confirmado" ? "default" : "warning";
            return commissions.map((c): KpiRow => ({
              primary: (c as any).employees ? `${(c as any).employees.first_name} ${(c as any).employees.last_name}` : t("finanzas.hv.row.employeeId", { id: c.employee_id?.slice(0, 8) ?? "—" }),
              secondary: `${c.area ?? t("finanzas.common.noArea")} · ${crudoEnEspanol(language, estadoComision, t, c.status)}`,
              right: fmt(Number(c.final_amount) || 0),
              rightTone: tone(c.status as string),
            }));
          }
          if (kpiPopup === "empleados") {
            const map = new Map<string, { name: string; hours: number; amount: number }>();
            horasDetails.forEach(d => {
              const key = d.employee_id ?? "—";
              const existing = map.get(key);
              const name = (d as any).employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : t("finanzas.hv.row.employeeId", { id: key.slice(0, 8) });
              map.set(key, {
                name,
                hours: (existing?.hours ?? 0) + (Number(d.overtime_hours) || 0) + (Number(d.hour_bank_hours) || 0),
                amount: (existing?.amount ?? 0) + (Number(d.overtime_amount) || 0) + (Number(d.hour_bank_amount) || 0),
              });
            });
            return Array.from(map.values()).map((e): KpiRow => ({
              primary: e.name,
              secondary: t("finanzas.hv.row.totalHours", { n: e.hours }),
              right: fmt(e.amount),
            }));
          }
          return [];
        })()}
      />
    </div>
  );
}
