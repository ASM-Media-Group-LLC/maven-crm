import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useCostCenters } from "@/hooks/useFinancialConfig";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Steps ──────────────────────────────────────────────────────────────────
const STEPS: { label: TranslationKey; description: TranslationKey }[] = [
  { label: "hrg.employee", description: "hrg.onb.step1Desc" },
  { label: "hrg.onb.step2", description: "hrg.onb.step2Desc" },
  { label: "hrg.off.step3", description: "hrg.onb.step3Desc" },
];

// ─── Default checklist ──────────────────────────────────────────────────────
// LA CHECKLIST SE GUARDA EN ESPAÑOL. category/title/description se copian tal
// cual a employee_onboarding_tasks y los lee quien lleve el onboarding: son
// DATO, no pantalla. Lo que se DIBUJA sale de `TAREAS_VISIBLES` (mismo orden,
// índice por índice) y de `CATEGORIAS_VISIBLES`.
const DEFAULT_CHECKLIST = [
  { category: "Documentación", title: "Contrato firmado", description: "Contrato laboral revisado y firmado por ambas partes" },
  { category: "Documentación", title: "Documento de identidad", description: "Copia del documento de identidad verificada" },
  { category: "Documentación", title: "Foto carné", description: "Foto para credencial y sistemas internos" },
  { category: "Documentación", title: "Afiliaciones (EPS/ARL/AFP)", description: "Registro y afiliación a seguridad social completado" },
  { category: "Documentación", title: "Datos bancarios", description: "Información bancaria registrada para nómina" },
  { category: "Accesos", title: "Cuenta de correo corporativo", description: "Creación y entrega de credenciales de email" },
  { category: "Accesos", title: "Acceso a herramientas de trabajo", description: "Slack, Notion, CRM y demás plataformas" },
  { category: "Accesos", title: "Credenciales de plataforma", description: "Accesos a sistemas internos y VPN" },
  { category: "Equipamiento", title: "Entrega de equipo de cómputo", description: "Laptop/PC configurada y entregada" },
  { category: "Equipamiento", title: "Acceso a oficina / badge", description: "Tarjeta de acceso o llaves de oficina" },
  { category: "Formación", title: "Inducción general de la empresa", description: "Presentación de cultura, valores y políticas" },
  { category: "Formación", title: "Capacitación del área", description: "Formación específica del rol y procesos del equipo" },
  { category: "Formación", title: "Presentación al equipo", description: "Introducción formal con compañeros y líderes" },
];

const TAREAS_VISIBLES: readonly (readonly [TranslationKey, TranslationKey])[] = [
  ["hrg.onb.task.contract", "hrg.onb.task.contractDesc"],
  ["hrg.onb.task.id", "hrg.onb.task.idDesc"],
  ["hrg.onb.task.photo", "hrg.onb.task.photoDesc"],
  ["hrg.onb.task.socialSecurity", "hrg.onb.task.socialSecurityDesc"],
  ["hrg.onb.task.bank", "hrg.onb.task.bankDesc"],
  ["hrg.onb.task.email", "hrg.onb.task.emailDesc"],
  ["hrg.onb.task.tools", "hrg.onb.task.toolsDesc"],
  ["hrg.onb.task.credentials", "hrg.onb.task.credentialsDesc"],
  ["hrg.onb.task.computer", "hrg.onb.task.computerDesc"],
  ["hrg.onb.task.office", "hrg.onb.task.officeDesc"],
  ["hrg.onb.task.induction", "hrg.onb.task.inductionDesc"],
  ["hrg.onb.task.areaTraining", "hrg.onb.task.areaTrainingDesc"],
  ["hrg.onb.task.meetTeam", "hrg.onb.task.meetTeamDesc"],
];

const CATEGORIAS_VISIBLES: Record<string, TranslationKey> = {
  "Documentación": "hrg.off.cat.documents",
  Accesos: "hrg.off.cat.access",
  Equipamiento: "hrg.off.cat.equipment",
  "Formación": "hrg.onb.cat.training",
};

// El nombre del banco se guarda tal cual en employees.bank_name: es DATO. Solo
// "Otro" tiene otra forma de leerse.
const BANK_NAMES = ["Bancolombia", "Davivienda", "BBVA", "Banco de Bogotá", "Nequi", "Daviplata", "Scotiabank", "Banco Popular", "Otro"];
const ACCOUNT_TYPES: { value: string; label: TranslationKey }[] = [
  { value: "ahorros", label: "hrg.onb.account.savings" },
  { value: "corriente", label: "hrg.onb.account.checking" },
];

