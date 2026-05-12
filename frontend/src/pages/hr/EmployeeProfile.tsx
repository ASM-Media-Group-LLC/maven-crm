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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ABSENCE_TYPES, INCIDENT_SEVERITIES, TRAINING_STATUSES, PERFORMANCE_EVALUATION_STATUSES, HISTORY_CHANGE_TYPES, HISTORY_FIELD_LABELS } from "@/lib/hrConstants";
import { SEVERITY_COLORS } from "@/lib/hrAreaUtils";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  admin: { label: "Admin", variant: "destructive" },
  manager: { label: "Manager", variant: "default" },
  employee: { label: "Empleado", variant: "secondary" },
  supervisor: { label: "Supervisor", variant: "default" },
  agent: { label: "Agente", variant: "secondary" },
  closer: { label: "Closer", variant: "secondary" },
};

const MODALITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  remoto: Wifi,
  hibrido: Laptop,
  presencial: Building2,
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
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
          <p className="text-muted-foreground">Empleado no encontrado.</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate("/hr/directorio")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver al directorio
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/hr/directorio")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">{fullName}</h1>
              <EmployeeStatusBadge status={employee.status} />
              {employee.positions?.name && <Badge variant="outline">{employee.positions.name}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[employee.employee_code, employee.departments?.name, employee.hire_date ? `Ingreso: ${format(new Date(employee.hire_date), "dd/MM/yyyy")}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs defaultValue="resumen">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="info-laboral">Info Laboral</TabsTrigger>
            <TabsTrigger value="tiempo">Control de Tiempo</TabsTrigger>
            <TabsTrigger value="desempeno">Desempeño ({performance.length})</TabsTrigger>
            <TabsTrigger value="documentos">Documentos ({documents.length})</TabsTrigger>
            <TabsTrigger value="finanzas">
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              Finanzas
            </TabsTrigger>
            <TabsTrigger value="historial">
              <History className="h-3.5 w-3.5 mr-1" />
              Historial ({history.length})
            </TabsTrigger>
            <TabsTrigger value="acceso" className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Acceso
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
                    <InfoField label="Cargo" value={employee.positions?.name} />
                    <InfoField label="Departamento">
                      <EmployeeAreaBadge departmentName={employee.departments?.name} departmentCode={employee.departments?.code} />
                    </InfoField>
                    <InfoField label="Contrato" value={employee.contract_type} capitalize />
                    <InfoField label="Ingreso" value={employee.hire_date ? format(new Date(employee.hire_date), "dd/MM/yyyy") : undefined} />
                    <InfoField label="Modalidad">
                      <div className="flex items-center gap-1.5 mt-1">
                        <ModalityIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium capitalize">{employee.work_modality ?? "—"}</span>
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
                <CardHeader className="pb-2"><CardTitle className="text-sm">Datos Personales</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Nombre" value={fullName} />
                  <InfoRow label="Documento" value={employee.national_id ? `${employee.national_id_type ?? "CC"}: ${employee.national_id}` : undefined} />
                  <InfoRow label="Fecha Nac." value={employee.birth_date ? format(new Date(employee.birth_date), "dd/MM/yyyy") : undefined} />
                  <InfoRow label="Género" value={employee.gender} />
                  <InfoRow label="Ciudad" value={employee.city} />
                  <InfoRow label="Dirección" value={employee.address} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Seguridad Social</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="EPS" value={employee.eps} />
                  <InfoRow label="ARL" value={employee.arl} />
                  <InfoRow label="AFP" value={employee.afp} />
                  <InfoRow label="Caja de Comp." value={employee.caja_compensacion} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4" />Datos Bancarios</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Banco" value={employee.bank_name} />
                  <InfoRow label="No. Cuenta" value={employee.bank_account_number} />
                  <InfoRow label="Tipo" value={employee.bank_account_type} />
                  <InfoRow label="Salario Base" value={employee.base_salary ? `$${employee.base_salary.toLocaleString("es-CO")}` : undefined} />
                  <InfoRow label="Frecuencia" value={employee.salary_frequency} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Contacto de Emergencia</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Nombre" value={employee.emergency_contact_name} />
                  <InfoRow label="Teléfono" value={employee.emergency_contact_phone} />
                  <InfoRow label="Parentesco" value={employee.emergency_contact_relation} />
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
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Asistencia (30 días)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attendanceSummary ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-2xl font-bold text-success">{attendanceSummary.present}</p>
                        <p className="text-xs text-muted-foreground">Presentes</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-warning">{attendanceSummary.late}</p>
                        <p className="text-xs text-muted-foreground">Tardanzas</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">{attendanceSummary.absent}</p>
                        <p className="text-xs text-muted-foreground">Ausencias</p>
                      </div>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/asistencia")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
                  </Button>
                </CardContent>
              </Card>

              {/* Hour bank */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Banco de Horas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {hourBankBalance ? (
                    <div className="text-center">
                      <p className={cn("text-3xl font-bold", hourBankBalance.balance >= 0 ? "text-success" : "text-destructive")}>
                        {hourBankBalance.balance >= 0 ? "+" : ""}{hourBankBalance.balance.toFixed(1)}h
                      </p>
                      <p className="text-xs text-muted-foreground">{hourBankBalance.movements} movimientos</p>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/horarios/banco-horas")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
                  </Button>
                </CardContent>
              </Card>

              {/* Vacations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" />Vacaciones {new Date().getFullYear()}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vacationBalance ? (
                    <div className="text-center space-y-2">
                      <p className="text-3xl font-bold text-primary">{vacationBalance.available - vacationBalance.taken}</p>
                      <p className="text-xs text-muted-foreground">días disponibles de {vacationBalance.total}</p>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(vacationBalance.taken / vacationBalance.total) * 100}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">{vacationBalance.taken} tomados</p>
                    </div>
                  ) : (
                    <Skeleton className="h-16" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/vacaciones")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
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
                  <CardTitle className="text-sm flex items-center gap-2"><Receipt className="h-4 w-4" />Historial de Nómina</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payrollHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin registros de nómina</p>
                  ) : (
                    payrollHistory.slice(0, 5).map((pd: any) => (
                      <div key={pd.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{pd.payroll_periods?.period_name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">Bruto: ${Number(pd.gross_salary || 0).toLocaleString("es-CO")} · Neto: ${Number(pd.net_total || 0).toLocaleString("es-CO")}</p>
                        </div>
                        <Badge variant="outline" className="text-xs">{pd.payroll_periods?.status ?? "—"}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/finanzas/nomina")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
                  </Button>
                </CardContent>
              </Card>

              {/* Comisiones */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Comisiones</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {empCommissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin comisiones registradas</p>
                  ) : (
                    empCommissions.slice(0, 5).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{c.period}</p>
                          <p className="text-xs text-muted-foreground">{c.commission_type} · Est: ${Number(c.estimated_amount || 0).toLocaleString("es-CO")}</p>
                        </div>
                        <Badge variant={c.status === "pagado" ? "default" : "secondary"} className="text-xs">{c.status}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/finanzas/horas-variables")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
                  </Button>
                </CardContent>
              </Card>

              {/* Deducciones */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Wallet className="h-4 w-4" />Deducciones</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {empDeductions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin deducciones registradas</p>
                  ) : (
                    empDeductions.slice(0, 5).map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors">
                        <div>
                          <p className="font-medium">{d.deduction_type}</p>
                          <p className="text-xs text-muted-foreground">{d.month_year} · ${Number(d.amount || 0).toLocaleString("es-CO")}</p>
                        </div>
                        <Badge variant={d.status === "applied" ? "default" : "secondary"} className="text-xs">{d.status}</Badge>
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/hr/deducciones")}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />Ver detalle
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Desempeño ── */}
          <TabsContent value="desempeno" className="mt-4">
            {performance.length === 0 ? (
              <EmptyState icon={TrendingUp} label="Sin evaluaciones registradas" />
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
                        <Badge variant="secondary">{PERFORMANCE_EVALUATION_STATUSES.find((s) => s.value === p.status)?.label ?? p.status}</Badge>
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
              <EmptyState icon={FileText} label="Sin documentos cargados" />
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card key={doc.id}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.file_name}</p>
                        <p className="text-xs text-muted-foreground">{doc.document_type} · {format(new Date(doc.uploaded_at), "dd/MM/yyyy")}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">Ver</a>
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
              <EmptyState icon={History} label="Sin cambios registrados" />
            ) : (
              <div className="relative space-y-0">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                {history.map((h) => {
                  const typeLabel = HISTORY_CHANGE_TYPES.find(t => t.value === h.change_type)?.label ?? h.change_type;
                  const fieldLabel = HISTORY_FIELD_LABELS[h.field_changed] ?? h.field_changed;
                  return (
                    <div key={h.id} className="relative pl-10 py-4">
                      <div className="absolute left-2.5 top-5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{typeLabel}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(h.effective_date), "dd MMM yyyy", { locale: es })}</span>
                        </div>
                        <p className="text-sm">
                          <span className="text-muted-foreground">{fieldLabel}:</span>{" "}
                          {h.old_value && <span className="line-through text-muted-foreground/60">{h.old_value}</span>}
                          {h.old_value && h.new_value && " → "}
                          {h.new_value && <span className="font-medium">{h.new_value}</span>}
                        </p>
                        {h.reason && <p className="text-xs text-muted-foreground">Motivo: {h.reason}</p>}
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
                  Acceso a Plataforma
                </CardTitle>
                <CardDescription>
                  Vincula este empleado a una cuenta de usuario de la plataforma. Es opcional: un empleado puede existir sin acceso.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {employee?.profile_id && linkedProfile ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Acceso activo
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={linkedProfile.avatar_url ?? ""} />
                        <AvatarFallback>{(linkedProfile.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{linkedProfile.full_name ?? "Sin nombre"}</p>
                        {linkedProfile.role && (
                          <Badge variant={ROLE_LABELS[linkedProfile.role]?.variant ?? "outline"} className="mt-1 text-xs">
                            {ROLE_LABELS[linkedProfile.role]?.label ?? linkedProfile.role}
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
                      {unlinkMutation.isPending ? "Desvinculando..." : "Desvincular usuario"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      Sin acceso a plataforma
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Este empleado no tiene una cuenta de usuario vinculada. Puede operar sin acceso o vincularse a un usuario existente.
                    </p>
                    <Popover open={linkOpen} onOpenChange={setLinkOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Search className="h-4 w-4 mr-2" />
                          Vincular usuario existente
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar usuario..." />
                          <CommandList>
                            <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
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
                                  <Avatar className="h-6 w-6 mr-2">
                                    <AvatarImage src={profile.avatar_url ?? ""} />
                                    <AvatarFallback className="text-xs">{(profile.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  {profile.full_name ?? "Sin nombre"}
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
