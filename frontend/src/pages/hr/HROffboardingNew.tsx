import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserMinus, ChevronRight, ChevronLeft, Check, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { usePayrollParams } from "@/hooks/useFinancialConfig";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
// generateSettlementPdf pulls jspdf — loaded on demand below.

// ─── Steps ──────────────────────────────────────────────────────────────────
const STEPS: { label: TranslationKey; description: TranslationKey }[] = [
  { label: "hrg.employee", description: "hrg.off.step1Desc" },
  { label: "hrg.off.step2", description: "hrg.off.step2Desc" },
  { label: "hrg.off.step3", description: "hrg.off.step3Desc" },
];

// LA CHECKLIST SE GUARDA EN ESPAÑOL. category/title/description se copian tal
// cual a employee_offboarding_tasks y los lee quien lleve el offboarding, en su
// idioma: son DATO, no pantalla. Lo que se DIBUJA en este paso sale de
// `TAREAS_VISIBLES` (mismo orden, índice por índice) y de `CATEGORIAS_VISIBLES`.
const DEFAULT_CHECKLIST = [
  { category: "Accesos", title: "Revocar correo corporativo", description: "Desactivar cuenta de email corporativo" },
  { category: "Accesos", title: "Revocar acceso a plataformas", description: "Slack, Notion, CRM y demás herramientas" },
  { category: "Accesos", title: "Revocar VPN/sistemas", description: "Desactivar acceso a VPN y sistemas internos" },
  { category: "Accesos", title: "Desactivar badge/tarjeta", description: "Desactivar tarjeta de acceso físico" },
  { category: "Equipamiento", title: "Devolución de laptop/PC", description: "Recoger equipo de cómputo asignado" },
  { category: "Equipamiento", title: "Devolución de badge/llaves", description: "Recoger tarjetas, llaves y accesos físicos" },
  { category: "Equipamiento", title: "Devolución de otros equipos", description: "Monitores, periféricos y otros equipos asignados" },
  { category: "Documentación", title: "Carta de terminación", description: "Generar y entregar carta de terminación laboral" },
  { category: "Documentación", title: "Paz y salvo", description: "Verificar que no existen deudas pendientes" },
  { category: "Documentación", title: "Certificado laboral", description: "Generar certificado laboral para el empleado" },
  { category: "Documentación", title: "Liquidación calculada", description: "Calcular y documentar la liquidación final" },
  { category: "Transferencia", title: "Transferencia de responsabilidades", description: "Reasignar tareas y responsabilidades" },
  { category: "Transferencia", title: "Documentación de procesos", description: "Documentar procesos y procedimientos del cargo" },
  { category: "Transferencia", title: "Entrega de archivos/proyectos", description: "Transferir archivos, proyectos y documentos" },
  { category: "Administrativo", title: "Notificación al equipo", description: "Comunicar la salida al equipo y áreas relevantes" },
  { category: "Administrativo", title: "Desvinculación de seguridad social", description: "Tramitar desvinculación de EPS, ARL, AFP" },
  { category: "Administrativo", title: "Cierre de nómina", description: "Procesar último pago y cierre de nómina" },
];

const TAREAS_VISIBLES: readonly (readonly [TranslationKey, TranslationKey])[] = [
  ["hrg.off.task.email", "hrg.off.task.emailDesc"],
  ["hrg.off.task.platforms", "hrg.off.task.platformsDesc"],
  ["hrg.off.task.vpn", "hrg.off.task.vpnDesc"],
  ["hrg.off.task.badge", "hrg.off.task.badgeDesc"],
  ["hrg.off.task.laptop", "hrg.off.task.laptopDesc"],
  ["hrg.off.task.keys", "hrg.off.task.keysDesc"],
  ["hrg.off.task.otherEquipment", "hrg.off.task.otherEquipmentDesc"],
  ["hrg.off.task.letter", "hrg.off.task.letterDesc"],
  ["hrg.off.task.clearance", "hrg.off.task.clearanceDesc"],
  ["hrg.off.task.certificate", "hrg.off.task.certificateDesc"],
  ["hrg.off.task.settlement", "hrg.off.task.settlementDesc"],
  ["hrg.off.task.handover", "hrg.off.task.handoverDesc"],
  ["hrg.off.task.processes", "hrg.off.task.processesDesc"],
  ["hrg.off.task.files", "hrg.off.task.filesDesc"],
  ["hrg.off.task.notifyTeam", "hrg.off.task.notifyTeamDesc"],
  ["hrg.off.task.socialSecurity", "hrg.off.task.socialSecurityDesc"],
  ["hrg.off.task.payrollClose", "hrg.off.task.payrollCloseDesc"],
];

const CATEGORIAS_VISIBLES: Record<string, TranslationKey> = {
  Accesos: "hrg.off.cat.access",
  Equipamiento: "hrg.off.cat.equipment",
  "Documentación": "hrg.off.cat.documents",
  Transferencia: "hrg.off.cat.handover",
  Administrativo: "hrg.off.cat.admin",
};

