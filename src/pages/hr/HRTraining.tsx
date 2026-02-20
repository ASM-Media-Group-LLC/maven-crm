import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Plus } from "lucide-react";
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
import { TRAINING_STATUSES, TRAINING_MODALITIES } from "@/lib/hrConstants";
import { Progress } from "@/components/ui/progress";

function useTrainingData() {
  return useQuery({
    queryKey: ["training-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_training_assignments")
        .select("*, employees(first_name, last_name), training_programs(name, duration_hours, modality)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useTrainingPrograms() {
  return useQuery({
    queryKey: ["training-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("training_programs").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });
}

const STATUS_PROGRESS: Record<string, number> = { assigned: 0, in_progress: 50, completed: 100, failed: 100, cancelled: 0 };

export default function HRTraining() {
  const { data: assignments = [], isLoading } = useTrainingData();
  const { data: programs = [] } = useTrainingPrograms();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [openNewProg, setOpenNewProg] = useState(false);
  const [assignForm, setAssignForm] = useState({ employee_id: "", training_program_id: "", start_date: "" });
  const [progForm, setProgForm] = useState({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_training_assignments").insert({ ...assignForm, assigned_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-all"] }); toast({ title: "Capacitación asignada" }); setOpen(false); setAssignForm({ employee_id: "", training_program_id: "", start_date: "" }); },
    onError: () => toast({ title: "Error al asignar", variant: "destructive" }),
  });

  const createProgMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("training_programs").insert({ ...progForm, duration_hours: progForm.duration_hours ? parseFloat(progForm.duration_hours) : null, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: "Programa creado" }); setOpenNewProg(false); setProgForm({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false }); },
    onError: () => toast({ title: "Error al crear programa", variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-5">
      <HRPageHeader
        title="Capacitación"
        subtitle={`${assignments.filter((a) => a.status === "in_progress").length} en progreso`}
        icon={GraduationCap}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenNewProg(true)}>Nuevo Programa</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Asignar</Button>
          </div>
        }
      />

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : assignments.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Sin capacitaciones asignadas</TableCell></TableRow>
            ) : (
              assignments.map((a) => {
                const emp = (a as any).employees;
                const prog = (a as any).training_programs;
                const progress = STATUS_PROGRESS[a.status] ?? 0;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-sm">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell className="text-sm">{prog?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{prog?.duration_hours ? `${prog.duration_hours}h` : "—"}</TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.status === "completed" ? "default" : a.status === "failed" ? "destructive" : "secondary"}>
                        {TRAINING_STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Assign dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Asignar Capacitación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <EmployeeSearchCombobox value={assignForm.employee_id || null} onChange={(v) => setAssignForm((f) => ({ ...f, employee_id: v ?? "" }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Programa</Label>
              <Select onValueChange={(v) => setAssignForm((f) => ({ ...f, training_program_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar programa..." /></SelectTrigger>
                <SelectContent>{programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de Inicio</Label>
              <DateInput value={assignForm.start_date} onChange={(v) => setAssignForm((f) => ({ ...f, start_date: v }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => assignMutation.mutate()} disabled={!assignForm.employee_id || !assignForm.training_program_id || assignMutation.isPending}>
                {assignMutation.isPending ? "Guardando..." : "Asignar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New program dialog */}
      <Dialog open={openNewProg} onOpenChange={setOpenNewProg}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Programa de Capacitación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input placeholder="Nombre del programa" value={progForm.name} onChange={(e) => setProgForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duración (horas)</Label>
                <Input type="number" placeholder="8" value={progForm.duration_hours} onChange={(e) => setProgForm((f) => ({ ...f, duration_hours: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Modalidad</Label>
                <Select defaultValue="presencial" onValueChange={(v) => setProgForm((f) => ({ ...f, modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Proveedor / Instructor</Label>
              <Input placeholder="Nombre del proveedor" value={progForm.provider} onChange={(e) => setProgForm((f) => ({ ...f, provider: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea placeholder="Describe el programa..." rows={3} value={progForm.description} onChange={(e) => setProgForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenNewProg(false)}>Cancelar</Button>
              <Button onClick={() => createProgMutation.mutate()} disabled={!progForm.name || createProgMutation.isPending}>
                {createProgMutation.isPending ? "Creando..." : "Crear Programa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
