import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User, ArrowLeft, FileText, AlertTriangle, GraduationCap, TrendingUp, Calendar, Building2, Phone, Mail, CreditCard, Link2, Link2Off, CheckCircle2, XCircle, Search, Clock, History, ExternalLink, Wifi, Laptop, DollarSign, Wallet, Receipt } from "lucide-react";
import { useEmployee, useEmployeeAbsences, useEmployeeIncidents, useEmployeeDocuments, useEmployeeTraining, useEmployeePerformance, useEmployeeHistory, useEmployeeAttendanceSummary, useEmployeeHourBankBalance, useEmployeeVacationBalance, useCreateEmployeeHistory, useEmployeePayrollHistory, useEmployeeCommissions, useEmployeeDeductions } from "@/hooks/useEmployee";
import { useAllProfiles, useLinkedProfile, useLinkEmployeeProfile, useUnlinkEmployeeProfile } from "@/hooks/useEmployees";

import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { EmployeeAreaBadge } from "@/components/hr/EmployeeAreaBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { etiquetaHr, etiquetaHrO, rolHr, type GrupoHr, type Traductor } from "./etiquetasHr";

// Cómo se pinta el rol vinculado. El nombre sale de rolHr (etiquetasHr.ts).
const ROLE_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  manager: "default",
  employee: "secondary",
  supervisor: "default",
  agent: "secondary",
  closer: "secondary",
};

// El historial guarda valores crudos (old_value/new_value). Los campos que son
// una lista conocida se leen con su etiqueta; el resto (ids, salario) tal cual.
const GRUPO_POR_CAMPO: Record<string, GrupoHr> = {
  status: "empStatus",
  contract_type: "contract",
  work_modality: "modality",
};
const valorHistorial = (t: Traductor, campo: string, valor: string) =>
  (GRUPO_POR_CAMPO[campo] ? etiquetaHr(t, GRUPO_POR_CAMPO[campo], valor) : undefined) ?? valor;

const MODALITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  remoto: Wifi,
  hibrido: Laptop,
  presencial: Building2,
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const f = useFormato();
  const { t } = useLanguage();
  const { data: employee, isLoading } = useEmployee(id);
  const { data: absences = [] } = useEmployeeAbsences(id);
  const { data: incidents = [] } = useEmployeeIncidents(id);
  const { data: documents = [] } = useEmployeeDocuments(id);
  const { data: training = [] } = useEmployeeTraining(id);
  const { data: performance = [] } = useEmployeePerformance(id);
  const { data: history = [] } = useEmployeeHistory(id);
  const { data: attendanceSummary } = useEmployeeAttendanceSummary(id);
  const { data: hourBankBalance } = useEmployeeHourBankBalance(id);
  const { data: vacationBalance } = useEmployeeVacationBalance(id);
  const { data: payrollHistory = [] } = useEmployeePayrollHistory(id);
  const { data: empCommissions = [] } = useEmployeeCommissions(id);
  const { data: empDeductions = [] } = useEmployeeDeductions(id);

  // Access tab state
  const [linkOpen, setLinkOpen] = useState(false);
  const { data: allProfiles = [] } = useAllProfiles();
  const { data: linkedProfile } = useLinkedProfile(employee?.profile_id ?? null);
  const linkMutation = useLinkEmployeeProfile();
  const unlinkMutation = useUnlinkEmployeeProfile();

  if (isLoading) {
    return (
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="p-6 space-y-4">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-muted-foreground">{t("hrg.prof.notFound")}</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/hr/directorio")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t("hrg.prof.backToDirectory")}
          </Button>
        </div>
      </main>
    );
  }

  const fullName = `${employee.first_name} ${employee.last_name}`;
  const ModalityIcon = MODALITY_ICONS[employee.work_modality ?? ""] ?? Building2;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hr/directorio")} aria-label={t("hrg.prof.backToDirectory")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <PageHeader
              title={
                <span className="flex items-center gap-3 flex-wrap">
                  {fullName}
                  <EmployeeStatusBadge status={employee.status} />
                  {employee.positions?.name && <Badge variant="outline">{employee.positions.name}</Badge>}
                </span>
              }
              subtitle={[employee.employee_code, employee.departments?.name, employee.hire_date ? t("hrg.prof.hiredOn", { date: format(new Date(employee.hire_date), "dd/MM/yyyy") }) : null].filter(Boolean).join(" · ")}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs defaultValue="resumen">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="resumen">{t("hrg.prof.tab.summary")}</TabsTrigger>
            <TabsTrigger value="info-laboral">{t("hrg.prof.tab.work")}</TabsTrigger>
            <TabsTrigger value="tiempo">{t("hrg.prof.tab.time")}</TabsTrigger>
            <TabsTrigger value="desempeno">{t("hrg.prof.tab.performance", { n: performance.length })}</TabsTrigger>
            <TabsTrigger value="documentos">{t("hrg.prof.tab.documents", { n: documents.length })}</TabsTrigger>
            <TabsTrigger value="finanzas">
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              {t("hrg.prof.tab.finance")}
            </TabsTrigger>
            <TabsTrigger value="historial">
              <History className="h-3.5 w-3.5 mr-1" />
              {t("hrg.prof.tab.history", { n: history.length })}
            </TabsTrigger>
            <TabsTrigger value="acceso" className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              {t("hrg.prof.tab.access")}
              <span className={cn("h-2 w-2 rounded-full inline-block", employee?.profile_id ? "bg-primary" : "bg-muted-foreground/40")} />
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Resumen ── */}
          <TabsContent value="resumen" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {employee.profile_photo_url ? (
                      <img src={employee.profile_photo_url} alt={fullName} className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-primary">{employee.first_name[0]}{employee.last_name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    <InfoField label={t("hrg.opt.histField.position_id")} value={employee.positions?.name} />
                    <InfoField label={t("hrg.department")}>
                      <EmployeeAreaBadge departmentName={employee.departments?.name} departmentCode={employee.departments?.code} />
                    </InfoField>
                    <InfoField label={t("hrg.dir.contract")} value={etiquetaHr(t, "contract", employee.contract_type) ?? employee.contract_type} capitalize />
                    <InfoField label={t("hrg.dir.hired")} value={employee.hire_date ? format(new Date(employee.hire_date), "dd/MM/yyyy") : undefined} />
                    <InfoField label={t("hrg.dir.modality")}>
                      <div className="flex items-center gap-1.5 mt-1">
                        <ModalityIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium capitalize">{etiquetaHrO(t, "modality", employee.work_modality)}</span>
                      </div>
                    </InfoField>
                    {employee.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground truncate">{employee.email}</p>
                      </div>
                    )}
                    {(employee.phone || employee.mobile) && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{employee.mobile ?? employee.phone}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Info Laboral ── */}
          <TabsContent value="info-laboral" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("hrg.prof.personal")}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label={t("common.name")} value={fullName} />
                  <InfoRow label={t("hrg.prof.document")} value={employee.national_id ? `${employee.national_id_type ?? "CC"}: ${employee.national_id}` : undefined} />
                  <InfoRow label={t("hrg.prof.birthDate")} value={employee.birth_date ? format(new Date(employee.birth_date), "dd/MM/yyyy") : undefined} />
                  <InfoRow label={t("hrg.prof.gender")} value={etiquetaHr(t, "gender", employee.gender) ?? employee.gender} />
                  <InfoRow label={t("common.city")} value={employee.city} />
                  <InfoRow label={t("common.address")} value={employee.address} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("hrg.prof.socialSecurity")}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="EPS" value={employee.eps} />
                  <InfoRow label="ARL" value={employee.arl} />
                  <InfoRow label="AFP" value={employee.afp} />
                  <InfoRow label={t("hrg.prof.compensationFund")} value={employee.caja_compensacion} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" />{t("hrg.bankDetails")}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label={t("hrg.bank")} value={employee.bank_name === "Otro" ? t("hrg.onb.otherBank") : employee.bank_name} />
                  <InfoRow label={t("hrg.prof.accountNo")} value={employee.bank_account_number} />
                  <InfoRow label={t("common.type")} value={etiquetaHr(t, "bankAccount", employee.bank_account_type) ?? employee.bank_account_type} />
                  <InfoRow label={t("hrg.opt.histField.base_salary")} value={employee.base_salary ? `$${employee.base_salary.toLocaleString(f.intl("es-CO"))}` : undefined} />
                  <InfoRow label={t("hrg.prof.frequency")} value={etiquetaHr(t, "salaryFreq", employee.salary_frequency) ?? employee.salary_frequency} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">{t("hrg.prof.emergency")}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label={t("common.name")} value={employee.emergency_contact_name} />
                  <InfoRow label={t("common.phone")} value={employee.emergency_contact_phone} />
                  <InfoRow label={t("hrg.prof.relationship")} value={employee.emergency_contact_relation} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Control de Tiempo (read-only cross-module) ── */}
          <TabsContent value="tiempo" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Attendance summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />{t("hrg.prof.attendance30")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attendanceSummary ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-2xl font-bold text-success">{attendanceSummary.present}</p>
                        <p className="text-xs text-muted-foreground">{t("hrg.att.kpi.present")}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-warning">{attendanceSummary.late}</p>
                        <p className="text-xs text-muted-foreground">{t("hrg.att.kpi.late")}</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">{attendanceSummary.absent}</p>
                        <p className="text-xs text-muted-foreground">{t("hrg.prof.absences")}</p>
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/asistencia")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>

              {/* Hour bank */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />{t("hrg.hourBank")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hourBankBalance ? (
                    <div className="text-center">
                      <p className={cn("text-3xl font-bold", hourBankBalance.balance >= 0 ? "text-success" : "text-destructive")}>
                        {hourBankBalance.balance >= 0 ? "+" : ""}{hourBankBalance.balance.toFixed(1)}h
                      </p>
                      <p className="text-xs text-muted-foreground">{t("hrg.prof.movements", { n: hourBankBalance.movements })}</p>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/horarios/banco-horas")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>

              {/* Vacations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" />{t("hrg.prof.vacationYear", { year: new Date().getFullYear() })}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vacationBalance ? (
                    <div className="text-center space-y-2">
                      <p className="text-3xl font-bold text-primary">{vacationBalance.available - vacationBalance.taken}</p>
                      <p className="text-xs text-muted-foreground">{t("hrg.prof.daysAvailableOf", { total: vacationBalance.total })}</p>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(vacationBalance.taken / vacationBalance.total) * 100}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">{t("hrg.prof.taken", { n: vacationBalance.taken })}</p>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/vacaciones")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Finanzas ── */}
          <TabsContent value="finanzas" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Nómina */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" />{t("hrg.prof.payrollHistory")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payrollHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("hrg.prof.noPayroll")}</p>
                  ) : (
                    payrollHistory.slice(0, 5).map((pd: any) => (
                      <div key={pd.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{pd.payroll_periods?.period_name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{t("hrg.prof.grossNet", { gross: `$${Number(pd.gross_salary || 0).toLocaleString(f.intl("es-CO"))}`, net: `$${Number(pd.net_total || 0).toLocaleString(f.intl("es-CO"))}` })}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{pd.payroll_periods?.status ?? "—"}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/finanzas/nomina")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>

              {/* Comisiones */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />{t("hrg.prof.commissions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {empCommissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("hrg.prof.noCommissions")}</p>
                  ) : (
                    empCommissions.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{c.period}</p>
                          <p className="text-xs text-muted-foreground">{c.commission_type} · Est: ${Number(c.estimated_amount || 0).toLocaleString(f.intl("es-CO"))}</p>
                        </div>
                        <Badge variant={c.status === "pagado" ? "default" : "secondary"} className="text-xs">{etiquetaHrO(t, "commissionStatus", c.status)}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/finanzas/horas-variables")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>

              {/* Deducciones */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" />{t("hrg.prof.deductions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {empDeductions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("hrg.prof.noDeductions")}</p>
                  ) : (
                    empDeductions.slice(0, 5).map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{etiquetaHrO(t, "deductionType", d.deduction_type)}</p>
                          <p className="text-xs text-muted-foreground">{d.month_year} · ${Number(d.amount || 0).toLocaleString(f.intl("es-CO"))}</p>
                        </div>
                        <Badge variant={d.status === "applied" ? "default" : "secondary"} className="text-xs">{etiquetaHrO(t, "deductionStatus", d.status)}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/deducciones")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />{t("hrg.viewDetail")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Desempeño ── */}
          <TabsContent value="desempeno" className="mt-4">
            {performance.length === 0 ? (
              <EmptyState icon={TrendingUp} label={t("hrg.prof.noEvaluations")} />
            ) : (
              <div className="space-y-2">
                {performance.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{p.period}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(p.evaluation_date), "dd/MM/yyyy")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-primary">{p.overall_score?.toFixed(1) ?? "—"}<span className="text-xs text-muted-foreground font-normal">/5</span></p>
                        <Badge variant="secondary">{etiquetaHrO(t, "perfStatus", p.status)}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Documentos ── */}
          <TabsContent value="documentos" className="mt-4">
            {documents.length === 0 ? (
              <EmptyState icon={FileText} label={t("hrg.prof.noDocuments")} />
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{etiquetaHrO(t, "docType", doc.document_type)} · {format(new Date(doc.uploaded_at), "dd/MM/yyyy")}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">{t("common.view")}</a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Historial ── */}
          <TabsContent value="historial" className="mt-4">
            {history.length === 0 ? (
              <EmptyState icon={History} label={t("hrg.prof.noHistory")} />
            ) : (
              <div className="relative space-y-0">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                {history.map((h) => {
                  const typeLabel = etiquetaHrO(t, "histType", h.change_type);
                  const fieldLabel = etiquetaHrO(t, "histField", h.field_changed);
                  return (
                    <div key={h.id} className="relative pl-10 py-4">
                      <div className="absolute left-2.5 top-5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(h.effective_date), "dd MMM yyyy", { locale: f.fechas })}</span>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{fieldLabel}:</span>{" "}
                          {h.old_value && <span className="line-through text-muted-foreground/60">{valorHistorial(t, h.field_changed, h.old_value)}</span>}
                          {h.old_value && h.new_value && " → "}
                          {h.new_value && <span className="font-medium">{valorHistorial(t, h.field_changed, h.new_value)}</span>}
                        </p>
                        {h.reason && <p className="text-xs text-muted-foreground">{t("hrg.prof.reasonLine", { reason: h.reason })}</p>}
                        {h.notes && <p className="text-xs text-muted-foreground italic">{h.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Acceso ── */}
          <TabsContent value="acceso" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  {t("hrg.prof.platformAccess")}
                </CardTitle>
                <CardDescription>
                  {t("hrg.prof.platformAccessHint")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {employee?.profile_id && linkedProfile ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      {t("hrg.prof.accessActive")}
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <UserAvatar name={linkedProfile.full_name} src={linkedProfile.avatar_url} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{linkedProfile.full_name ?? t("hrg.noName")}</p>
                        {linkedProfile.role && (
                          <Badge variant={ROLE_VARIANTS[linkedProfile.role] ?? "outline"} className="mt-1 text-xs">
                            {rolHr(t, linkedProfile.role)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => id && unlinkMutation.mutate(id)}
                      disabled={unlinkMutation.isPending}
                    >
                      <Link2Off className="h-4 w-4 mr-2" />
                      {unlinkMutation.isPending ? t("hrg.prof.unlinking") : t("hrg.prof.unlink")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      {t("hrg.prof.noAccess")}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("hrg.prof.noAccessHint")}
                    </p>
                    <Popover open={linkOpen} onOpenChange={setLinkOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Search className="h-4 w-4 mr-2" />
                          {t("hrg.prof.linkExisting")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("hrg.prof.searchUser")} />
                          <CommandList>
                            <CommandEmpty>{t("hrg.prof.noUsers")}</CommandEmpty>
                            <CommandGroup>
                              {allProfiles.map((profile) => (
                                <CommandItem
                                  key={profile.id}
                                  value={profile.full_name ?? profile.id}
                                  onSelect={() => {
                                    if (id) linkMutation.mutate({ employeeId: id, profileId: profile.id });
                                    setLinkOpen(false);
                                  }}
                                >
                                  <UserAvatar name={profile.full_name} src={profile.avatar_url} size="xs" className="mr-2" />
                                  {profile.full_name ?? t("hrg.noName")}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function InfoField({ label, value, capitalize, children }: { label: string; value?: string | null; capitalize?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? <p className={cn("text-sm font-medium mt-1", capitalize && "capitalize")}>{value ?? "—"}</p>}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium truncate">{value ?? "—"}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
