import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Plus, Star } from "lucide-react";
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
import { PERFORMANCE_EVALUATION_STATUSES } from "@/lib/hrConstants";
import { format } from "date-fns";

function usePerformanceData() {
  return useQuery({
    queryKey: ["performance-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_evaluations")
        .select("*, employees(first_name, last_name)")
        .order("evaluation_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label} (1-5)</Label>
      <Input type="number" min={1} max={5} step={0.1} placeholder="3.0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function HRPerformance() {
  const { data: evals = [], isLoading } = usePerformanceData();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: "", period: "", evaluation_date: new Date().toISOString().split("T")[0],
    punctuality_score: "", quality_score: "", teamwork_score: "", initiative_score: "",
    strengths: "", areas_for_improvement: "", goals_next_period: "", comments: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const scores = [form.punctuality_score, form.quality_score, form.teamwork_score, form.initiative_score]
        .map((s) => parseFloat(s) || 0);
      const overall = scores.reduce((a, b) => a + b, 0) / scores.filter((s) => s > 0).length || null;
      const { error } = await supabase.from("performance_evaluations").insert({
        employee_id: form.employee_id,
        period: form.period,
        evaluation_date: form.evaluation_date,
        punctuality_score: parseFloat(form.punctuality_score) || null,
        quality_score: parseFloat(form.quality_score) || null,
        teamwork_score: parseFloat(form.teamwork_score) || null,
        initiative_score: parseFloat(form.initiative_score) || null,
        overall_score: overall,
        strengths: form.strengths,
        areas_for_improvement: form.areas_for_improvement,
        goals_next_period: form.goals_next_period,
        comments: form.comments,
        status: "completed",
        created_by: user?.id,
        evaluator_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-all"] });
      toast({ title: "Evaluación creada" });
      setOpen(false);
    },
    onError: () => toast({ title: "Error al crear la evaluación", variant: "destructive" }),
  });

  function ScoreStars({ score }: { score: number | null }) {
    if (!score) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <div className="flex items-center gap-1">
        <span className="text-sm font-bold">{score.toFixed(1)}</span>
        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <HRPageHeader
        title="Evaluaciones de Desempeño"
        subtitle={`${evals.length} evaluaciones registradas`}
        icon={TrendingUp}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nueva Evaluación</Button>}
      />

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Puntualidad</TableHead>
              <TableHead>Calidad</TableHead>
              <TableHead>Trabajo en Equipo</TableHead>
              <TableHead>Iniciativa</TableHead>
              <TableHead>General</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : evals.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Sin evaluaciones registradas</TableCell></TableRow>
            ) : (
              evals.map((e) => {
                const emp = (e as any).employees;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium text-sm">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</TableCell>
                    <TableCell className="text-sm">{e.period}</TableCell>
                    <TableCell className="text-sm">{format(new Date(e.evaluation_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell><ScoreStars score={e.punctuality_score} /></TableCell>
                    <TableCell><ScoreStars score={e.quality_score} /></TableCell>
                    <TableCell><ScoreStars score={e.teamwork_score} /></TableCell>
                    <TableCell><ScoreStars score={e.initiative_score} /></TableCell>
                    <TableCell><ScoreStars score={e.overall_score} /></TableCell>
                    <TableCell>
                      <Badge variant={e.status === "completed" ? "default" : "secondary"}>
                        {PERFORMANCE_EVALUATION_STATUSES.find((s) => s.value === e.status)?.label ?? e.status}
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva Evaluación de Desempeño</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => setForm((f) => ({ ...f, employee_id: v ?? "" }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Período</Label>
                <Input placeholder="Ej: Q1 2026" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <DateInput value={form.evaluation_date} onChange={(v) => setForm((f) => ({ ...f, evaluation_date: v }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ScoreInput label="Puntualidad" value={form.punctuality_score} onChange={(v) => setForm((f) => ({ ...f, punctuality_score: v }))} />
              <ScoreInput label="Calidad del trabajo" value={form.quality_score} onChange={(v) => setForm((f) => ({ ...f, quality_score: v }))} />
              <ScoreInput label="Trabajo en equipo" value={form.teamwork_score} onChange={(v) => setForm((f) => ({ ...f, teamwork_score: v }))} />
              <ScoreInput label="Iniciativa" value={form.initiative_score} onChange={(v) => setForm((f) => ({ ...f, initiative_score: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fortalezas</Label>
              <Textarea placeholder="¿En qué destaca este empleado?" rows={2} value={form.strengths} onChange={(e) => setForm((f) => ({ ...f, strengths: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Áreas de Mejora</Label>
              <Textarea placeholder="¿Qué debe mejorar?" rows={2} value={form.areas_for_improvement} onChange={(e) => setForm((f) => ({ ...f, areas_for_improvement: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Objetivos Próximo Período</Label>
              <Textarea placeholder="Metas para el siguiente período..." rows={2} value={form.goals_next_period} onChange={(e) => setForm((f) => ({ ...f, goals_next_period: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id || !form.period || createMutation.isPending}>
              {createMutation.isPending ? "Guardando..." : "Crear Evaluación"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