export default function HROnboardingNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { centers: costCenters } = useCostCenters();

  const [step, setStep] = useState(0);

  // Step 1
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [buddyId, setBuddyId] = useState("");
  const [notes, setNotes] = useState("");

  // Step 2
  const [baseSalary, setBaseSalary] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountType, setBankAccountType] = useState("ahorros");
  const [hourBankEnabled, setHourBankEnabled] = useState(false);

  // Step 3
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set(DEFAULT_CHECKLIST.map((_, i) => i)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, department_id, departments(name)")
        .eq("status", "activo")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existingOnboardingIds = [] } = useQuery({
    queryKey: ["existing-onboarding-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_onboarding")
        .select("employee_id")
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return (data ?? []).map((d) => d.employee_id);
    },
  });

  const availableEmployees = useMemo(
    () => employees.filter((e) => !existingOnboardingIds.includes(e.id)),
    [employees, existingOnboardingIds]
  );

  // Checklist helpers
  function toggleTask(index: number) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function toggleCategory(category: string) {
    const indices = DEFAULT_CHECKLIST.map((t, i) => (t.category === category ? i : -1)).filter((i) => i >= 0);
    const allSelected = indices.every((i) => selectedTasks.has(i));
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      indices.forEach((i) => (allSelected ? next.delete(i) : next.add(i)));
      return next;
    });
  }

  const categories = useMemo(() => {
    const map = new Map<string, { title: string; description: string; index: number }[]>();
    DEFAULT_CHECKLIST.forEach((t, i) => {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push({ title: t.title, description: t.description, index: i });
    });
    return Array.from(map.entries());
  }, []);

  // Validation
  const stepValid = (s: number) => {
    if (s === 0) return !!selectedEmployeeId;
    if (s === 1) return !!baseSalary && Number(baseSalary) > 0 && !!bankName && !!bankAccountNumber;
    if (s === 2) return selectedTasks.size > 0;
    return false;
  };

  const handleNext = () => {
    if (stepValid(step) && step < STEPS.length - 1) setStep(step + 1);
  };
  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Insert onboarding
      const { data: onboarding, error: obError } = await supabase
        .from("employee_onboarding")
        .insert({
          employee_id: selectedEmployeeId,
          start_date: startDate || null,
          buddy_employee_id: buddyId || null,
          notes: notes || null,
          status: "pending",
        })
        .select("id")
        .single();
      if (obError) throw obError;

      // 2. Insert tasks
      const tasksToInsert = Array.from(selectedTasks).map((index, position) => ({
        onboarding_id: onboarding.id,
        category: DEFAULT_CHECKLIST[index].category,
        title: DEFAULT_CHECKLIST[index].title,
        description: DEFAULT_CHECKLIST[index].description,
        position,
        status: "pending",
      }));
      if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from("employee_onboarding_tasks").insert(tasksToInsert);
        if (taskError) throw taskError;
      }

      // 3. Update employee financial data
      const { error: empError } = await supabase
        .from("employees")
        .update({
          base_salary: Number(baseSalary),
          cost_center: costCenter || null,
          bank_name: bankName || null,
          bank_account_number: bankAccountNumber || null,
          bank_account_type: bankAccountType,
          hour_bank_enabled: hourBankEnabled,
        } as any)
        .eq("id", selectedEmployeeId);
      if (empError) throw empError;

      // 4. If hour bank enabled, create initial record
      if (hourBankEnabled) {
        await supabase.from("hour_bank").insert({
          employee_id: selectedEmployeeId,
          hours: 0,
          movement_type: "deposit",
          // Se guarda en hour_bank.reason y lo lee RRHH en el banco de horas: DATO.
          reason: "Apertura de banco de horas",
          created_by: user?.id ?? null,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["hr-onboardings"] });
      toast({ title: t("hrg.onb.started") });
      navigate("/hr/onboarding");
    } catch {
      toast({ title: t("hrg.onb.startError"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/onboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1" />{t("hrg.onb.back")}
        </Button>
        <PageHeader title={t("hrg.onb.start")} subtitle={t("hrg.onb.newSubtitle")} />
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <div>
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  i < step ? "bg-gradient-to-r from-accent to-primary text-primary-foreground"
                  : i === step ? "bg-gradient-to-r from-accent to-primary text-primary-foreground ring-4 ring-accent/30"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <div className="hidden sm:block">
                  <p className={`text-sm font-medium ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>{t(s.label)}</p>
                  <p className="text-xs text-muted-foreground">{t(s.description)}</p>
                </div>
                {i < STEPS.length - 1 && <div className={`hidden sm:block w-12 h-0.5 mx-2 ${i < step ? "bg-gradient-to-r from-accent to-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div>

          {/* Step 1: Employee & Config */}
          {step === 0 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-1.5">
                  <Label>{t("hrg.employee")} <span className="text-destructive">*</span></Label>
                  <Select value={selectedEmployeeId || undefined} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger><SelectValue placeholder={t("hrg.selectEmployee")} /></SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.first_name} {e.last_name} {e.departments?.name ? `(${e.departments.name})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableEmployees.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t("hrg.onb.noEmployees")}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hrg.startDateOf")}</Label>
                    <DateInput value={startDate} onChange={setStartDate} placeholder={t("hrg.selectDate")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hrg.onb.buddy")}</Label>
                    <Select value={buddyId || undefined} onValueChange={setBuddyId}>
                      <SelectTrigger><SelectValue placeholder={t("hrg.onb.assignBuddy")} /></SelectTrigger>
                      <SelectContent>
                        {employees.filter((e: any) => e.id !== selectedEmployeeId).map((e: any) => (
                          <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("hrg.onb.initialNotes")}</Label>
                  <Textarea placeholder={t("hrg.onb.notesPlaceholder")} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Financial Data */}
          {step === 1 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hrg.opt.histField.base_salary")} <span className="text-destructive">*</span></Label>
                    <Input
                      type="number"
                      placeholder={t("hrg.onb.salaryPlaceholder")}
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(e.target.value)}
                      min={0}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hrg.onb.costCenter")}</Label>
                    <Select value={costCenter || undefined} onValueChange={setCostCenter}>
                      <SelectTrigger><SelectValue placeholder={t("hrg.onb.selectCenter")} /></SelectTrigger>
                      <SelectContent>
                        {costCenters.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">{t("hrg.bankDetails")}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("hrg.bank")} <span className="text-destructive">*</span></Label>
                      <Select value={bankName || undefined} onValueChange={setBankName}>
                        <SelectTrigger><SelectValue placeholder={t("hrg.onb.selectBank")} /></SelectTrigger>
                        <SelectContent>
                          {BANK_NAMES.map((b) => <SelectItem key={b} value={b}>{b === "Otro" ? t("hrg.onb.otherBank") : b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrg.onb.accountNumber")} <span className="text-destructive">*</span></Label>
                      <Input placeholder={t("hrg.onb.accountPlaceholder")} value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrg.onb.accountType")}</Label>
                      <Select value={bankAccountType} onValueChange={setBankAccountType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACCOUNT_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("hrg.onb.enableHourBank")}</p>
                    <p className="text-xs text-muted-foreground">{t("hrg.onb.enableHourBankHint")}</p>
                  </div>
                  <Switch checked={hourBankEnabled} onCheckedChange={setHourBankEnabled} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Checklist */}
          {step === 2 && (
            <Card>
              <CardContent className="pt-6 space-y-5">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t("hrg.onb.checklistTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("hrg.onb.checklistHint")}</p>
                </div>
                {categories.map(([category, tasks], catIdx) => {
                  const allSelected = tasks.every((t) => selectedTasks.has(t.index));
                  const someSelected = tasks.some((t) => selectedTasks.has(t.index));
                  return (
                    <div key={category}>
                      {catIdx > 0 && <Separator className="mb-4" />}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            // @ts-ignore
                            indeterminate={someSelected && !allSelected}
                            onCheckedChange={() => toggleCategory(category)}
                          />
                          <span className="text-sm font-semibold text-foreground">{CATEGORIAS_VISIBLES[category] ? t(CATEGORIAS_VISIBLES[category]) : category}</span>
                          <span className="text-xs text-muted-foreground">
                            ({tasks.filter((t) => selectedTasks.has(t.index)).length}/{tasks.length})
                          </span>
                        </div>
                        <div className="ml-6 space-y-2">
                          {tasks.map((task) => (
                            <label key={task.index} className="flex items-start gap-2.5 cursor-pointer group">
                              <Checkbox
                                checked={selectedTasks.has(task.index)}
                                onCheckedChange={() => toggleTask(task.index)}
                                className="mt-0.5"
                              />
                              <div>
                                <p className="text-sm text-foreground group-hover:text-primary transition-colors">{TAREAS_VISIBLES[task.index] ? t(TAREAS_VISIBLES[task.index][0]) : task.title}</p>
                                <p className="text-xs text-muted-foreground">{TAREAS_VISIBLES[task.index] ? t(TAREAS_VISIBLES[task.index][1]) : task.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-between">
        <div>
          {step > 0 && (
            <Button variant="outline" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4 mr-1" />{t("common.previous")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate("/hr/onboarding")}>{t("common.cancel")}</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!stepValid(step)}>
              {t("common.next")}<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!stepValid(step) || isSubmitting}>
              <UserPlus className="h-4 w-4 mr-1" />
              {isSubmitting ? t("hrg.starting") : t("hrg.onb.start")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
