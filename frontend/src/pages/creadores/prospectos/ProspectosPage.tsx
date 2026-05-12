import { useState } from "react";
import {
  Users, Clock, TrendingUp, Target, Plus, Eye, Pencil, Trash2, Search, X,
  ListIcon, LayoutGrid, Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneInput } from "@/components/ui/phone-input";
import KpiCard from "@/components/dashboard/KpiCard";
import StartOnboardingModal from "./StartOnboardingModal";
import {
  useProspectos, useAddProspect, useUpdateProspect, useDeleteProspect,
  PROSPECT_STATUSES, PROSPECT_STATUS_COLORS, PROSPECT_SOURCES, PROSPECT_PLATFORMS,
  AGENCY_ORDER, type ProspectRecord,
} from "./useProspectos";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (parts[0]?.[0] ?? "?").toUpperCase();
}

const emptyForm = {
  name: "", instagram: "", tiktok: "", platform: "", category: "",
  agency: "", country: "", email: "", phone: "", source: "", notes: "", status: "lead",
};

export default function ProspectosPage() {
  const { data: prospects = [], isLoading } = useProspectos();
  const addMutation = useAddProspect();
  const updateMutation = useUpdateProspect();
  const deleteMutation = useDeleteProspect();

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agencyTab, setAgencyTab] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [viewItem, setViewItem] = useState<ProspectRecord | null>(null);
  const [editItem, setEditItem] = useState<ProspectRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<ProspectRecord | null>(null);
  const [onboardItem, setOnboardItem] = useState<ProspectRecord | null>(null);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [editForm, setEditForm] = useState({ ...emptyForm });

  // KPIs
  const totalLeads = prospects.filter((p) => p.status === "lead").length;
  const totalNegociando = prospects.filter((p) => p.status === "negociando").length;
  const totalConvertidos = prospects.filter((p) => p.status === "convertido").length;
  const conversionRate = prospects.length > 0 ? ((totalConvertidos / prospects.length) * 100).toFixed(1) : "0";

  // Filtering
  const hasFilters = search || statusFilter;
  const filtered = prospects.filter((p) => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.instagram?.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || p.status === statusFilter;
    const matchAgency = !agencyTab || p.agency === agencyTab;
    return matchSearch && matchStatus && matchAgency;
  });

  // Agency tabs from data
  const agencyTabs = AGENCY_ORDER;

  function openEdit(item: ProspectRecord) {
    setEditForm({
      name: item.name, instagram: item.instagram ?? "", tiktok: item.tiktok ?? "",
      platform: item.platform ?? "", category: item.category ?? "", agency: item.agency ?? "",
      country: item.country ?? "", email: item.email ?? "", phone: item.phone ?? "",
      source: item.source ?? "", notes: item.notes ?? "", status: item.status,
    });
    setEditItem(item);
  }

  function handleAdd() {
    if (!addForm.name.trim()) return;
    addMutation.mutate(addForm as any, { onSuccess: () => { setShowAdd(false); setAddForm({ ...emptyForm }); } });
  }

  function handleUpdate() {
    if (!editForm.name.trim() || !editItem) return;
    updateMutation.mutate({ id: editItem.id, data: editForm as any }, { onSuccess: () => setEditItem(null) });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Casting</h1>
              <p className="text-sm text-muted-foreground">Gestiona perfiles y conviértelos en creadoras</p>
            </div>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" />Nuevo Perfil
            </Button>
          </div>
        </header>

        {/* Scrollable */}
        <div className="flex-1 overflow-auto p-6 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
            ) : (
              <>
                <KpiCard label="Total Casting" value={String(prospects.length)} icon={Users} color="bg-blue-500" subtitle="Todos los registros" />
                <KpiCard label="Pendientes de Contacto" value={String(totalLeads)} icon={Clock} color="bg-amber-500" subtitle={prospects.length > 0 ? `${((totalLeads / prospects.length) * 100).toFixed(0)}% del total` : "—"} />
                <KpiCard label="En Negociación" value={String(totalNegociando)} icon={Target} color="bg-violet-500" subtitle={prospects.length > 0 ? `${((totalNegociando / prospects.length) * 100).toFixed(0)}% del total` : "—"} />
                <KpiCard label="Tasa de Conversión" value={`${conversionRate}%`} icon={TrendingUp} color="bg-emerald-500" subtitle={`${totalConvertidos} convertidos`} />
              </>
            )}
          </div>

          {/* Agency Tabs */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <Button variant={!agencyTab ? "secondary" : "ghost"} size="sm" onClick={() => setAgencyTab("")}>Todos</Button>
            {agencyTabs.map((a) => (
              <Button key={a} variant={agencyTab === a ? "secondary" : "ghost"} size="sm" onClick={() => setAgencyTab(a)}>{a}</Button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre, Instagram o email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {PROSPECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="inline-flex items-center rounded-md border border-border">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}><ListIcon className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); }}>
                <X className="h-3.5 w-3.5 mr-1" />Limpiar filtros
              </Button>
            )}
          </div>

          {/* Table View */}
          {viewMode === "list" ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-auto max-h-[calc(100vh-28rem)]">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-card border-b">
                      <TableHead className="text-xs font-medium text-muted-foreground">Creador</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Plataforma</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Categoría</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Agencia</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                      ))
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                          {prospects.length === 0 ? 'No hay perfiles. Haz clic en "Nuevo Perfil" para empezar.' : "Sin resultados para los filtros aplicados."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => {
                        const initials = getInitials(p.name);
                        const statusColors = PROSPECT_STATUS_COLORS[p.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                        return (
                          <TableRow key={p.id} className="group hover:bg-muted/30 transition-colors">
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                  <span className="text-xs font-semibold text-primary">{initials}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{p.name}</p>
                                  {p.instagram && <p className="text-xs text-muted-foreground">@{p.instagram.replace(/^@/, "")}</p>}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.platform ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.category ?? "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.agency ?? "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                            <TableCell>
                              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                                {PROSPECT_STATUSES.find((s) => s.value === p.status)?.label ?? p.status}
                              </span>
                            </TableCell>
                            <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                              <div className="flex items-center gap-1">
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(p)}><Eye className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                </TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
                                {p.status !== "convertido" && p.status !== "descartado" && (
                                  <Tooltip><TooltipTrigger asChild>
                                    <Button size="sm" className="h-7 px-2 text-xs ml-1" onClick={() => setOnboardItem(p)}>
                                      <Rocket className="h-3.5 w-3.5 mr-1" />Onboarding
                                    </Button>
                                  </TooltipTrigger><TooltipContent side="left">Iniciar Onboarding</TooltipContent></Tooltip>
                                )}
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
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)
              ) : filtered.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  {prospects.length === 0 ? "No hay perfiles registrados." : "Sin resultados para los filtros aplicados."}
                </div>
              ) : (
                filtered.map((p) => {
                  const initials = getInitials(p.name);
                  const statusColors = PROSPECT_STATUS_COLORS[p.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                  return (
                    <Card key={p.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">{p.name}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{p.instagram ? `@${p.instagram.replace(/^@/, "")}` : "Sin Instagram"}</p>
                            </div>
                          </div>
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                            {PROSPECT_STATUSES.find((s) => s.value === p.status)?.label ?? p.status}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p><span className="font-medium text-foreground">Plataforma:</span> {p.platform ?? "—"}</p>
                          {p.agency && <p><span className="font-medium text-foreground">Agencia:</span> {p.agency}</p>}
                          <p><span className="font-medium text-foreground">Fuente:</span> {PROSPECT_SOURCES.find((s) => s.value === p.source)?.label ?? "—"}</p>
                          <p><span className="font-medium text-foreground">Fecha:</span> {format(new Date(p.created_at), "dd/MM/yyyy")}</p>
                        </div>
                        <div className="flex items-center gap-1 pt-1 border-t border-border">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(p)}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(p)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(p)}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
                          {p.status !== "convertido" && p.status !== "descartado" && (
                            <Button size="sm" className="h-7 text-xs ml-auto" onClick={() => setOnboardItem(p)}>
                              <Rocket className="h-3 w-3 mr-1" />Onboarding
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* View Modal */}
        <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Detalle del Perfil</DialogTitle></DialogHeader>
            {viewItem && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">Nombre</p><p className="font-medium">{viewItem.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Instagram</p><p>{viewItem.instagram ? `@${viewItem.instagram.replace(/^@/, "")}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">TikTok</p><p>{viewItem.tiktok ? `@${viewItem.tiktok.replace(/^@/, "")}` : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Plataforma</p><p>{viewItem.platform ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Categoría</p><p>{viewItem.category ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Agencia</p><p>{viewItem.agency ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">País</p><p>{viewItem.country ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p>{viewItem.email ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Teléfono</p><p>{viewItem.phone ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fuente</p><p>{PROSPECT_SOURCES.find((s) => s.value === viewItem.source)?.label ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fecha</p><p>{format(new Date(viewItem.created_at), "dd/MM/yyyy")}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    {(() => {
                      const c = PROSPECT_STATUS_COLORS[viewItem.status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
                      return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>{PROSPECT_STATUSES.find((s) => s.value === viewItem.status)?.label ?? viewItem.status}</span>;
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

        {/* Add Modal */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nuevo Perfil</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Instagram (@)</Label>
                  <Input value={addForm.instagram} onChange={(e) => setAddForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@usuario" />
                </div>
                <div className="space-y-1.5">
                  <Label>TikTok (@)</Label>
                  <Input value={addForm.tiktok} onChange={(e) => setAddForm((f) => ({ ...f, tiktok: e.target.value }))} placeholder="@usuario" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plataforma Principal</Label>
                  <Select value={addForm.platform || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>{PROSPECT_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Input value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Agencia</Label>
                  <Select value={addForm.agency || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, agency: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>{AGENCY_ORDER.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>País</Label>
                  <Input value={addForm.country} onChange={(e) => setAddForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Teléfono</Label>
                  <PhoneInput value={addForm.phone} onChange={(v) => setAddForm((f) => ({ ...f, phone: v }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <Select value={addForm.source || undefined} onValueChange={(v) => setAddForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{PROSPECT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea rows={3} value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
                <Button onClick={handleAdd} disabled={!addForm.name.trim() || addMutation.isPending}>
                  {addMutation.isPending ? "Guardando..." : "Crear Prospecto"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Editar Prospecto</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-auto pr-1">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Instagram (@)</Label>
                  <Input value={editForm.instagram} onChange={(e) => setEditForm((f) => ({ ...f, instagram: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>TikTok (@)</Label>
                  <Input value={editForm.tiktok} onChange={(e) => setEditForm((f) => ({ ...f, tiktok: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Plataforma</Label>
                  <Select value={editForm.platform || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, platform: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>{PROSPECT_PLATFORMS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Categoría</Label>
                  <Input value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Agencia</Label>
                  <Select value={editForm.agency || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, agency: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>{AGENCY_ORDER.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>País</Label>
                  <Input value={editForm.country} onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
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
                <Label>Estado</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <Select value={editForm.source || undefined} onValueChange={(v) => setEditForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{PROSPECT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notas</Label>
                <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
                <Button onClick={handleUpdate} disabled={!editForm.name.trim() || updateMutation.isPending}>
                  {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar prospecto?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará permanentemente a <strong>{deleteItem?.name}</strong>. Esta acción no se puede deshacer.
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

        {/* Start Onboarding Modal */}
        <StartOnboardingModal prospect={onboardItem} onClose={() => setOnboardItem(null)} />
      </div>
  );
}
