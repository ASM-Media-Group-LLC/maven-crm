import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ClipboardList, ShieldCheck, FileText, Settings, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Progress } from "@/components/ui/progress";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_CATEGORIES, INCIDENT_IMPACTS } from "@/lib/hrConstants";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";

const STEPS = [
  { id: 1, label: "Clasificación", icon: ClipboardList },
  { id: 2, label: "Evaluación Interna", icon: ShieldCheck },
  { id: 3, label: "Detalle del Incidente", icon: FileText },
  { id: 4, label: "Seguimiento", icon: Settings },
];

interface FormState {
  employee_id: string;
  incident_type: string;
  category: string;
  incident_date: string;
  severity: string;
  impact: string;
  title: string;
  description: string;
  internal_notes: string;
  corrective_action: string;
  follow_up_date: string;
  follow_up_responsible: string | null;
  follow_up_notes: string;
}

const initialForm: FormState = {
  employee_id: "",
  incident_type: "",
  category: "",
  incident_date: new Date().toISOString().split("T")[0],
  severity: "",
  impact: "",
  title: "",
  description: "",
  internal_notes: "",
  corrective_action: "",
  follow_up_date: "",
  follow_up_responsible: null,
  follow_up_notes: "",
};

export default function HRIncidentNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof FormState, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const canNext = () => {
    if (step === 1) return form.employee_id && form.incident_type && form.category && form.incident_date;
    if (step === 2) return form.severity && form.impact;
    if (step === 3) return form.title.length >= 5 && form.description.length >= 10;
    return !!form.corrective_action;
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_incidents").insert({
        employee_id: form.employee_id,
        incident_type: form.incident_type,
        category: form.category,
        incident_date: form.incident_date,
        severity: form.severity,
        impact: form.impact,
        title: form.title,
        description: form.description || null,
        internal_notes: form.internal_notes || null,
        corrective_action: form.corrective_action || null,
        follow_up_date: form.follow_up_date || null,
        follow_up_responsible: form.follow_up_responsible || null,
        follow_up_notes: form.follow_up_notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente registrado correctamente" });
      navigate("/hr/incidentes");
    } catch {
      toast({ title: "Error al registrar el incidente", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/incidentes")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Incidentes
        </Button>
        <PageHeader title="Reportar Incidente" subtitle="Registra un nuevo incidente siguiendo el flujo de 4 pasos" />
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-3 space-y-3">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => { if (s.id < step) setStep(s.id); }}
                  className={cn("flex items-center gap-2 text-sm font-medium transition-colors", step === s.id ? "text-foreground" : step > s.id ? "text-foreground/70 cursor-pointer" : "text-muted-foreground cursor-default")}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all", step === s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30" : step > s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white" : "border-muted-foreground/30 text-muted-foreground")}>
                    {step > s.id ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && <div className={cn("h-px flex-1 mx-2 transition-colors", step > s.id ? "bg-gradient-to-r from-accent to-primary" : "bg-border")} />}
              </div>
            );
          })}
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {/* Step 1: Clasificación */}
        {step === 1 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Clasificación del Incidente</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Empleado <span className="text-destructive">*</span></Label>
                <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => set("employee_id", v ?? "")} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Incidente <span className="text-destructive">*</span></Label>
                <Select value={form.incident_type || undefined} onValueChange={(v) => set("incident_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                  <SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoría <span className="text-destructive">*</span></Label>
                <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar categoría..." /></SelectTrigger>
                  <SelectContent>{INCIDENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha del Incidente <span className="text-destructive">*</span></Label>
                <DateInput value={form.incident_date} onChange={(v) => set("incident_date", v)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Evaluación Interna */}
        {step === 2 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Evaluación Interna RRHH</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Severidad <span className="text-destructive">*</span></Label>
                <Select value={form.severity || undefined} onValueChange={(v) => set("severity", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar severidad..." /></SelectTrigger>
                  <SelectContent>{INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Impacto <span className="text-destructive">*</span></Label>
                <Select value={form.impact || undefined} onValueChange={(v) => set("impact", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar impacto..." /></SelectTrigger>
                  <SelectContent>{INCIDENT_IMPACTS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Detalle */}
        {step === 3 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Detalle del Incidente</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Título <span className="text-destructive">*</span></Label>
                  <span className="text-xs text-muted-foreground">{form.title.length}/100</span>
                </div>
                <Input maxLength={100} placeholder="Breve descripción del incidente (min. 5 caracteres)" value={form.title} onChange={(e) => set("title", e.target.value)} />
                {form.title.length > 0 && form.title.length < 5 && <p className="text-xs text-destructive">Mínimo 5 caracteres</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Descripción <span className="text-destructive">*</span></Label>
                  <span className="text-xs text-muted-foreground">{form.description.length}/2000</span>
                </div>
                <Textarea maxLength={2000} rows={5} placeholder="Detalle completo del incidente (min. 10 caracteres)" value={form.description} onChange={(e) => set("description", e.target.value)} />
                {form.description.length > 0 && form.description.length < 10 && <p className="text-xs text-destructive">Mínimo 10 caracteres</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Evidencias (opcional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground hover:border-primary/50 transition-colors cursor-default">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Arrastra archivos aquí o haz clic para seleccionar</p>
                  <p className="text-xs mt-1">Función disponible próximamente</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Comentarios Internos (solo RRHH)</Label>
                <Textarea rows={3} placeholder="Notas internas del equipo de RRHH..." value={form.internal_notes} onChange={(e) => set("internal_notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Seguimiento */}
        {step === 4 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Seguimiento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Acción Correctiva <span className="text-destructive">*</span></Label>
                <Textarea rows={4} placeholder="Medidas correctivas a implementar..." value={form.corrective_action} onChange={(e) => set("corrective_action", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Fecha de Seguimiento</Label>
                  <DateInput value={form.follow_up_date} onChange={(v) => set("follow_up_date", v)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Responsable del Seguimiento</Label>
                  <EmployeeSearchCombobox value={form.follow_up_responsible} onChange={(v) => set("follow_up_responsible", v)} placeholder="Seleccionar responsable..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Notas de Seguimiento</Label>
                <Textarea rows={3} placeholder="Notas adicionales sobre el seguimiento..." value={form.follow_up_notes} onChange={(e) => set("follow_up_notes", e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between">
        <div>
          {step === 1 ? (
            <Button variant="outline" onClick={() => navigate("/hr/incidentes")}>Cancelar</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Atrás</Button>
          )}
        </div>
        <div>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>Siguiente</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canNext() || isSubmitting}>
              {isSubmitting ? "Registrando..." : "Registrar Incidente"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
