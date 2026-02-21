import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Eye, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATUSES, INCIDENT_CATEGORIES, INCIDENT_IMPACTS } from "@/lib/hrConstants";
import { SEVERITY_COLORS } from "@/lib/hrAreaUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function useIncidents() {
  return useQuery({
    queryKey: ["employee-incidents-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_incidents")
        .select("*, employees(first_name, last_name, employee_code)")
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export default function HRIncidents() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading } = useIncidents();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewItem, setViewItem] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({ status: "", severity: "", corrective_action: "" });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updates: any = { status: editForm.status, severity: editForm.severity, corrective_action: editForm.corrective_action || null };
      if (editForm.status === "resolved" || editForm.status === "closed") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user?.id;
      }
      const { error } = await supabase.from("employee_incidents").update(updates).eq("id", editItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente actualizado" });
      setEditItem(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employee_incidents").delete().eq("id", deleteItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const hasFilters = severityFilter || statusFilter;

  const filtered = incidents.filter((i) => {
    const matchSev = !severityFilter || i.severity === severityFilter;
    const matchStatus = !statusFilter || i.status === statusFilter;
    return matchSev && matchStatus;
  });

  const totalOpen = incidents.filter((i) => i.status === "open").length;
  const totalInProgress = incidents.filter((i) => i.status === "in_progress").length;
  const totalCritical = incidents.filter((i) => i.severity === "critical").length;

  const kpis = [
    { label: "Total Incidentes", value: incidents.length, color: "border-t-primary" },
    { label: "Abiertos", value: totalOpen, color: "border-t-accent" },
    { label: "En Proceso", value: totalInProgress, color: "border-t-warning" },
    { label: "Críticos", value: totalCritical, color: "border-t-destructive" },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Incidentes Laborales</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{totalOpen} incidentes abiertos · {incidents.length} total</p>
        </div>
        <Button size="sm" onClick={() => navigate("/hr/incidentes/nuevo")}>
          <Plus className="h-4 w-4 mr-1" />Reportar Incidente
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className={cn("border-t-3 transition-all hover:scale-[1.03] hover:shadow-lg cursor-default", k.color)}>
            <CardContent className="px-5 py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={severityFilter || undefined} onValueChange={(v) => setSeverityFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Severidad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {INCIDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSeverityFilter(""); setStatusFilter(""); }}>
            <X className="h-4 w-4 mr-1" />Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Severidad</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Sin incidentes registrados</TableCell></TableRow>
            ) : (
              filtered.map((inc) => {
                const emp = (inc as any).employees;
                const sev = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;
                return (
                  <TableRow key={inc.id}>
                    <TableCell className="font-medium text-sm">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell className="text-sm max-w-48 truncate">{inc.title}</TableCell>
                    <TableCell className="text-sm">{INCIDENT_TYPES.find((t) => t.value === inc.incident_type)?.label ?? inc.incident_type}</TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", sev.bg, sev.text)}>
                        {INCIDENT_SEVERITIES.find((s) => s.value === inc.severity)?.label ?? inc.severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(inc.incident_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>
                      <Badge variant={inc.status === "resolved" || inc.status === "closed" ? "default" : "secondary"}>
                        {INCIDENT_STATUSES.find((s) => s.value === inc.status)?.label ?? inc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewItem(inc)}><Eye className="h-4 w-4" /></Button>
                        </TooltipTrigger><TooltipContent>Ver</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditItem(inc); setEditForm({ status: inc.status, severity: inc.severity, corrective_action: inc.corrective_action || "" }); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteItem(inc)}><Trash2 className="h-4 w-4" /></Button>
                        </TooltipTrigger><TooltipContent>Eliminar</TooltipContent></Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Modal */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle del Incidente</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground">Empleado</Label><p className="font-medium">{(viewItem as any).employees ? `${(viewItem as any).employees.first_name} ${(viewItem as any).employees.last_name}` : "—"}</p></div>
                <div><Label className="text-muted-foreground">Fecha</Label><p className="font-medium">{format(new Date(viewItem.incident_date), "dd/MM/yyyy")}</p></div>
                <div><Label className="text-muted-foreground">Tipo</Label><p className="font-medium">{INCIDENT_TYPES.find((t) => t.value === viewItem.incident_type)?.label ?? viewItem.incident_type}</p></div>
                <div><Label className="text-muted-foreground">Severidad</Label><p className="font-medium">{INCIDENT_SEVERITIES.find((s) => s.value === viewItem.severity)?.label ?? viewItem.severity}</p></div>
                <div><Label className="text-muted-foreground">Estado</Label><p className="font-medium">{INCIDENT_STATUSES.find((s) => s.value === viewItem.status)?.label ?? viewItem.status}</p></div>
              </div>
              <div><Label className="text-muted-foreground">Título</Label><p className="font-medium">{viewItem.title}</p></div>
              {viewItem.description && <div><Label className="text-muted-foreground">Descripción</Label><p>{viewItem.description}</p></div>}
              {viewItem.corrective_action && <div><Label className="text-muted-foreground">Acción Correctiva</Label><p>{viewItem.corrective_action}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Incidente</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">Empleado</Label><p className="text-sm font-medium">{(editItem as any).employees ? `${(editItem as any).employees.first_name} ${(editItem as any).employees.last_name}` : "—"}</p></div>
                <div><Label className="text-muted-foreground text-xs">Título</Label><p className="text-sm font-medium">{editItem.title}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INCIDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severidad</Label>
                  <Select value={editForm.severity} onValueChange={(v) => setEditForm((f) => ({ ...f, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Acción Correctiva</Label>
                <Textarea value={editForm.corrective_action} onChange={(e) => setEditForm((f) => ({ ...f, corrective_action: e.target.value }))} rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar incidente?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente el incidente "{deleteItem?.title}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
