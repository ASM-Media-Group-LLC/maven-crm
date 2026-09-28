import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Clock, Loader2, CheckCircle, Plus, Eye, Pencil, Trash2,
  Search, X, ListIcon, LayoutGrid, DollarSign, ShieldOff, Package, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useDepartments } from "@/hooks/useEmployees";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { TranslationKey } from "@/lib/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OffboardingRecord {
  id: string;
  employee_id: string;
  termination_type: string;
  termination_date: string;
  termination_reason: string | null;
  exit_interview_date: string | null;
  exit_interview_notes: string | null;
  access_revoked: boolean;
  equipment_returned: boolean;
  final_payment_status: string;
  status: string;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    email: string | null;
    profile_photo_url: string | null;
    department_id: string | null;
    departments: { name: string } | null;
    positions: { name: string } | null;
  } | null;
  task_total: number;
  task_completed: number;
}

// status, termination_type y final_payment_status son DATOS de la base; lo que se ve es la clave.
const OFFBOARDING_STATUSES: { value: string; label: TranslationKey }[] = [
  { value: "in_progress", label: "common.inProgress" },
  { value: "completed", label: "common.completed" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  in_progress: { bg: "bg-warning/15", text: "text-warning" },
  completed: { bg: "bg-accent/15", text: "text-accent-foreground" },
};

const TERMINATION_TYPES: Record<string, TranslationKey> = {
  voluntary: "hr.off.term.voluntary",
  involuntary: "hr.off.term.involuntary",
  end_of_contract: "hr.off.term.end_of_contract",
  mutual_agreement: "hr.off.term.mutual_agreement",
};

const PAYMENT_STATUSES: Record<string, TranslationKey> = {
  pending: "hr.off.pay.pending",
  processing: "hr.off.pay.processing",
  paid: "hr.off.pay.paid",
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useOffboardings() {
  return useQuery({
    queryKey: ["hr-offboardings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_offboarding")
        .select(`
          *,
          employees!employee_offboarding_employee_id_fkey(
            first_name, last_name, email, profile_photo_url, department_id,
            departments(name),
            positions:positions(name)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (data ?? []).map((d: any) => d.id);
      let taskCounts: Record<string, { total: number; completed: number }> = {};
      if (ids.length > 0) {
        const { data: tasks } = await supabase
          .from("employee_offboarding_tasks")
          .select("offboarding_id, status")
          .in("offboarding_id", ids);
        if (tasks) {
          for (const t of tasks) {
            if (!taskCounts[t.offboarding_id]) taskCounts[t.offboarding_id] = { total: 0, completed: 0 };
            taskCounts[t.offboarding_id].total++;
            if (t.status === "completed") taskCounts[t.offboarding_id].completed++;
          }
        }
      }

      return (data ?? []).map((d: any) => ({
        ...d,
        task_total: taskCounts[d.id]?.total ?? 0,
        task_completed: taskCounts[d.id]?.completed ?? 0,
      })) as OffboardingRecord[];
    },
  });
}

function getInitials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HROffboarding() {
  const { t } = useLanguage();
  const f = useFormato();
  const DMY = f.idioma === "en" ? "MM/dd/yyyy" : "dd/MM/yyyy";
  const tipoSalida = (v: string) => (TERMINATION_TYPES[v] ? t(TERMINATION_TYPES[v]) : v);
  const estadoPago = (v: string) => (PAYMENT_STATUSES[v] ? t(PAYMENT_STATUSES[v]) : v);
  const estado = (v: string) => {
    const s = OFFBOARDING_STATUSES.find((o) => o.value === v);
    return s ? t(s.label) : v;
  };
  const navigate = useNavigate();
  const { data: offboardings = [], isLoading } = useOffboardings();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  type KpiKey = "total" | "inProgress" | "completed" | "pendingPayment";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [viewItem, setViewItem] = useState<OffboardingRecord | null>(null);
  const [editItem, setEditItem] = useState<OffboardingRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<OffboardingRecord | null>(null);
  const [editForm, setEditForm] = useState({
    status: "", access_revoked: false, equipment_returned: false,
    final_payment_status: "", exit_interview_notes: "",
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_offboarding").update({
        status: editForm.status,
        access_revoked: editForm.access_revoked,
        equipment_returned: editForm.equipment_returned,
        final_payment_status: editForm.final_payment_status,
        exit_interview_notes: editForm.exit_interview_notes || null,
      }).eq("id", editItem!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-offboardings"] });
      toast({ title: t("hr.off.updated") });
      setEditItem(null);
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("employee_offboarding_tasks").delete().eq("offboarding_id", id);
      const { error } = await supabase.from("employee_offboarding").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-offboardings"] });
      toast({ title: t("hr.off.deleted") });
      setDeleteItem(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalInProgress = offboardings.filter((o) => o.status === "in_progress").length;
  const totalCompleted = offboardings.filter((o) => o.status === "completed").length;
  const totalPendingPayment = offboardings.filter((o) => o.final_payment_status === "pending").length;

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter;
  const filtered = offboardings.filter((o) => {
    const empName = `${o.employees?.first_name ?? ""} ${o.employees?.last_name ?? ""}`.toLowerCase();
    const matchSearch = !search || empName.includes(search.toLowerCase()) || o.employees?.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || o.status === statusFilter;
    const matchDept = !deptTab || o.employees?.department_id === deptTab;
    return matchSearch && matchStatus && matchDept;
  });

  function clearFilters() { setSearch(""); setStatusFilter(""); }

  function openEdit(item: OffboardingRecord) {
    setEditForm({
      status: item.status,
      access_revoked: item.access_revoked ?? false,
      equipment_returned: item.equipment_returned ?? false,
      final_payment_status: item.final_payment_status ?? "pending",
      exit_interview_notes: item.exit_interview_notes ?? "",
    });
    setEditItem(item);
  }

  function getProgress(item: OffboardingRecord) {
    return item.task_total > 0 ? Math.round((item.task_completed / item.task_total) * 100) : 0;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title="Offboarding"
          subtitle={t("hr.off.subtitle")}
          actions={
            <Button size="sm" onClick={() => navigate("/hr/offboarding/nuevo")}>
              <Plus className="h-4 w-4 mr-1" />{t("hr.off.start")}
            </Button>
          }
        />
      </header>

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <StatChip label={t("hr.off.total")} value={String(offboardings.length)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hr.off.allProcesses")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("common.inProgress")} value={String(totalInProgress)} icon={<Loader2 className="h-3.5 w-3.5" />} color="bg-warning" hint={offboardings.length > 0 ? t("hr.pctOfTotal", { pct: ((totalInProgress / offboardings.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("inProgress")} />
              <StatChip label={t("hr.off.completedPl")} value={String(totalCompleted)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={offboardings.length > 0 ? t("hr.pctOfTotal", { pct: ((totalCompleted / offboardings.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("completed")} />
              <StatChip label={t("hr.off.pendingPayment")} value={String(totalPendingPayment)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-destructive" hint={offboardings.length > 0 ? t("hr.pctOfTotal", { pct: ((totalPendingPayment / offboardings.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("pendingPayment")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>{t("common.all")}</Button>
          {departments.map((d: any) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hr.off.searchPlaceholder")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {OFFBOARDING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}
            </SelectContent>
          </Select>
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

        {/* ── Table View ──────────────────────────────────────────── */}
        {viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.employee")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.off.exitType")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.off.terminationDate")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.off.access")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.off.equipment")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.off.finalPayment")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hr.progress")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9}>
                        {offboardings.length === 0 ? (
                          <EmptyState seed="hr-offboarding" title={t("hr.off.empty")} description={t("hr.off.emptyHint")} />
                        ) : (
                          <EmptyState seed="hr-offboarding" title={t("common.noResultsShort")} description={t("common.noMatches")} />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ob) => {
                      const emp = ob.employees;
                      const initials = getInitials(emp?.first_name ?? "", emp?.last_name ?? "");
                      const statusColors = STATUS_COLORS[ob.status] ?? STATUS_COLORS.in_progress;
                      const progress = getProgress(ob);
                      return (
                        <TableRow key={ob.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium">{emp?.first_name} {emp?.last_name}</p>
                                <p className="text-xs text-muted-foreground">{emp?.departments?.name ?? ""}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{tipoSalida(ob.termination_type)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(ob.termination_date), DMY)}</TableCell>
                          <TableCell>
                            {ob.access_revoked
                              ? <Badge variant="secondary" className="text-xs bg-accent/15 text-accent-foreground"><ShieldOff className="h-3 w-3 mr-1" />{t("hr.off.revoked")}</Badge>
                              : <Badge variant="secondary" className="text-xs bg-destructive/15 text-destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t("common.pending")}</Badge>}
                          </TableCell>
                          <TableCell>
                            {ob.equipment_returned
                              ? <Badge variant="secondary" className="text-xs bg-accent/15 text-accent-foreground"><Package className="h-3 w-3 mr-1" />{t("hr.off.returned")}</Badge>
                              : <Badge variant="secondary" className="text-xs bg-destructive/15 text-destructive"><AlertTriangle className="h-3 w-3 mr-1" />{t("common.pending")}</Badge>}
                          </TableCell>
                          <TableCell>
                            <span className={cn("text-xs font-medium", ob.final_payment_status === "paid" ? "text-accent-foreground" : ob.final_payment_status === "processing" ? "text-warning" : "text-destructive")}>
                              {estadoPago(ob.final_payment_status)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={progress} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{ob.task_completed}/{ob.task_total}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                              {estado(ob.status)}
                            </span>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ob)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(ob)}><Pencil className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.edit")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ob)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          /* ── Grid View ────────────────────────────────────────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full">
                {offboardings.length === 0 ? (
                  <EmptyState seed="hr-offboarding" title={t("hr.off.empty")} description={t("hr.off.emptyHint")} />
                ) : (
                  <EmptyState seed="hr-offboarding" title={t("common.noResultsShort")} description={t("common.noMatches")} />
                )}
              </div>
            ) : (
              filtered.map((ob) => {
                const emp = ob.employees;
                const initials = getInitials(emp?.first_name ?? "", emp?.last_name ?? "");
                const statusColors = STATUS_COLORS[ob.status] ?? STATUS_COLORS.in_progress;
                const progress = getProgress(ob);
                return (
                  <Card key={ob.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{emp?.first_name} {emp?.last_name}</p>
                            <p className="text-xs text-muted-foreground">{emp?.departments?.name ?? ""}</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                          {estado(ob.status)}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">{t("common.type")}:</span> {tipoSalida(ob.termination_type)}</p>
                        <p><span className="font-medium text-foreground">{t("hr.off.termination")}:</span> {format(new Date(ob.termination_date), DMY)}</p>
                        <div className="flex items-center gap-3">
                          <span className={ob.access_revoked ? "text-accent-foreground" : "text-destructive"}>
                            <ShieldOff className="h-3 w-3 inline mr-0.5" />{ob.access_revoked ? t("hr.off.revoked") : t("common.pending")}
                          </span>
                          <span className={ob.equipment_returned ? "text-accent-foreground" : "text-destructive"}>
                            <Package className="h-3 w-3 inline mr-0.5" />{ob.equipment_returned ? t("hr.off.returned") : t("common.pending")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground">{ob.task_completed}/{ob.task_total}</span>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-border">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(ob)}><Eye className="h-3 w-3 mr-1" />{t("common.view")}</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(ob)}><Pencil className="h-3 w-3 mr-1" />{t("common.edit")}</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(ob)}><Trash2 className="h-3 w-3 mr-1" />{t("common.delete")}</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── View Modal ────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("hr.off.detail")}</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const emp = viewItem.employees;
            const progress = getProgress(viewItem);
            const sc = STATUS_COLORS[viewItem.status] ?? STATUS_COLORS.in_progress;
            return (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">{t("hr.employee")}</p><p className="font-medium">{emp?.first_name} {emp?.last_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p>{emp?.email ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.area")}</p><p>{emp?.departments?.name ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("common.position")}</p><p>{emp?.positions?.name ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.terminationType")}</p><p>{tipoSalida(viewItem.termination_type)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.terminationDate")}</p><p>{format(new Date(viewItem.termination_date), DMY)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.accessRevoked")}</p><p>{viewItem.access_revoked ? `✅ ${t("hr.yes")}` : `❌ ${t("hr.no")}`}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.equipmentReturned")}</p><p>{viewItem.equipment_returned ? `✅ ${t("hr.yes")}` : `❌ ${t("hr.no")}`}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.finalPayment")}</p><p>{estadoPago(viewItem.final_payment_status)}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.status")}</p>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                      {estado(viewItem.status)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("hr.off.taskProgress")}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={progress} className="h-2 flex-1" />
                    <span className="text-xs">{progress}%</span>
                  </div>
                </div>
                {viewItem.termination_reason && (
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.exitReason")}</p><p className="whitespace-pre-wrap">{viewItem.termination_reason}</p></div>
                )}
                {viewItem.exit_interview_notes && (
                  <div><p className="text-xs text-muted-foreground">{t("hr.off.exitInterviewNotes")}</p><p className="whitespace-pre-wrap">{viewItem.exit_interview_notes}</p></div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("hr.off.edit")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("hr.employee")}</Label>
              <Input value={editItem ? `${editItem.employees?.first_name} ${editItem.employees?.last_name}` : ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((prev) => ({ ...prev, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OFFBOARDING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("hr.off.accessRevoked")}</Label>
              <Switch checked={editForm.access_revoked} onCheckedChange={(v) => setEditForm((prev) => ({ ...prev, access_revoked: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("hr.off.equipmentReturned")}</Label>
              <Switch checked={editForm.equipment_returned} onCheckedChange={(v) => setEditForm((prev) => ({ ...prev, equipment_returned: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.off.finalPaymentStatus")}</Label>
              <Select value={editForm.final_payment_status} onValueChange={(v) => setEditForm((prev) => ({ ...prev, final_payment_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.off.exitInterviewNotes")}</Label>
              <Textarea rows={3} value={editForm.exit_interview_notes} onChange={(e) => setEditForm((prev) => ({ ...prev, exit_interview_notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>{t("common.cancel")}</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? t("hr.saving") : t("hr.saveChanges")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.off.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hr.off.deleteDescA")} <strong>{deleteItem?.employees?.first_name} {deleteItem?.employees?.last_name}</strong> {t("hr.off.deleteDescB")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
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
            case "total": return `${t("hr.off.total")} — ${offboardings.length}`;
            case "inProgress": return `${t("common.inProgress")} — ${totalInProgress}`;
            case "completed": return `${t("hr.off.completedPl")} — ${totalCompleted}`;
            case "pendingPayment": return `${t("hr.off.pendingPayment")} — ${totalPendingPayment}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = offboardings;
          if (kpiPopup === "inProgress") list = offboardings.filter((o: any) => o.status === "in_progress");
          else if (kpiPopup === "completed") list = offboardings.filter((o: any) => o.status === "completed");
          else if (kpiPopup === "pendingPayment") list = offboardings.filter((o: any) => o.final_payment_status === "pending");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "completed" ? "success" : status === "in_progress" ? "warning" : "default";
          return list.slice(0, 100).map((o: any): KpiRow => ({
            primary: o.employees ? `${o.employees.first_name ?? ""} ${o.employees.last_name ?? ""}`.trim() : t("hr.noName"),
            secondary: o.termination_date ? format(new Date(o.termination_date), "dd MMM yyyy", { locale: f.fechas }) : undefined,
            right: o.status ? estado(o.status) : "—",
            rightTone: tone(o.status ?? ""),
          }));
        })()}
        emptyText={t("hr.kpiEmpty")}
      />
    </div>
  );
}
