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
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { TranslationKey } from "@/lib/i18n";

const STEPS: { id: number; label: TranslationKey; icon: typeof Users }[] = [
  { id: 1, label: "hrg.perfNew.step.employee", icon: Users },
  { id: 2, label: "hrg.perfNew.step.categories", icon: BarChart3 },
  { id: 3, label: "hrg.perfNew.step.feedback", icon: MessageSquare },
  { id: 4, label: "hrg.perfNew.step.goals", icon: Target },
];

const CATEGORIES: { key: string; label: TranslationKey; desc: TranslationKey }[] = [
  { key: "punctuality", label: "hrg.perf.punctuality", desc: "hrg.perfNew.punctualityDesc" },
  { key: "quality", label: "hrg.perfNew.quality", desc: "hrg.perfNew.qualityDesc" },
  { key: "teamwork", label: "hrg.perf.teamwork", desc: "hrg.perfNew.teamworkDesc" },
  { key: "initiative", label: "hrg.perf.initiative", desc: "hrg.perfNew.initiativeDesc" },
];

const ESCALA: TranslationKey[] = ["hrg.perfNew.scale1", "hrg.perfNew.scale2", "hrg.perfNew.scale3", "hrg.perfNew.scale4", "hrg.perfNew.scale5"];

interface Objective {
  title: string;
  description: string;
}

export default function HRPerformanceNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const f = useFormato();
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
      // Idioma fijo a propósito: este texto se guarda en la base como `period` de la evaluación.
      return `${format(s, "MMM yyyy", { locale: es })} - ${format(e, "MMM yyyy", { locale: es })}`;
    } catch {
      return "";
    }
  }, [periodStart, periodEnd]);

  // El mismo período, en el idioma de quien mira (el de arriba es el que se GUARDA).
  const periodoVisible = useMemo(() => {
    if (!periodStart || !periodEnd) return "";
    try {
      const s = new Date(periodStart + "T12:00:00");
      const e = new Date(periodEnd + "T12:00:00");
      return `${format(s, "MMM yyyy", { locale: f.fechas })} - ${format(e, "MMM yyyy", { locale: f.fechas })}`;
    } catch {
      return "";
    }
  }, [periodStart, periodEnd, f.fechas]);

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
      toast({ title: t("hrg.perfNew.created") });
      navigate("/hr/desempeno");
    } catch {
      toast({ title: t("hrg.perfNew.createError"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="icon" className="mb-2 -ml-2" onClick={() => navigate("/hr/desempeno")} aria-label={t("common.back")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={t("hrg.perfNew.title")}
          subtitle={t("hrg.perfNew.subtitle")}
        />
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
                  onClick={() => { if (s.id <= step || canProceed()) setStep(s.id); }}
                  className={cn("flex items-center gap-2 text-sm font-medium transition-colors", step === s.id ? "text-foreground" : step > s.id ? "text-foreground/70" : "text-muted-foreground")}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all", step === s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30" : step > s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white" : "border-muted-foreground/30 text-muted-foreground")}>
                    {step > s.id ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="hidden sm:inline">{t(s.label)}</span>
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
              <CardTitle className="text-base">{t("hrg.perfNew.step.employee")}</CardTitle>
              <CardDescription>{t("hrg.perfNew.step1Hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("hrg.employee")} <span className="text-destructive">*</span></Label>
                <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("hrg.perfNew.periodStart")} <span className="text-destructive">*</span></Label>
                  <DateInput value={periodStart} onChange={setPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("hrg.perfNew.periodEnd")} <span className="text-destructive">*</span></Label>
                  <DateInput value={periodEnd} onChange={setPeriodEnd} />
                </div>
              </div>
              {periodoVisible && (
                <p className="text-sm text-muted-foreground">{t("common.period")}: <span className="font-medium text-foreground">{periodoVisible}</span></p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("hrg.perfNew.categoriesTitle")}</CardTitle>
              <CardDescription>{t("hrg.perfNew.categoriesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {CATEGORIES.map((cat) => (
                <div key={cat.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">{t(cat.label)}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(cat.desc)}</p>
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
                    {ESCALA.map((k) => <span key={k}>{t(k)}</span>)}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-4 border-t">
                <span className="text-sm font-medium text-muted-foreground">{t("hrg.perf.overallScore")}:</span>
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
              <CardTitle className="text-base">{t("hrg.perfNew.feedbackTitle")}</CardTitle>
              <CardDescription>{t("hrg.perfNew.feedbackHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("hrg.perf.strengths")}</Label>
                <Textarea
                  rows={4}
                  placeholder={t("hrg.perfNew.strengthsPlaceholder")}
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.perf.improvements")}</Label>
                <Textarea
                  rows={4}
                  placeholder={t("hrg.perfNew.improvementsPlaceholder")}
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.perfNew.comments")} <span className="text-xs text-muted-foreground">{t("hrg.perfNew.optional")}</span></Label>
                <Textarea
                  rows={3}
                  placeholder={t("hrg.perfNew.commentsPlaceholder")}
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
              <CardTitle className="text-base">{t("hrg.perfNew.goalsTitle")}</CardTitle>
              <CardDescription>{t("hrg.perfNew.goalsHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {objectives.length === 1 && !objectives[0].title && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Target className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">{t("hrg.perfNew.noGoals")}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">{t("hrg.perfNew.noGoalsHint")}</p>
                </div>
              )}
              {objectives.map((obj, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder={t("hrg.perfNew.goalN", { n: idx + 1 })}
                      value={obj.title}
                      onChange={(e) => {
                        const next = [...objectives];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setObjectives(next);
                      }}
                    />
                    <Input
                      placeholder={t("hrg.perfNew.goalDescPlaceholder")}
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
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => setObjectives(objectives.filter((_, i) => i !== idx))} aria-label={t("hrg.perfNew.removeGoal")}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setObjectives([...objectives, { title: "", description: "" }])}>
                <Plus className="h-4 w-4 mr-1" />{t("hrg.perfNew.addGoal")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between">
        <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>{t("common.previous")}</Button>
        {step < STEPS.length ? (
          <Button disabled={!canProceed()} onClick={() => setStep(step + 1)}>{t("common.next")}</Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t("hrg.saving") : t("hrg.perfNew.create")}
          </Button>
        )}
      </div>
    </div>
  );
}
