import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Clock, Search, ListIcon, LayoutGrid, Eye, Plus, Pencil, Trash2,
  Check, X, Timer, CheckCircle2, Banknote, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { UserAvatar } from "@/components/UserAvatar";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { CalendarIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { Traductor } from "./etiquetasHr";

// `value` es lo que se guarda en overtime.overtime_type: DATO, no se traduce.
const OVERTIME_TYPES: { value: string; label: TranslationKey }[] = [
  { value: "diurno", label: "hrg.ot.type.day" },
  { value: "nocturno", label: "hrg.ot.type.night" },
  { value: "dominical", label: "hrg.ot.type.sunday" },
  { value: "nocturno_dominical", label: "hrg.ot.type.sundayNight" },
];

function tipoHorasExtra(tipo: string, t: Traductor) {
  const o = OVERTIME_TYPES.find((x) => x.value === tipo);
  return o ? t(o.label) : tipo;
}

function getStatusBadge(status: string, t: Traductor) {
  if (status === "approved") return <Badge variant="default" className="text-xs bg-success/10 text-success border-success/30">{t("hrg.approved")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("hrg.rejected")}</Badge>;
  if (status === "paid") return <Badge variant="default" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">{t("hrg.paid")}</Badge>;
  return <Badge variant="secondary" className="text-xs text-warning border-warning/30">{t("common.pending")}</Badge>;
}

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

const HROvertimeDetail = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "approved" | "paid";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [viewData, setViewData] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formType, setFormType] = useState("diurno");
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formHours, setFormHours] = useState("");
  const [formRate, setFormRate] = useState("1.25");
  const [formNotes, setFormNotes] = useState("");

  const { data: overtime = [], isLoading } = useQuery({
    queryKey: ["overtime"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("overtime")
        .select("*, employees(first_name, last_name, email, profile_photo_url)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { error } = await supabase.from("overtime").insert(vals);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["overtime"] }); toast({ title: t("hrg.ot.created") }); setCreateOpen(false); resetForm(); },
    onError: () => toast({ title: t("hrg.ot.createError"), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { id, ...rest } = vals;
      const { error } = await supabase.from("overtime").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["overtime"] }); toast({ title: t("hrg.recordUpdated") }); setEditData(null); resetForm(); },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("overtime").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["overtime"] }); toast({ title: t("hrg.recordDeleted") }); setDeleteId(null); },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("overtime").update({ status, approved_at: status === "approved" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["overtime"] }); toast({ title: t("hrg.statusUpdated") }); },
  });

  function resetForm() {
    setFormEmployeeId(""); setFormType("diurno"); setFormDate(undefined);
    setFormHours(""); setFormRate("1.25"); setFormNotes("");
  }

  function openEdit(r: any) {
    setFormEmployeeId(r.employee_id);
    setFormType(r.overtime_type);
    setFormDate(parseISO(r.date));
    setFormHours(String(r.hours));
    setFormRate(String(r.rate_multiplier));
    setFormNotes(r.notes || "");
    setEditData(r);
  }

  function handleSubmit() {
    if (!formEmployeeId || !formDate || !formHours) {
      toast({ title: t("common.requiredFields"), variant: "destructive" }); return;
    }
    const vals: any = {
      employee_id: formEmployeeId,
      overtime_type: formType,
      date: format(formDate, "yyyy-MM-dd"),
      hours: Number(formHours),
      rate_multiplier: Number(formRate),
      notes: formNotes || null,
    };
    if (editData) editMutation.mutate({ id: editData.id, ...vals });
    else createMutation.mutate(vals);
  }

  const filtered = useMemo(() => {
    let result = overtime;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((r: any) => {
        const emp = r.employees;
        return emp && (`${emp.first_name} ${emp.last_name}`).toLowerCase().includes(q);
      });
    }
    if (statusFilter !== "all") result = result.filter((r: any) => r.status === statusFilter);
    return result;
  }, [overtime, search, statusFilter]);

  // KPIs
  const totalHours = overtime.reduce((a: number, r: any) => a + Number(r.hours), 0);
  const pendingCount = overtime.filter((r: any) => r.status === "pending").length;
  const approvedCount = overtime.filter((r: any) => r.status === "approved").length;
  const paidCount = overtime.filter((r: any) => r.status === "paid").length;

  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hr/horarios")}><ArrowLeft className="h-4 w-4" /></Button>
          <PageHeader
            className="flex-1"
            title={t("hrg.ot.title")}
            subtitle={t("hrg.ot.subtitle")}
            actions={<Button onClick={() => { resetForm(); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" /> {t("hrg.ot.register")}</Button>}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatChip label={t("hrg.ot.kpi.totalHours")} value={`${totalHours}h`} icon={<Timer className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("total")} />
          <StatChip label={t("common.pendingPl")} value={String(pendingCount)} icon={<AlertCircle className="h-3.5 w-3.5" />} color="bg-warning" onClick={() => setKpiPopup("pending")} />
          <StatChip label={t("hrg.ot.kpi.approved")} value={String(approvedCount)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-success" onClick={() => setKpiPopup("approved")} />
          <StatChip label={t("hrg.ot.kpi.paid")} value={String(paidCount)} icon={<Banknote className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("paid")} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hrg.searchEmployee")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              <SelectItem value="pending">{t("common.pending")}</SelectItem>
              <SelectItem value="approved">{t("hrg.approved")}</SelectItem>
              <SelectItem value="rejected">{t("hrg.rejected")}</SelectItem>
              <SelectItem value="paid">{t("hrg.paid")}</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center border rounded-lg">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")} aria-label={t("hrg.dir.viewTable")}><ListIcon className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>

        {viewMode === "list" ? (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">{t("hrg.employee")}</TableHead>
                    <TableHead className="text-xs">{t("common.date")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.hours")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.ot.rate")}</TableHead>
                    <TableHead className="text-xs">{t("common.type")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("hrg.ot.empty")}</TableCell></TableRow>
                  ) : filtered.map((r: any) => {
                    const emp = r.employees;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" className="h-7 w-7" />
                            <div>
                              <p className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                              <p className="text-xs text-muted-foreground">{emp?.email || ""}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{format(parseISO(r.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-sm font-medium">{r.hours}h</TableCell>
                        <TableCell className="text-sm">x{r.rate_multiplier}</TableCell>
                        <TableCell className="text-sm">{tipoHorasExtra(r.overtime_type, t)}</TableCell>
                        <TableCell>{getStatusBadge(r.status, t)}</TableCell>
                        <TableCell className="sticky right-0 bg-card">
                          <div className="flex items-center gap-1">
                            {r.status === "pending" && (
                              <>
                                <Button variant="ghost" size="sm" className="text-success" onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}><Check className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setViewData(r)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-10 text-muted-foreground">{t("hrg.ot.emptyShort")}</div>
            ) : filtered.map((r: any) => {
              const emp = r.employees;
              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                          <p className="text-xs text-muted-foreground">{emp?.email}</p>
                        </div>
                      </div>
                      {getStatusBadge(r.status, t)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>📅 {format(parseISO(r.date), "dd/MM/yyyy")} · {r.hours}h · x{r.rate_multiplier}</p>
                      <p>{t("common.type")}: {tipoHorasExtra(r.overtime_type, t)}</p>
                      {r.notes && <p className="truncate">{r.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 pt-2 border-t">
                      {r.status === "pending" && (
                        <>
                          <Button variant="ghost" size="sm" className="text-success" onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })}><Check className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })}><X className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setViewData(r)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={createOpen || !!editData} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditData(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editData ? t("hrg.ot.editTitle") : t("hrg.ot.register")}</DialogTitle>
            <DialogDescription>{editData ? t("hrg.ot.editHint") : t("hrg.ot.registerHint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("hrg.employeeRequired")}</Label>
              <EmployeeSearchCombobox value={formEmployeeId} onChange={setFormEmployeeId} />
            </div>
            <div>
              <Label>{t("common.type")} *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERTIME_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.date")} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formDate ? format(formDate, "dd/MM/yyyy") : t("common.select")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formDate} onSelect={setFormDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("hrg.hours")} *</Label>
                <Input type="number" min="0" step="0.5" value={formHours} onChange={(e) => setFormHours(e.target.value)} placeholder={t("hrg.ot.hoursPlaceholder")} />
              </div>
              <div>
                <Label>{t("hrg.ot.multiplier")}</Label>
                <Input type="number" min="1" step="0.25" value={formRate} onChange={(e) => setFormRate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t("common.reason")}</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder={t("hrg.ot.reasonPlaceholder")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditData(null); resetForm(); }}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || editMutation.isPending}>
              {editData ? t("hrg.saveChanges") : t("hrg.att.registerShort")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={!!viewData} onOpenChange={(o) => !o && setViewData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("hrg.ot.detailTitle")}</DialogTitle></DialogHeader>
          {viewData && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">{t("hrg.employee")}:</span> <span className="font-medium">{viewData.employees ? `${viewData.employees.first_name} ${viewData.employees.last_name}` : "—"}</span></div>
              <div><span className="text-muted-foreground">{t("common.date")}:</span> {format(parseISO(viewData.date), "dd/MM/yyyy")}</div>
              <div><span className="text-muted-foreground">{t("hrg.hours")}:</span> {viewData.hours}h · {t("hrg.ot.rate")}: x{viewData.rate_multiplier}</div>
              <div><span className="text-muted-foreground">{t("common.type")}:</span> {tipoHorasExtra(viewData.overtime_type, t)}</div>
              <div><span className="text-muted-foreground">{t("common.status")}:</span> {getStatusBadge(viewData.status, t)}</div>
              {viewData.notes && <div><span className="text-muted-foreground">{t("hrg.notes")}:</span> {viewData.notes}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hrg.deleteRecordTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("hrg.noRecordsToShow")}
        title={(() => {
          switch (kpiPopup) {
            case "total": return t("hrg.kpiTitle", { label: t("hrg.ot.kpi.totalOvertime"), value: `${totalHours}h` });
            case "pending": return t("hrg.kpiTitle", { label: t("common.pendingPl"), value: pendingCount });
            case "approved": return t("hrg.kpiTitle", { label: t("hrg.ot.kpi.approved"), value: approvedCount });
            case "paid": return t("hrg.kpiTitle", { label: t("hrg.ot.kpi.paid"), value: paidCount });
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = overtime;
          if (kpiPopup === "pending") list = overtime.filter((r: any) => r.status === "pending");
          else if (kpiPopup === "approved") list = overtime.filter((r: any) => r.status === "approved");
          else if (kpiPopup === "paid") list = overtime.filter((r: any) => r.status === "paid");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "paid" ? "success" : status === "approved" ? "default" : status === "pending" ? "warning" : "default";
          return list.slice(0, 100).map((r: any): KpiRow => ({
            primary: r.employees ? `${r.employees.first_name ?? ""} ${r.employees.last_name ?? ""}`.trim() : t("hrg.noName"),
            secondary: r.date ? format(new Date(r.date), "dd MMM yyyy") : undefined,
            right: `${r.hours}h`,
            rightTone: tone(r.status ?? ""),
          }));
        })()}
      />
    </div>
  );
};

export default HROvertimeDetail;
