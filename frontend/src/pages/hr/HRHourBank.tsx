import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Search, ListIcon, LayoutGrid, Eye, Pencil, Trash2,
  Plus, Banknote, Users, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/UserAvatar";
import { Progress } from "@/components/ui/progress";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

const MAX_BALANCE = 40;

const HRHourBank = () => {
  const { t } = useLanguage();
  const f = useFormato();
  const DMY = f.idioma === "en" ? "MM/dd/yyyy" : "dd/MM/yyyy";
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("balances");
  type KpiKey = "total" | "avg" | "high" | "low";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [viewData, setViewData] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formHours, setFormHours] = useState("");
  const [formReason, setFormReason] = useState("");

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["hour_bank"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hour_bank")
        .select("*, employees(first_name, last_name, email, profile_photo_url)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { error } = await supabase.from("hour_bank").insert(vals);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hour_bank"] });
      toast({ title: t("hr.bank.saved") });
      setAddOpen(false); setWithdrawOpen(false); resetForm();
    },
    onError: () => toast({ title: t("hr.bank.errorSaving"), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { id, ...rest } = vals;
      const { error } = await supabase.from("hour_bank").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hour_bank"] });
      toast({ title: t("hr.bank.updated") });
      setEditData(null); resetForm();
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hour_bank").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hour_bank"] });
      toast({ title: t("hr.bank.deleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  function resetForm() { setFormEmployeeId(""); setFormHours(""); setFormReason(""); }

  function openEdit(r: any) {
    setFormEmployeeId(r.employee_id);
    setFormHours(String(r.hours));
    setFormReason(r.reason || "");
    setEditData(r);
  }

  function handleSubmit(type: "deposit" | "withdrawal") {
    if (!formEmployeeId || !formHours) {
      toast({ title: t("common.requiredFields"), variant: "destructive" }); return;
    }
    if (editData) {
      editMutation.mutate({ id: editData.id, hours: Number(formHours), reason: formReason || null });
    } else {
      createMutation.mutate({
        employee_id: formEmployeeId,
        hours: Number(formHours),
        movement_type: type,
        reason: formReason || null,
      });
    }
  }

  // ─── Balances ─────────────────────────────────────────────────────────────
  const balances = useMemo(() => {
    const map: Record<string, { employee: any; balance: number; lastMov: string }> = {};
    movements.forEach((m: any) => {
      if (!map[m.employee_id]) {
        map[m.employee_id] = { employee: m.employees, balance: 0, lastMov: m.created_at };
      }
      map[m.employee_id].balance += m.movement_type === "deposit" ? Number(m.hours) : -Number(m.hours);
      if (m.created_at > map[m.employee_id].lastMov) map[m.employee_id].lastMov = m.created_at;
    });
    return Object.entries(map).map(([id, v]) => ({ employee_id: id, ...v }));
  }, [movements]);

  const filteredMovements = useMemo(() => {
    if (!search) return movements;
    const q = search.toLowerCase();
    return movements.filter((m: any) => {
      const emp = m.employees;
      return emp && `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q);
    });
  }, [movements, search]);

  const filteredBalances = useMemo(() => {
    if (!search) return balances;
    const q = search.toLowerCase();
    return balances.filter((b) => {
      const emp = b.employee;
      return emp && `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q);
    });
  }, [balances, search]);

  // KPIs
  const totalAccumulated = balances.reduce((a, b) => a + Math.max(0, b.balance), 0);
  const avgPerEmployee = balances.length ? totalAccumulated / balances.length : 0;
  const highBalance = balances.filter((b) => b.balance > 30).length;
  const lowBalance = balances.filter((b) => b.balance < 10 && b.balance >= 0).length;

  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const formModal = (isOpen: boolean, type: "deposit" | "withdrawal") => (
    <Dialog open={isOpen || !!editData} onOpenChange={(o) => {
      if (!o) { setAddOpen(false); setWithdrawOpen(false); setEditData(null); resetForm(); }
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? t("hr.bank.editMovement") : type === "deposit" ? t("hr.bank.addHours") : t("hr.bank.logUsage")}</DialogTitle>
          <DialogDescription>{editData ? t("hr.bank.editDesc") : type === "deposit" ? t("hr.bank.addDesc") : t("hr.bank.usageDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("hr.employee")} *</Label>
            <EmployeeSearchCombobox value={formEmployeeId} onChange={setFormEmployeeId} />
          </div>
          <div>
            <Label>{t("common.hours")} *</Label>
            <Input type="number" min="0" step="0.5" value={formHours} onChange={(e) => setFormHours(e.target.value)} placeholder={t("hr.bank.hoursExample")} />
          </div>
          <div>
            <Label>{t("common.reason")}</Label>
            <Textarea value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder={t("hr.bank.reasonPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setAddOpen(false); setWithdrawOpen(false); setEditData(null); resetForm(); }}>{t("common.cancel")}</Button>
          <Button onClick={() => handleSubmit(editData ? editData.movement_type : type)} disabled={createMutation.isPending || editMutation.isPending}>
            {editData ? t("hr.saveChanges") : type === "deposit" ? t("hr.bank.addHours") : t("hr.bank.logUsage")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hr/horarios")}><ArrowLeft className="h-4 w-4" /></Button>
          <PageHeader
            className="flex-1"
            title={t("hr.bank.title")}
            subtitle={t("hr.bank.subtitle")}
            actions={
              <>
                <Button variant="outline" onClick={() => { resetForm(); setWithdrawOpen(true); }}>{t("hr.bank.logUsage")}</Button>
                <Button onClick={() => { resetForm(); setAddOpen(true); }}><Plus className="h-4 w-4 mr-2" /> {t("hr.bank.addHours")}</Button>
              </>
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatChip label={t("hr.bank.totalAccrued")} value={`${totalAccumulated.toFixed(1)}h`} icon={<Banknote className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("total")} />
          <StatChip label={t("hr.bank.avgPerEmployee")} value={`${avgPerEmployee.toFixed(1)}h`} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("avg")} />
          <StatChip label={t("hr.bank.highBalance")} value={String(highBalance)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-success" onClick={() => setKpiPopup("high")} />
          <StatChip label={t("hr.bank.lowBalance")} value={String(lowBalance)} icon={<TrendingDown className="h-3.5 w-3.5" />} color="bg-warning" onClick={() => setKpiPopup("low")} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hr.searchEmployee")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="balances">{t("hr.bank.balances")}</TabsTrigger>
            <TabsTrigger value="movimientos">{t("hr.bank.movements")}</TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="mt-4">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="text-xs">{t("hr.employee")}</TableHead>
                      <TableHead className="text-xs">{t("hr.bank.balance")}</TableHead>
                      <TableHead className="text-xs">{t("hr.progress")}</TableHead>
                      <TableHead className="text-xs">{t("hr.bank.lastMovement")}</TableHead>
                      <TableHead className="text-xs sticky right-0 bg-card">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBalances.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("common.noData")}</TableCell></TableRow>
                    ) : filteredBalances.map((b) => {
                      const emp = b.employee;
                      const pct = Math.min(100, Math.max(0, (b.balance / MAX_BALANCE) * 100));
                      return (
                        <TableRow key={b.employee_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" className="h-7 w-7" />
                              <span className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{b.balance.toFixed(1)}h / {MAX_BALANCE}h</TableCell>
                          <TableCell><Progress value={pct} className="h-2 w-24" /></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(parseISO(b.lastMov), DMY)}</TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            <Button variant="ghost" size="sm" onClick={() => { setTab("movimientos"); setSearch(emp ? emp.first_name : ""); }}><Eye className="h-3.5 w-3.5" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="movimientos" className="mt-4">
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="text-xs">{t("hr.employee")}</TableHead>
                      <TableHead className="text-xs">{t("common.type")}</TableHead>
                      <TableHead className="text-xs">{t("common.hours")}</TableHead>
                      <TableHead className="text-xs">{t("common.reason")}</TableHead>
                      <TableHead className="text-xs">{t("common.date")}</TableHead>
                      <TableHead className="text-xs sticky right-0 bg-card">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMovements.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("hr.bank.noMovements")}</TableCell></TableRow>
                    ) : filteredMovements.map((m: any) => {
                      const emp = m.employees;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" className="h-7 w-7" />
                              <span className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs gap-1", m.movement_type === "deposit" ? "text-success border-success/30" : "text-warning border-warning/30")}>
                              {m.movement_type === "deposit" ? <ArrowUpCircle className="h-3 w-3" /> : <ArrowDownCircle className="h-3 w-3" />}
                              {m.movement_type === "deposit" ? t("hr.bank.deposit") : t("hr.bank.withdrawal")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{m.hours}h</TableCell>
                          <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{m.reason || "—"}</TableCell>
                          <TableCell className="text-sm">{format(parseISO(m.created_at), DMY)}</TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setViewData(m)}><Eye className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Hours Modal */}
      {formModal(addOpen, "deposit")}
      {/* Withdraw Modal */}
      {!addOpen && !editData && formModal(withdrawOpen, "withdrawal")}

      {/* View Modal */}
      <Dialog open={!!viewData} onOpenChange={(o) => !o && setViewData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("hr.bank.movementDetail")}</DialogTitle></DialogHeader>
          {viewData && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">{t("hr.employee")}:</span> <span className="font-medium">{viewData.employees ? `${viewData.employees.first_name} ${viewData.employees.last_name}` : "—"}</span></div>
              <div><span className="text-muted-foreground">{t("common.type")}:</span> {viewData.movement_type === "deposit" ? t("hr.bank.deposit") : t("hr.bank.withdrawal")}</div>
              <div><span className="text-muted-foreground">{t("common.hours")}:</span> {viewData.hours}h</div>
              <div><span className="text-muted-foreground">{t("common.date")}:</span> {format(parseISO(viewData.created_at), `${DMY} HH:mm`)}</div>
              {viewData.reason && <div><span className="text-muted-foreground">{t("common.reason")}:</span> {viewData.reason}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.deleteRecordTitle")}</AlertDialogTitle>
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
        title={(() => {
          switch (kpiPopup) {
            case "total": return `${t("hr.bank.totalAccrued")} — ${totalAccumulated.toFixed(1)}h`;
            case "avg": return `${t("hr.bank.avgPerEmployeeLong")} — ${avgPerEmployee.toFixed(1)}h`;
            case "high": return `${t("hr.bank.highBalance")} — ${highBalance}`;
            case "low": return `${t("hr.bank.lowBalance")} — ${lowBalance}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = balances;
          if (kpiPopup === "high") list = balances.filter((b: any) => b.balance > 30);
          else if (kpiPopup === "low") list = balances.filter((b: any) => b.balance < 10 && b.balance >= 0);
          return list.slice(0, 100).map((b: any): KpiRow => ({
            primary: `${b.employee?.first_name ?? ""} ${b.employee?.last_name ?? ""}`.trim() || t("hr.noName"),
            secondary: b.employee?.email ?? undefined,
            right: `${b.balance.toFixed(1)}h`,
            rightTone: b.balance > 30 ? "success" : b.balance < 10 ? "warning" : "default",
          }));
        })()}
        emptyText={t("hr.kpiEmpty")}
      />
    </div>
  );
};

export default HRHourBank;
