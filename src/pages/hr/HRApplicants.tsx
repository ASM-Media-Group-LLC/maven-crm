import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Plus, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { APPLICANT_STATUSES, APPLICANT_SOURCES } from "@/lib/hrConstants";
import { APPLICANT_STATUS_COLORS } from "@/lib/hrAreaUtils";
import { cn } from "@/lib/utils";
import { useDepartments } from "@/hooks/useEmployees";

function useApplicants() {
  return useQuery({
    queryKey: ["applicants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("applicants").select("*, departments(name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

const KANBAN_COLS = APPLICANT_STATUSES.slice(0, 5); // applied → offer

export default function HRApplicants() {
  const { data: applicants = [], isLoading } = useApplicants();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", position_applied: "", department_id: "", source: "direct", notes: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("applicants").insert({ ...form, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants"] });
      toast({ title: "Candidato registrado" });
      setOpen(false);
      setForm({ full_name: "", email: "", phone: "", position_applied: "", department_id: "", source: "direct", notes: "" });
    },
    onError: () => toast({ title: "Error al registrar el candidato", variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("applicants").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applicants"] }),
  });

  return (
    <div className="p-6 space-y-5">
      <HRPageHeader
        title="Pipeline de Candidatos"
        subtitle={`${applicants.length} candidatos en seguimiento`}
        icon={UserCheck}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nuevo Candidato</Button>}
      />

      {/* Kanban board */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {KANBAN_COLS.map((col) => <Skeleton key={col.value} className="h-64 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 overflow-x-auto">
          {KANBAN_COLS.map((col) => {
            const colApplicants = applicants.filter((a) => a.status === col.value);
            const colors = APPLICANT_STATUS_COLORS[col.value] ?? { bg: "bg-muted", text: "text-muted-foreground" };
            return (
              <div key={col.value} className="space-y-3 min-w-[200px]">
                <div className="flex items-center justify-between">
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", colors.bg, colors.text)}>
                    {col.label}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">{colApplicants.length}</span>
                </div>
                <div className="space-y-2">
                  {colApplicants.length === 0 ? (
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Sin candidatos</p>
                    </div>
                  ) : (
                    colApplicants.map((app) => (
                      <Card key={app.id} className="cursor-default hover:border-primary/30 transition-colors">
                        <CardContent className="p-3 space-y-2">
                          <p className="text-sm font-medium leading-tight">{app.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{app.position_applied ?? "Sin cargo"}</p>
                          {(app as any).departments?.name && (
                            <p className="text-xs text-muted-foreground">{(app as any).departments.name}</p>
                          )}
                          <div className="flex gap-1 pt-1">
                            {APPLICANT_STATUSES.indexOf(col) < APPLICANT_STATUSES.length - 1 && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => {
                                const nextStatus = APPLICANT_STATUSES[APPLICANT_STATUSES.indexOf(col) + 1]?.value;
                                if (nextStatus) updateStatus.mutate({ id: app.id, status: nextStatus });
                              }}>
                                <ChevronRight className="h-3 w-3 mr-0.5" />Avanzar
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Candidato</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre Completo <span className="text-destructive">*</span></Label>
              <Input placeholder="Nombre del candidato" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="correo@ejemplo.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input placeholder="+57 300..." value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cargo al que Aplica</Label>
              <Input placeholder="Ej: Desarrollador Frontend" value={form.position_applied} onChange={(e) => setForm((f) => ({ ...f, position_applied: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Departamento</Label>
                <Select onValueChange={(v) => setForm((f) => ({ ...f, department_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fuente</Label>
                <Select defaultValue="direct" onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{APPLICANT_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea placeholder="Observaciones del candidato..." rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!form.full_name || createMutation.isPending}>
                {createMutation.isPending ? "Guardando..." : "Registrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
