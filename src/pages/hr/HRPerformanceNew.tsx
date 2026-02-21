import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Users, BarChart3, MessageSquare, Target, Plus, X, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STEPS = [
  { id: 1, label: "Empleado y Período", icon: Users },
  { id: 2, label: "Categorías", icon: BarChart3 },
  { id: 3, label: "Feedback", icon: MessageSquare },
  { id: 4, label: "Objetivos", icon: Target },
];

const CATEGORIES = [
  { key: "punctuality", label: "Puntualidad", desc: "Evalúa la consistencia en horarios, entregas a tiempo y respeto por los plazos establecidos." },
  { key: "quality", label: "Calidad del Trabajo", desc: "Evalúa la precisión, atención al detalle y estándar general del trabajo entregado." },
  { key: "teamwork", label: "Trabajo en Equipo", desc: "Evalúa la colaboración, comunicación y contribución positiva al equipo." },
  { key: "initiative", label: "Iniciativa", desc: "Evalúa la proactividad, propuestas de mejora y capacidad de resolver problemas de forma autónoma." },
];

interface Objective {
  title: string;
  description: string;
}

export default function HRPerformanceNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Step 2
  const [scores, setScores] = useState({ punctuality: 3, quality: 3, teamwork: 3, initiative: 3 });

  // Step 3
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [comments, setComments] = useState("");

  // Step 4
  const [objectives, setObjectives] = useState<Objective[]>([{ title: "", description: "" }]);

  // Computed
  const overallScore = useMemo(() => {
    const vals = Object.values(scores);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [scores]);

  const periodString = useMemo(() => {
    if (!periodStart || !periodEnd) return "";
    try {
      const s = new Date(periodStart + "T12:00:00");
      const e = new Date(periodEnd + "T12:00:00");
      return `${format(s, "MMM yyyy", { locale: es })} - ${format(e, "MMM yyyy", { locale: es })}`;
    } catch {
      return "";
    }
  }, [periodStart, periodEnd]);

  const canProceed = () => {
    if (step === 1) return !!employeeId && !!periodStart && !!periodEnd;
    return true;
  };

  const handleSubmit = async () => {
    if (!employeeId) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const goalsText = objectives
        .filter((o) => o.title.trim())
        .map((o, i) => `${i + 1}. ${o.title}${o.description ? `: ${o.description}` : ""}`)
        .join("\n");

      const { error } = await supabase.from("performance_evaluations").insert({
        employee_id: employeeId,
        period: periodString || null,
        evaluation_date: new Date().toISOString().split("T")[0],
        punctuality_score: scores.punctuality,
        quality_score: scores.quality,
        teamwork_score: scores.teamwork,
        initiative_score: scores.initiative,
        overall_score: overallScore,
        strengths: strengths || null,
        areas_for_improvement: improvements || null,
        goals_next_period: goalsText || null,
        comments: comments || null,
        status: "completed",
        created_by: user?.id,
        evaluator_id: user?.id,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["performance-all"] });
      toast({ title: "Evaluación creada exitosamente" });
      navigate("/hr/desempeno");
    } catch {
      toast({ title: "Error al crear la evaluación", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <Button variant="ghost" size="icon" className="mb-2 -ml-2" onClick={() => navigate("/hr/desempeno")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nueva Evaluación de Desempeño</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Complete los 4 pasos para crear una evaluación guiada</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b bg-background px-6 py-3 space-y-3">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => { if (s.id <= step || canProceed()) setStep(s.id); }}
                  className={cn("flex items-center gap-2 text-sm font-medium transition-colors", step === s.id ? "text-foreground" : step > s.id ? "text-foreground/70" : "text-muted-foreground")}
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

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {/* Step 1 */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empleado y Período</CardTitle>
              <CardDescription>Selecciona al empleado a evaluar y define el período de la evaluación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Empleado <span className="text-destructive">*</span></Label>
                <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Inicio del período <span className="text-destructive">*</span></Label>
                  <DateInput value={periodStart} onChange={setPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fin del período <span className="text-destructive">*</span></Label>
                  <DateInput value={periodEnd} onChange={setPeriodEnd} />
                </div>
              </div>
              {periodString && (
                <p className="text-sm text-muted-foreground">Período: <span className="font-medium text-foreground">{periodString}</span></p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categorías de Evaluación</CardTitle>
              <CardDescription>Califica cada categoría del 1 al 5. El score general se calcula automáticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {CATEGORIES.map((cat) => (
                <div key={cat.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">{cat.label}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{cat.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-lg font-bold w-6 text-right">{scores[cat.key as keyof typeof scores]}</span>
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    </div>
                  </div>
                  <Slider
                    min={1} max={5} step={1}
                    value={[scores[cat.key as keyof typeof scores]]}
                    onValueChange={([v]) => setScores((prev) => ({ ...prev, [cat.key]: v }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                    <span>Deficiente</span><span>Regular</span><span>Bueno</span><span>Muy bueno</span><span>Excelente</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-4 border-t">
                <span className="text-sm font-medium text-muted-foreground">Score General:</span>
                <span className="text-2xl font-bold">{overallScore.toFixed(1)}</span>
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Feedback Cualitativo</CardTitle>
              <CardDescription>Proporciona retroalimentación detallada sobre el desempeño del empleado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Fortalezas</Label>
                <Textarea
                  rows={4}
                  placeholder="Describe las principales fortalezas del empleado: habilidades destacadas, logros, actitudes positivas..."
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Áreas de Mejora</Label>
                <Textarea
                  rows={4}
                  placeholder="Identifica las áreas donde el empleado puede mejorar: habilidades a desarrollar, comportamientos a ajustar..."
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comentarios Adicionales <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Textarea
                  rows={3}
                  placeholder="Observaciones generales, contexto relevante o notas adicionales..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Objetivos del Próximo Período</CardTitle>
              <CardDescription>Define metas claras y medibles para el siguiente período de evaluación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {objectives.length === 1 && !objectives[0].title && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Target className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Sin objetivos definidos aún</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">Agrega objetivos específicos y medibles para guiar el crecimiento del empleado en el próximo período.</p>
                </div>
              )}
              {objectives.map((obj, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder={`Objetivo ${idx + 1}`}
                      value={obj.title}
                      onChange={(e) => {
                        const next = [...objectives];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setObjectives(next);
                      }}
                    />
                    <Input
                      placeholder="Descripción breve (opcional)"
                      value={obj.description}
                      className="text-sm"
                      onChange={(e) => {
                        const next = [...objectives];
                        next[idx] = { ...next[idx], description: e.target.value };
                        setObjectives(next);
                      }}
                    />
                  </div>
                  {objectives.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => setObjectives(objectives.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setObjectives([...objectives, { title: "", description: "" }])}>
                <Plus className="h-4 w-4 mr-1" />Agregar Objetivo
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>Anterior</Button>
        {step < STEPS.length ? (
          <Button disabled={!canProceed()} onClick={() => setStep(step + 1)}>Siguiente</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Crear Evaluación"}
          </Button>
        )}
      </div>
    </div>
  );
}
