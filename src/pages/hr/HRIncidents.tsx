import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "@/lib/hrConstants";
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
  const { data: incidents = [], isLoading } = useIncidents();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ employee_id: "", incident_type: "", severity: "low", title: "", description: "", incident_date: new Date().toISOString().split("T")[0], corrective_action: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_incidents").insert({ ...form, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente registrado" });
      setOpen(false);
      setForm({ employee_id: "", incident_type: "", severity: "low", title: "", description: "", incident_date: new Date().toISOString().split("T")[0], corrective_action: "" });
    },
    onError: () => toast({ title: "Error al registrar el incidente", variant: "destructive" }),
  });

  const filtered = incidents.filter((i) => {
    const matchSev = severityFilter === "all" || i.severity === severityFilter;
    const matchStatus = statusFilter === "all" || i.status === statusFilter;
    return matchSev && matchStatus;
  });

  return (
    <div className="p-6 space-y-5">
      <HRPageHeader
        title="Incidentes Laborales"
        subtitle={`${incidents.filter((i) => i.status === "open").length} incidentes abiertos`}
        icon={AlertTriangle}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Incidente</Button>}
      />

      <div className="flex flex-wrap gap-3">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Severidad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {INCIDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">Sin incidentes registrados</TableCell></TableRow>
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
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Incidente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => setForm((f) => ({ ...f, employee_id: v ?? "" }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input placeholder="Breve descripción del incidente" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select onValueChange={(v) => setForm((f) => ({ ...f, incident_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Tipo..." /></SelectTrigger>
                  <SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severidad</Label>
                <Select defaultValue="low" onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha del Incidente</Label>
              <DateInput value={form.incident_date} onChange={(v) => setForm((f) => ({ ...f, incident_date: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea placeholder="Detalle del incidente..." rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Acción Correctiva</Label>
              <Textarea placeholder="Medidas tomadas o a tomar..." rows={2} value={form.corrective_action} onChange={(e) => setForm((f) => ({ ...f, corrective_action: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id || !form.title || !form.incident_type || createMutation.isPending}>
                {createMutation.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
