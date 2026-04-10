import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardTopbar from "@/components/dashboard/DashboardTopbar";
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

const STATUS_LABELS: Record<string, { label: string; variant: string }> = {
  en_proceso: { label: "En Proceso", variant: "bg-primary/15 text-primary border-primary/30" },
  pendiente_aprobacion: { label: "Pend. Aprobación", variant: "bg-warning/15 text-warning border-warning/30" },
  pendiente_cierre: { label: "Pend. Cierre", variant: "bg-accent/15 text-accent-foreground border-accent/30" },
  finalizado: { label: "Finalizado", variant: "bg-muted text-muted-foreground border-border" },
};

const CATEGORIAS = [
  { value: "voluntaria", label: "Voluntaria" },
  { value: "involuntaria", label: "Involuntaria" },
  { value: "mutuo_acuerdo", label: "Mutuo Acuerdo" },
  { value: "incumplimiento", label: "Incumplimiento" },
  { value: "otro", label: "Otro" },
];

const OffboardingListPage = () => {
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
      toast.success("Registro de offboarding eliminado");
      setDeletingId(null);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar", { description: err.message });
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardTopbar />
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <LogOut className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Offboarding</h1>
                  <p className="text-sm text-muted-foreground">Gestión centralizada de procesos de salida</p>
                </div>
              </div>
              <Button onClick={() => setInitiateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Iniciar Offboarding
              </Button>
            </div>

            <InitiateOffboardingDialog
              open={initiateOpen}
              onOpenChange={setInitiateOpen}
              onSuccess={() => refetch()}
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total", value: stats.total, color: "text-foreground" },
                { label: "En Proceso", value: stats.enProceso, color: "text-primary" },
                { label: "Pendientes", value: stats.pendientes, color: "text-warning" },
                { label: "Finalizados", value: stats.finalizados, color: "text-muted-foreground" },
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
                  placeholder="Buscar por nombre o Instagram..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter || undefined} onValueChange={(v) => setCategoryFilter(v === "_all" ? "" : v)}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} onApply={(from, to) => { setDateFrom(from); setDateTo(to); }} />
              <div className="flex items-center border border-border rounded-md overflow-hidden ml-auto">
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  onClick={() => setViewMode("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No se encontraron offboardings</div>
            ) : viewMode === "table" ? (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creator</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Fecha Salida</TableHead>
                        <TableHead>Aprobaciones</TableHead>
                        <TableHead>Checklist</TableHead>
                        <TableHead className="text-right">Revenue Perdido</TableHead>
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
                              <Badge variant="outline" className={`text-[10px] ${st.variant}`}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {CATEGORIAS.find((c) => c.value === o.categoria)?.label ?? "—"}
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
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${st.variant}`}>{st.label}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Categoría</span>
                            <p className="font-medium">{CATEGORIAS.find((c) => c.value === o.categoria)?.label ?? "—"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Fecha Salida</span>
                            <p className="font-medium">{o.exit_date ?? "—"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Aprobaciones</span>
                            <p className="font-medium">{o.approval_count ?? 0}/2</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Checklist</span>
                            <p className="font-medium">{checkDone}/5</p>
                          </div>
                        </div>
                        {o.estimated_lost_revenue != null && (
                          <div className="pt-2 border-t border-border">
                            <span className="text-xs text-muted-foreground">Revenue Perdido</span>
                            <p className="text-sm font-bold text-destructive">${Number(o.estimated_lost_revenue).toLocaleString()}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>

    <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar registro de offboarding?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará el registro de offboarding de <strong>{deletingId?.name}</strong>. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deletingId && deleteOffboarding.mutate(deletingId.id)}
            disabled={deleteOffboarding.isPending}
          >
            {deleteOffboarding.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default OffboardingListPage;
