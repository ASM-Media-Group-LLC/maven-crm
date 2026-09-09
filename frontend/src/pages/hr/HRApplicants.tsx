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
      toast({ title: "Candidato actualizado" });
      setEditItem(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("applicants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      toast({ title: "Candidato eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
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
          title="Candidatos"
          subtitle="Gestiona candidatos y conviértelos en empleados"
          actions={
            <Button size="sm" onClick={() => navigate("/hr/candidatos/nuevo")}>
              <Plus className="h-4 w-4 mr-1" />Nuevo Candidato
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
              <StatChip label="Total Candidatos" value={String(applicants.length)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint="Todos los registros" onClick={() => setKpiPopup("total")} />
              <StatChip label="Pendientes" value={String(totalPending)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={applicants.length > 0 ? `${((totalPending / applicants.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("pending")} />
              <StatChip label="En Entrevista" value={String(totalInterview)} icon={<UserCheck className="h-3.5 w-3.5" />} color="bg-primary" hint={applicants.length > 0 ? `${((totalInterview / applicants.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("interview")} />
              <StatChip label="Contratados" value={String(totalHired)} icon={<CheckCircle className="h-3.5 w-3.5" />} color="bg-success" hint={applicants.length > 0 ? `${((totalHired / applicants.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("hired")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>Todos</Button>
          {departments.map((d: any) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, email o posición..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {APPLICANT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

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
              <X className="h-3.5 w-3.5 mr-1" />Limpiar filtros
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
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Nombre</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Email</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Posición</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Área</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Fuente</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Fecha</TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="sticky top-0 right-0 z-20 bg-card text-xs font-medium text-muted-foreground">Acciones</TableHead>
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
                          <EmptyState seed="hr-candidatos" title="No hay candidatos registrados" description={'Haz clic en "Nuevo Candidato" para empezar.'} />
                        ) : (
                          <EmptyState seed="hr-candidatos" title="Sin resultados" description="No hay coincidencias con los filtros aplicados." />
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
                            {APPLICANT_SOURCES.find((s) => s.value === app.source)?.label ?? app.source ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(app.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                              {APPLICANT_STATUSES.find((s) => s.value === app.status)?.label ?? app.status}
                            </span>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(app)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(app)}><Pencil className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(app)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
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
                  <EmptyState seed="hr-candidatos" title="No hay candidatos registrados" description={'Haz clic en "Nuevo Candidato" para empezar.'} />
                ) : (
                  <EmptyState seed="hr-candidatos" title="Sin resultados" description="No hay coincidencias con los filtros aplicados." />
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
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{app.email ?? "Sin email"}</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                          {APPLICANT_STATUSES.find((s) => s.value === app.status)?.label ?? app.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Posición:</span> {app.position_applied ?? "—"}</p>
                        {app.departments?.name && <p><span className="font-medium text-foreground">Área:</span> {app.departments.name}</p>}
                        <p><span className="font-medium text-foreground">Fuente:</span> {APPLICANT_SOURCES.find((s) => s.value === app.source)?.label ?? "—"}</p>
                        <p><span className="font-medium text-foreground">Fecha:</span> {format(new Date(app.created_at), "dd/MM/yyyy")}</p>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-border">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(app)}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(app)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(app)}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
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
          <DialogHeader><DialogTitle>Detalle del Candidato</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Nombre</p><p className="font-medium">{viewItem.full_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p>{viewItem.email ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Teléfono</p><p>{viewItem.phone ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Posición</p><p>{viewItem.position_applied ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Área</p><p>{viewItem.departments?.name ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Fuente</p><p>{APPLICANT_SOURCES.find((s) => s.value === viewItem.source)?.label ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Fecha</p><p>{format(new Date(viewItem.created_at), "dd/MM/yyyy")}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  {(() => {
                    const c = APPLICANT_STATUS_COLORS[viewItem.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                    return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>{APPLICANT_STATUSES.find((s) => s.value === viewItem.status)?.label ?? viewItem.status}</span>;
                  })()}
                </div>
              </div>
              {viewItem.notes && (
                <div><p className="text-xs text-muted-foreground">Notas</p><p className="whitespace-pre-wrap">{viewItem.notes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Candidato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre Completo <span className="text-destructive">*</span></Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <PhoneInput value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Posición</Label>
              <Input value={editForm.position_applied} onChange={(e) => setEditForm((f) => ({ ...f, position_applied: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Select value={editForm.department_id || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <Select value={editForm.source || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{APPLICANT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{APPLICANT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={!editForm.full_name || updateMutation.isPending}>
                {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar candidato?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{deleteItem?.full_name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Candidatos — ${applicants.length}`;
            case "pending": return `Pendientes — ${totalPending}`;
            case "interview": return `En Entrevista — ${totalInterview}`;
            case "hired": return `Contratados — ${totalHired}`;
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
            primary: a.full_name ?? "Sin nombre",
            secondary: a.position_applied ?? a.email ?? undefined,
            right: a.status ?? "—",
            rightTone: tone(a.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
