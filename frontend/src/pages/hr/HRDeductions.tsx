import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, AlertTriangle, Clock, CheckCircle, DollarSign, Plus, Eye, Trash2,
  Search, X, ListIcon, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { DEDUCTION_DISPLAY_TYPES, DEDUCTION_STATUSES } from "@/lib/hrConstants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { etiqueta, deSiempreSalvoEnIngles, CATEGORIA_INFRACCION, ESTADO_DEDUCCION, TIPO_DEDUCCION } from "./etiquetasRrhh";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeductionRecord {
  id: string;
  employee_id: string;
  deduction_type: string;
  amount: number;
  description: string | null;
  month_year: string;
  status: string;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    employee_code: string | null;
    department_id: string | null;
  } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useDeductions() {
  return useQuery({
    queryKey: ["employee-deductions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_deductions")
        .select("*, employees(first_name, last_name, employee_code, department_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeductionRecord[];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function parseCategory(description: string | null): string | null {
  if (!description) return null;
  const match = description.match(/^\[(.+?)\]/);
  return match ? match[1] : null;
}

function parseDescription(description: string | null): string {
  if (!description) return "";
  return description.replace(/^\[.+?\]\s*/, "");
}

function formatAmount(f: Formato, amount: number): string {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive"; label: TranslationKey }> = {
  pending: { variant: "secondary", label: "hr.opt.dedStatus.pending" },
  applied: { variant: "default", label: "hr.opt.dedStatus.applied" },
  rejected: { variant: "destructive", label: "hr.opt.dedStatus.rejected" },
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRDeductions() {
  const { t } = useLanguage();
  const f = useFormato();
  const DMY = f.idioma === "en" ? "MM/dd/yyyy" : "dd/MM/yyyy";
  const navigate = useNavigate();
  const { data: deductions = [], isLoading } = useDeductions();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeTab, setTypeTab] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "applied" | "amount";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  // Modals
  const [viewItem, setViewItem] = useState<DeductionRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<DeductionRecord | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_deductions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-deductions-all"] });
      toast({ title: t("hr.ded.deleted") });
      setDeleteItem(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalPending = deductions.filter((d) => d.status === "pending").length;
  const totalApplied = deductions.filter((d) => d.status === "applied").length;
  const totalAmount = deductions.reduce((sum, d) => sum + (d.amount || 0), 0);

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const filtered = deductions.filter((d) => {
    const emp = d.employees;
    const fullName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const matchSearch = !search || fullName.includes(search.toLowerCase());
    const matchStatus = !statusFilter || d.status === statusFilter;
    const matchType = !typeTab || d.deduction_type === typeTab;
    const matchDept = !deptTab || emp?.department_id === deptTab;
    const recordDate = new Date(d.created_at);
    const matchFrom = !dateFrom || recordDate >= dateFrom;
    const matchTo = !dateTo || recordDate <= dateTo;
    return matchSearch && matchStatus && matchType && matchDept && matchFrom && matchTo;
  });

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("hr.ded.title")}
          subtitle={t(deductions.length === 1 ? "hr.ded.subtitle.one" : "hr.ded.subtitle.other", { count: deductions.length })}
          actions={
            <Button size="sm" onClick={() => navigate("/hr/deducciones/nuevo")}>
              <Plus className="h-4 w-4 mr-1" />{t("hr.ded.new")}
            </Button>
          }
        />
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <StatChip label={t("hr.ded.total")} value={String(deductions.length)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hr.allRecords")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("common.pendingPl")} value={String(totalPending)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={deductions.length > 0 ? t("hr.pctOfTotal", { pct: ((totalPending / deductions.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("pending")} />
              <StatChip label={t("hr.ded.applied")} value={String(totalApplied)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={deductions.length > 0 ? t("hr.pctOfTotal", { pct: ((totalApplied / deductions.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("applied")} />
              <StatChip label={t("hr.ded.totalAmount")} value={formatAmount(f, totalAmount)} icon={<Wallet className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("hr.ded.totalAmountHint")} onClick={() => setKpiPopup("amount")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>{t("common.all")}</Button>
          {departments.map((d) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Type Sub-tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!typeTab ? "secondary" : "ghost"} size="sm" onClick={() => setTypeTab("")}>{t("common.all")}</Button>
          {DEDUCTION_DISPLAY_TYPES.map((dt) => (
            <Button key={dt.value} variant={typeTab === dt.value ? "secondary" : "ghost"} size="sm" onClick={() => setTypeTab(dt.value)}>{etiqueta(t, TIPO_DEDUCCION, dt.value, dt.label)}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hr.searchEmployee")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {DEDUCTION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{etiqueta(t, ESTADO_DEDUCCION, s.value, s.label)}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }}
          />

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />{t("hr.clearFilters")}
            </Button>
          )}
        </div>

        {/* ── Table View ──────────────────────────────────────────────────── */}
        {viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.employee")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.type")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.category")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.ded.amount")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.date")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        {deductions.length === 0 ? (
                          <EmptyState seed="hr-deducciones" title={t("hr.ded.empty")} description={t("hr.ded.emptyHint")} />
                        ) : (
                          <EmptyState seed="hr-deducciones" title={t("common.noResultsShort")} description={t("common.noMatches")} />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ded) => {
                      const emp = ded.employees;
                      const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                      const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                      const typeLabel = etiqueta(t, TIPO_DEDUCCION, ded.deduction_type);
                      const category = ded.deduction_type === "infraccion" ? parseCategory(ded.description) : null;
                      const catLabel = category ? etiqueta(t, CATEGORIA_INFRACCION, category) : "—";
                      const badge = STATUS_BADGE[ded.status] ?? STATUS_BADGE.pending;
                      return (
                        <TableRow key={ded.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium">{fullName}</p>
                                {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              {ded.deduction_type === "adelanto" ? <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                              {typeLabel}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{catLabel}</TableCell>
                          <TableCell className="text-sm font-medium">{formatAmount(f, ded.amount)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(ded.created_at), DMY)}</TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{t(badge.label)}</Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ded)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ded)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* ── Grid View ──────────────────────────────────────────────────── */
          <div>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              deductions.length === 0 ? (
                <EmptyState seed="hr-deducciones" title={t("hr.ded.empty")} description={t("hr.ded.emptyHint")} />
              ) : (
                <EmptyState seed="hr-deducciones" title={t("common.noResultsShort")} description={t("common.noMatches")} />
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((ded) => {
                  const emp = ded.employees;
                  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                  const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                  const typeLabel = etiqueta(t, TIPO_DEDUCCION, ded.deduction_type);
                  const badge = STATUS_BADGE[ded.status] ?? STATUS_BADGE.pending;
                  return (
                    <Card key={ded.id} className="group hover:shadow-md transition-all">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{fullName}</p>
                              {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                            </div>
                          </div>
                          <span className="text-sm font-semibold shrink-0">{formatAmount(f, ded.amount)}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-sm">
                            {ded.deduction_type === "adelanto" ? <Wallet className="h-3.5 w-3.5 text-muted-foreground" /> : <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                            {typeLabel}
                          </div>
                          <p className="text-xs text-muted-foreground">{format(new Date(ded.created_at), DMY)}</p>
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <Badge variant={badge.variant} className="text-xs">{t(badge.label)}</Badge>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ded)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ded)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Results counter */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(deductions.length === 1 ? "hr.ded.showing.one" : "hr.ded.showing.other", { shown: filtered.length, total: deductions.length })}
          </p>
        )}
      </div>

      {/* ── View Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("hr.ded.detail")}</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const typeLabel = etiqueta(t, TIPO_DEDUCCION, viewItem.deduction_type);
            const category = viewItem.deduction_type === "infraccion" ? parseCategory(viewItem.description) : null;
            const catLabel = category ? etiqueta(t, CATEGORIA_INFRACCION, category) : null;
            const descText = parseDescription(viewItem.description);
            const badge = STATUS_BADGE[viewItem.status] ?? STATUS_BADGE.pending;
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-muted-foreground">{t("hr.employee")}</Label><p className="font-medium">{viewItem.employees ? `${viewItem.employees.first_name} ${viewItem.employees.last_name}` : "—"}</p></div>
                  <div><Label className="text-muted-foreground">{t("common.type")}</Label><p className="font-medium">{typeLabel}</p></div>
                  {catLabel && <div><Label className="text-muted-foreground">{t("common.category")}</Label><p className="font-medium">{catLabel}</p></div>}
                  <div><Label className="text-muted-foreground">{t("hr.ded.amount")}</Label><p className="font-medium">{formatAmount(f, viewItem.amount)}</p></div>
                  <div><Label className="text-muted-foreground">{t("common.date")}</Label><p className="font-medium">{format(new Date(viewItem.created_at), DMY)}</p></div>
                  <div><Label className="text-muted-foreground">{t("common.status")}</Label><Badge variant={badge.variant}>{t(badge.label)}</Badge></div>
                </div>
                {descText && <div><Label className="text-muted-foreground">{t("common.description")}</Label><p>{descText}</p></div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.ded.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hr.ded.deleteDesc", { amount: formatAmount(f, deleteItem?.amount ?? 0) })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? t("hr.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `${t("hr.ded.total")} — ${deductions.length}`;
            case "pending": return `${t("common.pendingPl")} — ${totalPending}`;
            case "applied": return `${t("hr.ded.applied")} — ${totalApplied}`;
            case "amount": return `${t("hr.ded.totalAmount")} — ${formatAmount(f, totalAmount)}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = deductions;
          if (kpiPopup === "pending") list = deductions.filter((d: any) => d.status === "pending");
          else if (kpiPopup === "applied") list = deductions.filter((d: any) => d.status === "applied");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "applied" ? "success" : status === "pending" ? "warning" : "default";
          return list.slice(0, 100).map((d: any): KpiRow => ({
            primary: d.employee_name ?? d.reason ?? t("hr.ded.noConcept"),
            secondary: d.month_year ?? (d.deduction_type != null ? deSiempreSalvoEnIngles(f.idioma, t, TIPO_DEDUCCION, d.deduction_type, d.deduction_type) : undefined),
            right: formatAmount(f, d.amount || 0),
            rightTone: tone(d.status ?? ""),
          }));
        })()}
        emptyText={t("hr.kpiEmpty")}
      />
    </div>
  );
}