const TERMINATION_TYPES: { value: string; label: TranslationKey }[] = [
  { value: "voluntary", label: "hrg.off.term.voluntary" },
  { value: "involuntary", label: "hrg.off.term.involuntary" },
  { value: "end_of_contract", label: "hrg.off.term.endOfContract" },
  { value: "mutual_agreement", label: "hrg.off.term.mutual" },
];

// El motivo se guarda en español en employee_offboarding.termination_reason (lo
// leen otras personas): `value` es DATO. Se ve `label`.
const EXIT_REASONS: { value: string; label: TranslationKey }[] = [
  { value: "Mejor oferta laboral", label: "hrg.off.reason.betterOffer" },
  { value: "Problemas personales", label: "hrg.off.reason.personal" },
  { value: "Bajo rendimiento", label: "hrg.off.reason.lowPerformance" },
  { value: "Reestructuración", label: "hrg.off.reason.restructuring" },
  { value: "Fin de contrato", label: "hrg.off.reason.endOfContract" },
  { value: "Clima laboral", label: "hrg.off.reason.workEnvironment" },
  { value: "Otro", label: "hrg.off.reason.other" },
];

export default function HROffboardingNew() {
  const navigate = useNavigate();
  const formatoUi = useFormato();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { params: payrollParams } = usePayrollParams();

  const [step, setStep] = useState(0);

  // Step 1
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [terminationType, setTerminationType] = useState("");
  const [terminationDate, setTerminationDate] = useState("");
  const [exitInterviewDate, setExitInterviewDate] = useState("");

  // Step 2
  const [exitReason, setExitReason] = useState("");
  const [terminationDetail, setTerminationDetail] = useState("");

  // Step 3
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set(DEFAULT_CHECKLIST.map((_, i) => i)));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, department_id, departments(name), base_salary, hire_date")
        .eq("status", "activo")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existingOffboardingIds = [] } = useQuery({
    queryKey: ["existing-offboarding-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_offboarding")
        .select("employee_id")
        .eq("status", "in_progress");
      if (error) throw error;
      return (data ?? []).map((d) => d.employee_id);
    },
  });

  const availableEmployees = useMemo(
    () => employees.filter((e: any) => !existingOffboardingIds.includes(e.id)),
    [employees, existingOffboardingIds]
  );

  const selectedEmployee = useMemo(
    () => employees.find((e: any) => e.id === selectedEmployeeId) as any,
    [employees, selectedEmployeeId]
  );

  // Hour bank balance for selected employee
  const { data: hourBankBalance = 0 } = useQuery({
    queryKey: ["hour-bank-balance", selectedEmployeeId],
    enabled: !!selectedEmployeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hour_bank")
        .select("hours, movement_type")
        .eq("employee_id", selectedEmployeeId);
      if (error) throw error;
      return (data || []).reduce((acc, r) => acc + (r.movement_type === "deposit" ? Number(r.hours) : -Number(r.hours)), 0);
    },
  });

  // Vacation days taken
  const { data: vacationDaysTaken = 0 } = useQuery({
    queryKey: ["vacation-days-taken", selectedEmployeeId],
    enabled: !!selectedEmployeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("total_days")
        .eq("employee_id", selectedEmployeeId)
        .eq("absence_type", "vacacion_anual")
        .eq("status", "approved");
      if (error) throw error;
      return (data || []).reduce((acc, r) => acc + (Number(r.total_days) || 0), 0);
    },
  });

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
    if (s === 0) return !!selectedEmployeeId && !!terminationType && !!terminationDate;
    if (s === 1) return !!exitReason;
    if (s === 2) return selectedTasks.size > 0;
    return false;
  };

  const handleNext = () => {
    if (stepValid(step) && step < STEPS.length - 1) setStep(step + 1);
  };
  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  // Financial summary calculations
  const baseSalary = Number(selectedEmployee?.base_salary) || 0;
  const hireDate = selectedEmployee?.hire_date;
  const hourValue = payrollParams?.hour_bank?.hour_value || 0;
  const hourBankAmount = hourBankBalance * hourValue;

  // Vacation: 15 days per year in Colombia
  const yearsWorked = hireDate && terminationDate
    ? Math.max(0, (new Date(terminationDate).getTime() - new Date(hireDate).getTime()) / (365.25 * 86400000))
    : 0;
  const vacationDaysAccrued = Math.round(yearsWorked * 15 * 100) / 100;
  const vacationDaysPending = Math.max(0, vacationDaysAccrued - vacationDaysTaken);
  const vacationAmount = baseSalary > 0 ? (baseSalary / 30) * vacationDaysPending : 0;

  const fmt = (n: number) => new Intl.NumberFormat(formatoUi.intl("es-CO"), { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  const handleDownloadSettlement = async () => {
    if (!selectedEmployee) return;
    const { generateSettlementPdf } = await import("./generateSettlementPdf");
    generateSettlementPdf({
      employeeName: `${selectedEmployee.first_name} ${selectedEmployee.last_name}`,
      hireDate: hireDate || "",
      terminationDate,
      baseSalary,
      vacationDaysPending,
      vacationAmount,
      hourBankBalance,
      hourValue,
      hourBankAmount,
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: offboarding, error: obError } = await supabase
        .from("employee_offboarding")
        .insert({
          employee_id: selectedEmployeeId,
          termination_type: terminationType,
          termination_date: terminationDate,
          termination_reason: `${exitReason}${terminationDetail ? ` — ${terminationDetail}` : ""}`,
          exit_interview_date: exitInterviewDate || null,
          status: "in_progress",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (obError) throw obError;

      const tasksToInsert = Array.from(selectedTasks).map((index, position) => ({
        offboarding_id: offboarding.id,
        category: DEFAULT_CHECKLIST[index].category,
        title: DEFAULT_CHECKLIST[index].title,
        description: DEFAULT_CHECKLIST[index].description,
        position,
        status: "pending",
      }));

      if (tasksToInsert.length > 0) {
        const { error: taskError } = await supabase.from("employee_offboarding_tasks").insert(tasksToInsert);
        if (taskError) throw taskError;
      }

      // Update employee status
      await supabase.from("employees").update({
        status: "inactivo",
        termination_date: terminationDate,
      }).eq("id", selectedEmployeeId);

      queryClient.invalidateQueries({ queryKey: ["hr-offboardings"] });
      toast({ title: t("hrg.off.started") });
      navigate("/hr/offboarding");
    } catch {
      toast({ title: t("hrg.off.startError"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/offboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1" />{t("hrg.off.back")}
        </Button>
        <PageHeader
          title={t("hrg.off.title")}
          subtitle={t("hrg.off.subtitle")}
        />
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

          {/* Step 1: Employee & Termination */}
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hrg.off.terminationType")} <span className="text-destructive">*</span></Label>
                    <Select value={terminationType || undefined} onValueChange={setTerminationType}>
                      <SelectTrigger><SelectValue placeholder={t("hrg.selectType")} /></SelectTrigger>
                      <SelectContent>
                        {TERMINATION_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hrg.off.terminationDate")} <span className="text-destructive">*</span></Label>
                    <DateInput value={terminationDate} onChange={setTerminationDate} placeholder={t("hrg.selectDate")} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hrg.off.exitInterviewDate")}</Label>
                    <DateInput value={exitInterviewDate} onChange={setExitInterviewDate} placeholder={t("hrg.off.optional")} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Reason & Financial Summary */}
          {step === 1 && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div className="space-y-1.5">
                    <Label>{t("hrg.off.exitReason")} <span className="text-destructive">*</span></Label>
                    <Select value={exitReason || undefined} onValueChange={setExitReason}>
                      <SelectTrigger><SelectValue placeholder={t("hrg.off.selectReason")} /></SelectTrigger>
                      <SelectContent>
                        {EXIT_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{t(r.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hrg.off.reasonDetail")}</Label>
                    <Textarea placeholder={t("hrg.off.reasonDetailPlaceholder")} rows={3} value={terminationDetail} onChange={(e) => setTerminationDetail(e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              {selectedEmployee && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm font-semibold text-foreground mb-4">{t("hrg.off.financialSummary")}</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t("hrg.opt.histField.base_salary")}</span>
                        <span className="text-sm font-medium text-foreground">{fmt(baseSalary)}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t("hrg.off.pendingVacation")}</span>
                        <span className="text-sm font-medium text-foreground">{t("hrg.off.daysAmount", { days: vacationDaysPending.toFixed(1), amount: fmt(vacationAmount) })}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">{t("hrg.hourBank")}</span>
                        <span className="text-sm font-medium text-foreground">{hourBankBalance}h ({fmt(hourBankAmount)})</span>
                      </div>
                      <div className="flex items-center justify-between py-2 pt-3">
                        <span className="text-sm font-semibold text-foreground">{t("hrg.off.projectedTotal")}</span>
                        <span className="text-base font-bold text-primary">{fmt(baseSalary + vacationAmount + hourBankAmount)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Checklist */}
          {step === 2 && (
            <div className="space-y-6">
              <Card>
                <CardContent className="pt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t("hrg.off.checklistTitle")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("hrg.off.checklistHint")}</p>
                    </div>
                    {selectedEmployee && (
                      <Button variant="outline" size="sm" onClick={handleDownloadSettlement}>
                        <Download className="h-4 w-4 mr-1" />{t("hrg.off.projectedSettlement")}
                      </Button>
                    )}
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
            </div>
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
          <Button variant="outline" onClick={() => navigate("/hr/offboarding")}>{t("common.cancel")}</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!stepValid(step)}>
              {t("common.next")}<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!stepValid(step) || isSubmitting}>
              <UserMinus className="h-4 w-4 mr-1" />
              {isSubmitting ? t("hrg.starting") : t("hrg.off.title")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
