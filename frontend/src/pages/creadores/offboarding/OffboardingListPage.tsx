import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LogOut, Search, ExternalLink, Plus, List, LayoutGrid, Trash2 } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useAllOffboardings } from "../useOffboarding";
import { useUserRole } from "@/hooks/useUserRole";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import InitiateOffboardingDialog from "./InitiateOffboardingDialog";
import CreadoresHeader from "../CreadoresHeader";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const STATUS_LABELS: Record<string, { key: TranslationKey; variant: string }> = {
  en_proceso: { key: "cr.offStatusInProgress" as const, variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { key: "cr.offStatusPendingApprovalShort" as const, variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { key: "cr.offStatusPendingClosureShort" as const, variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { key: "cr.offStatusDone" as const, variant: "bg-muted text-muted-foreground border-border" },
};

const CATEGORIAS = [
  { value: "voluntaria", key: "cr.offCatVoluntary" as const },
  { value: "involuntaria", key: "cr.offCatInvoluntary" as const },
  { value: "mutuo_acuerdo", key: "cr.offCatMutual" as const },
  { value: "incumplimiento", key: "cr.offCatBreach" as const },
  { value: "otro", key: "cr.offCatOther" as const },
];

const OffboardingListPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: offboardings, isLoading, refetch } = useAllOffboardings();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [deletingId, setDeletingId] = useState<{ id: string; name: string } | null>(null);

  const deleteOffboarding = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_offboardings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-offboardings"] });
      toast.success(t("cr.offDeleted"));
      setDeletingId(null);
    },
    onError: (err: any) => {
      toast.error(t("common.errorDeleting"), { description: err.message });
    },
  });

  const filtered = (offboardings ?? []).filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (categoryFilter && o.categoria !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        o.creator_name?.toLowerCase().includes(q) ||
        o.artistic_name?.toLowerCase().includes(q) ||
        o.instagram_handle?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (dateFrom || dateTo) {
      const d = o.exit_date ? new Date(o.exit_date) : o.created_at ? new Date(o.created_at) : null;
      if (!d) return false;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
    }
    return true;
  });

  const stats = {
    total: offboardings?.length ?? 0,
    enProceso: offboardings?.filter((o) => o.status === "en_proceso").length ?? 0,
    pendientes: offboardings?.filter((o) => o.status === "pendiente_aprobacion" || o.status === "pendiente_cierre").length ?? 0,
    finalizados: offboardings?.filter((o) => o.status === "finalizado").length ?? 0,
  };

  return (
    <>
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <CreadoresHeader
          action={
            <Button onClick={() => setInitiateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t("creadores.off.start")}
            </Button>
          }
        />

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <InitiateOffboardingDialog
              open={initiateOpen}
              onOpenChange={setInitiateOpen}
              onSuccess={() => refetch()}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t("cr.total"), value: stats.total, color: "text-foreground" },
                { label: t("cr.offStatusInProgress"), value: stats.enProceso, color: "text-primary" },
                { label: t("common.pendingPl"), value: stats.pendientes, color: "text-warning" },
                { label: t("creadores.off.finished"), value: stats.finalizados, color: "text-muted-foreground" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("cr.offSearchPh")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t("common.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t("common.all")}</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([val, { key: claveEstado }]) => (
                    <SelectItem key={val} value={val}>{t(claveEstado)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter || undefined} onValueChange={(v) => setCategoryFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t("common.category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t("common.all")}</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{t(c.key)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} placeholder={t("creadores.off.selectDates")} onApply={(from, to) => { setDateFrom(from); setDateTo(to); }} />
              <div className="flex items-center border border-border rounded-md overflow-hidden ml-auto">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  onClick={() => setViewMode("table")}
                  aria-label={t("creadores.list.tableView")}
                  title={t("creadores.list.tableView")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  onClick={() => setViewMode("grid")}
                  aria-label={t("creadores.list.gridView")}
                  title={t("creadores.list.gridView")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">{t("cr.offNotFound")}</div>
            ) : viewMode === "table" ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("cr.creator")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead>{t("common.category")}</TableHead>
                        <TableHead>{t("cr.exitDateShort")}</TableHead>
                        <TableHead>{t("creadores.off.approvals")}</TableHead>
                        <TableHead>Checklist</TableHead>
                        <TableHead className="text-right">{t("creadores.dash.lostRevenue")}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((o) => {
                        const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.en_proceso;
                        const checkDone = [o.check_pagos, o.check_material, o.check_campanas, o.check_accesos, o.check_documentacion].filter(Boolean).length;
                        return (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/creadores/offboarding/${o.id}`)}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{o.creator_name ?? "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {o.artistic_name ?? o.instagram_handle ?? ""}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] ${st.variant}`}>{t(st.key)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {(() => { const c = CATEGORIAS.find((x) => x.value === o.categoria); return c ? t(c.key) : "—"; })()}
                            </TableCell>
                            <TableCell className="text-sm">{o.exit_date ?? "—"}</TableCell>
                            <TableCell className="text-sm">{o.approval_count ?? 0}/2</TableCell>
                            <TableCell className="text-sm">{checkDone}/5</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {o.estimated_lost_revenue != null
                                ? `$${Number(o.estimated_lost_revenue).toLocaleString()}`
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  aria-label={t("creadores.off.openProfile")}
                                  title={t("creadores.off.openProfile")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/creadores/${o.creator_id}`);
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    aria-label={t("common.delete")}
                                    title={t("common.delete")}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingId({ id: o.id, name: o.creator_name ?? "—" });
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((o) => {
                  const st = STATUS_LABELS[o.status] ?? STATUS_LABELS.en_proceso;
                  const checkDone = [o.check_pagos, o.check_material, o.check_campanas, o.check_accesos, o.check_documentacion].filter(Boolean).length;
                  return (
                    <Card
                      key={o.id}
                      className="cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => navigate(`/creadores/offboarding/${o.id}`)}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm">{o.creator_name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{o.artistic_name ?? o.instagram_handle ?? ""}</p>
                          </div>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${st.variant}`}>{t(st.key)}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">{t("common.category")}</span>
                            <p className="font-medium">{(() => { const c = CATEGORIAS.find((x) => x.value === o.categoria); return c ? t(c.key) : "—"; })()}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t("cr.exitDateShort")}</span>
                            <p className="font-medium">{o.exit_date ?? "—"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t("creadores.off.approvals")}</span>
                            <p className="font-medium">{o.approval_count ?? 0}/2</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Checklist</span>
                            <p className="font-medium">{checkDone}/5</p>
                          </div>
                        </div>
                        {o.estimated_lost_revenue != null && (
                          <div className="pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">{t("creadores.dash.lostRevenue")}</span>
                            <p className="text-sm font-bold text-destructive">${Number(o.estimated_lost_revenue).toLocaleString()}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
        </div>
      </main>

    <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cr.offDeleteQ")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("cr.offDeleteDescA")}<strong>{deletingId?.name}</strong>{t("cr.offDeleteDescB")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingId && deleteOffboarding.mutate(deletingId.id)}
            disabled={deleteOffboarding.isPending}
          >
            {deleteOffboarding.isPending ? t("cr.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default OffboardingListPage;
