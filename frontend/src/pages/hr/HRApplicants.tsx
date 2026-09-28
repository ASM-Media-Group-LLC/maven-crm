import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCheck, Users, Clock, CheckCircle, Plus, Eye, Pencil, Trash2,
  Search, X, ListIcon, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DataTableShell from "@/components/ui/data-table-shell";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { APPLICANT_STATUSES, APPLICANT_SOURCES } from "@/lib/hrConstants";
import { APPLICANT_STATUS_COLORS } from "@/lib/hrAreaUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useDepartments } from "@/hooks/useEmployees";
import { PhoneInput } from "@/components/ui/phone-input";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";
import { etiquetaHrO } from "./etiquetasHr";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApplicantRecord {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  position_applied: string | null;
  department_id: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  departments: { name: string } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useApplicants() {
  return useQuery({
    queryKey: ["applicants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applicants")
        .select("*, departments(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApplicantRecord[];
    },
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (parts[0]?.[0] ?? "?").toUpperCase();
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRApplicants() {
  const navigate = useNavigate();
  const { data: applicants = [], isLoading } = useApplicants();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const estado = (s: string) => etiquetaHrO(t, "applStatus", s);
  const fuente = (s: string | null) => etiquetaHrO(t, "applSource", s);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "interview" | "hired";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [appPage, setAppPage] = useState(1);
  const [appPageSize, setAppPageSize] = useState(25);

  // Modals
  const [viewItem, setViewItem] = useState<ApplicantRecord | null>(null);
  const [editItem, setEditItem] = useState<ApplicantRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<ApplicantRecord | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", phone: "", position_applied: "", department_id: "", source: "", status: "", notes: "" });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("applicants").update({
        full_name: editForm.full_name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        position_applied: editForm.position_applied || null,
        department_id: editForm.department_id || null,
        source: editForm.source || null,
        status: editForm.status,
        notes: editForm.notes || null,
      }).eq("id", editItem!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      toast({ title: t("hrg.appl.updated") });
      setEditItem(null);
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("applicants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      toast({ title: t("hrg.appl.deleted") });
      setDeleteItem(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalPending = applicants.filter((a) => a.status === "applied" || a.status === "reviewing").length;
  const totalInterview = applicants.filter((a) => a.status === "interview").length;
  const totalHired = applicants.filter((a) => a.status === "hired").length;

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter;

  const filtered = applicants.filter((a) => {
    const matchSearch = !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email?.toLowerCase().includes(search.toLowerCase()) || a.position_applied?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || a.status === statusFilter;
    const matchDept = !deptTab || a.department_id === deptTab;
    return matchSearch && matchStatus && matchDept;
  });

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
  }

  function openEdit(item: ApplicantRecord) {
    setEditForm({
      full_name: item.full_name,
      email: item.email ?? "",
      phone: item.phone ?? "",
      position_applied: item.position_applied ?? "",
      department_id: item.department_id ?? "",
      source: item.source ?? "",
      status: item.status,
      notes: item.notes ?? "",
    });
    setEditItem(item);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("hrg.appl.title")}
          subtitle={t("hrg.appl.subtitle")}
          actions={
            <Button size="sm" onClick={() => navigate("/hr/candidatos/nuevo")}>
              <Plus className="h-4 w-4 mr-1" />{t("hrg.appl.newTitle")}
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
              <StatChip label={t("hrg.appl.kpi.total")} value={String(applicants.length)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hrg.allRecords")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("common.pendingPl")} value={String(totalPending)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={applicants.length > 0 ? t("hrg.ofTotal", { pct: ((totalPending / applicants.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("pending")} />
              <StatChip label={t("hrg.appl.kpi.interview")} value={String(totalInterview)} icon={<UserCheck className="h-3.5 w-3.5" />} color="bg-primary" hint={applicants.length > 0 ? t("hrg.ofTotal", { pct: ((totalInterview / applicants.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("interview")} />
              <StatChip label={t("hrg.appl.kpi.hired")} value={String(totalHired)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={applicants.length > 0 ? t("hrg.ofTotal", { pct: ((totalHired / applicants.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("hired")} />
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
            <Input placeholder={t("hrg.appl.searchPlaceholder")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {APPLICANT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{estado(s.value)}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")} aria-label={t("hrg.dir.viewTable")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" />{t("hrg.clearFilters")}
            </Button>
          )}
        </div>

        {/* ── Table View ──────────────────────────────────────────────────── */}
        {viewMode === "list" ? (
          <DataTableShell
            currentPage={appPage}
            totalPages={Math.max(1, Math.ceil(filtered.length / appPageSize))}
            totalCount={filtered.length}
            pageSize={appPageSize}
            onPageChange={setAppPage}
            onPageSizeChange={(s) => { setAppPageSize(s); setAppPage(1); }}
          >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("common.name")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("common.email")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("hrg.position")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("common.area")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("hrg.source")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("common.date")}</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                    <TableHead className="sticky top-0 right-0 z-20 bg-card text-xs font-medium text-muted-foreground">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        {applicants.length === 0 ? (
                          <EmptyState seed="hr-candidatos" title={t("hrg.appl.empty")} description={t("hrg.appl.emptyHint")} />
                        ) : (
                          <EmptyState seed="hr-candidatos" title={t("common.noResultsShort")} description={t("common.noMatches")} />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.slice((appPage - 1) * appPageSize, appPage * appPageSize).map((app) => {
                      const initials = getInitials(app.full_name);
                      const statusColors = APPLICANT_STATUS_COLORS[app.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                      return (
                        <TableRow key={app.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <p className="text-sm font-medium">{app.full_name}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{app.email ?? "—"}</TableCell>
                          <TableCell className="text-sm max-w-40 truncate">{app.position_applied ?? "—"}</TableCell>
                          <TableCell>
                            {app.departments?.name ? (
                              <Badge variant="secondary" className="text-xs">{app.departments.name}</Badge>
                            ) : <span className="text-sm text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {fuente(app.source)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(app.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                              {estado(app.status)}
                            </span>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(app)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(app)}><Pencil className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.edit")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(app)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
          </DataTableShell>
        ) : (
          /* ── Grid View ──────────────────────────────────────────────────── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full">
                {applicants.length === 0 ? (
                  <EmptyState seed="hr-candidatos" title={t("hrg.appl.empty")} description={t("hrg.appl.emptyHint")} />
                ) : (
                  <EmptyState seed="hr-candidatos" title={t("common.noResultsShort")} description={t("common.noMatches")} />
                )}
              </div>
            ) : (
              filtered.map((app) => {
                const initials = getInitials(app.full_name);
                const statusColors = APPLICANT_STATUS_COLORS[app.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                return (
                  <Card key={app.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{app.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{app.email ?? t("hrg.noEmail")}</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                          {estado(app.status)}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">{t("hrg.position")}:</span> {app.position_applied ?? "—"}</p>
                        {app.departments?.name && <p><span className="font-medium text-foreground">{t("common.area")}:</span> {app.departments.name}</p>}
                        <p><span className="font-medium text-foreground">{t("hrg.source")}:</span> {fuente(app.source)}</p>
                        <p><span className="font-medium text-foreground">{t("common.date")}:</span> {format(new Date(app.created_at), "dd/MM/yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-border">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(app)}><Eye className="h-3 w-3 mr-1" />{t("common.view")}</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(app)}><Pencil className="h-3 w-3 mr-1" />{t("common.edit")}</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(app)}><Trash2 className="h-3 w-3 mr-1" />{t("common.delete")}</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── View Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("hrg.appl.detailTitle")}</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">{t("common.name")}</p><p className="font-medium">{viewItem.full_name}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("common.email")}</p><p>{viewItem.email ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("common.phone")}</p><p>{viewItem.phone ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("hrg.position")}</p><p>{viewItem.position_applied ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("common.area")}</p><p>{viewItem.departments?.name ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("hrg.source")}</p><p>{fuente(viewItem.source)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("common.date")}</p><p>{format(new Date(viewItem.created_at), "dd/MM/yyyy")}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("common.status")}</p>
                  {(() => {
                    const c = APPLICANT_STATUS_COLORS[viewItem.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                    return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>{estado(viewItem.status)}</span>;
                  })()}
                </div>
              </div>
              {viewItem.notes && (
                <div><p className="text-xs text-muted-foreground">{t("hrg.notes")}</p><p className="whitespace-pre-wrap">{viewItem.notes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("hrg.appl.editTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.fullName")} <span className="text-destructive">*</span></Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("common.email")}</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.phone")}</Label>
                <PhoneInput value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.position")}</Label>
              <Input value={editForm.position_applied} onChange={(e) => setEditForm((f) => ({ ...f, position_applied: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hrg.department")}</Label>
                <Select value={editForm.department_id || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.source")}</Label>
                <Select value={editForm.source || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                  <SelectContent>{APPLICANT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{fuente(s.value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APPLICANT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{estado(s.value)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.notes")}</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>{t("common.cancel")}</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={!editForm.full_name || updateMutation.isPending}>
                {updateMutation.isPending ? t("hrg.saving") : t("hrg.saveChanges")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hrg.appl.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <ConFormato texto={t("hrg.appl.deleteBody")} piezas={{ name: <strong>{deleteItem?.full_name}</strong> }} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
              {deleteMutation.isPending ? t("hrg.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("hrg.noRecordsToShow")}
        title={(() => {
          switch (kpiPopup) {
            case "total": return t("hrg.kpiTitle", { label: t("hrg.appl.kpi.total"), value: applicants.length });
            case "pending": return t("hrg.kpiTitle", { label: t("common.pendingPl"), value: totalPending });
            case "interview": return t("hrg.kpiTitle", { label: t("hrg.appl.kpi.interview"), value: totalInterview });
            case "hired": return t("hrg.kpiTitle", { label: t("hrg.appl.kpi.hired"), value: totalHired });
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = applicants;
          if (kpiPopup === "pending") list = applicants.filter((a: any) => a.status === "pending" || a.status === "applied");
          else if (kpiPopup === "interview") list = applicants.filter((a: any) => a.status === "interview" || a.status === "interviewing");
          else if (kpiPopup === "hired") list = applicants.filter((a: any) => a.status === "hired");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "hired" ? "success" : status === "rejected" ? "destructive" : status === "interview" || status === "interviewing" ? "warning" : "default";
          return list.slice(0, 100).map((a: any): KpiRow => ({
            primary: a.full_name ?? t("hrg.noName"),
            secondary: a.position_applied ?? a.email ?? undefined,
            right: a.status ? estado(a.status) : "—",
            rightTone: tone(a.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
