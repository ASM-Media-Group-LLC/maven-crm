import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { User, ArrowLeft, FileText, AlertTriangle, GraduationCap, TrendingUp, Calendar, Building2, Phone, Mail, CreditCard, Link2, Link2Off, CheckCircle2, XCircle, Search } from "lucide-react";
import { useEmployee, useEmployeeAbsences, useEmployeeIncidents, useEmployeeDocuments, useEmployeeTraining, useEmployeePerformance } from "@/hooks/useEmployee";
import { useAllProfiles, useLinkedProfile, useLinkEmployeeProfile, useUnlinkEmployeeProfile } from "@/hooks/useEmployees";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
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
import { ABSENCE_TYPES, INCIDENT_SEVERITIES, TRAINING_STATUSES, PERFORMANCE_EVALUATION_STATUSES } from "@/lib/hrConstants";
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

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: employee, isLoading } = useEmployee(id);
  const { data: absences = [] } = useEmployeeAbsences(id);
  const { data: incidents = [] } = useEmployeeIncidents(id);
  const { data: documents = [] } = useEmployeeDocuments(id);
  const { data: training = [] } = useEmployeeTraining(id);
  const { data: performance = [] } = useEmployeePerformance(id);

  // Access tab state
  const [linkOpen, setLinkOpen] = useState(false);
  const { data: allProfiles = [] } = useAllProfiles();
  const { data: linkedProfile } = useLinkedProfile(employee?.profile_id ?? null);
  const linkMutation = useLinkEmployeeProfile();
  const unlinkMutation = useUnlinkEmployeeProfile();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Empleado no encontrado.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/hr/directorio")}>
          Volver al directorio
        </Button>
      </div>
    );
  }

  const fullName = `${employee.first_name} ${employee.last_name}`;

  return (
    <div className="p-6 space-y-6">
      <HRPageHeader
        title={fullName}
        subtitle={`${employee.employee_code ?? ""} · ${employee.positions?.name ?? "Sin cargo"}`}
        icon={User}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/hr/directorio")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Button>
        }
      />

      {/* Summary card */}
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
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <EmployeeStatusBadge status={employee.status} className="mt-1" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Departamento</p>
                <EmployeeAreaBadge departmentName={employee.departments?.name} departmentCode={employee.departments?.code} className="mt-1" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Contrato</p>
                <p className="text-sm font-medium capitalize mt-1">{employee.contract_type ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingreso</p>
                <p className="text-sm font-medium mt-1">{employee.hire_date ? format(new Date(employee.hire_date), "dd/MM/yyyy") : "—"}</p>
              </div>
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
              {employee.work_modality && (
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground capitalize">{employee.work_modality}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="absences">Ausencias ({absences.length})</TabsTrigger>
          <TabsTrigger value="incidents">Incidentes ({incidents.length})</TabsTrigger>
          <TabsTrigger value="training">Capacitación ({training.length})</TabsTrigger>
          <TabsTrigger value="performance">Desempeño ({performance.length})</TabsTrigger>
          <TabsTrigger value="documents">Documentos ({documents.length})</TabsTrigger>
          <TabsTrigger value="access" className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Acceso
            {employee?.profile_id ? (
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Info */}
        <TabsContent value="info" className="mt-4 space-y-4">
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

        {/* Absences */}
        <TabsContent value="absences" className="mt-4">
          {absences.length === 0 ? (
            <EmptyState icon={Calendar} label="Sin ausencias registradas" />
          ) : (
            <div className="space-y-2">
              {absences.map((a) => (
                <Card key={a.id}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{ABSENCE_TYPES.find((t) => t.value === a.absence_type)?.label ?? a.absence_type}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(a.start_date), "dd MMM yyyy", { locale: es })} → {format(new Date(a.end_date), "dd MMM yyyy", { locale: es })} · {a.total_days ?? "?"} días</p>
                    </div>
                    <Badge variant={a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"}>
                      {a.status === "approved" ? "Aprobada" : a.status === "rejected" ? "Rechazada" : "Pendiente"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Incidents */}
        <TabsContent value="incidents" className="mt-4">
          {incidents.length === 0 ? (
            <EmptyState icon={AlertTriangle} label="Sin incidentes registrados" />
          ) : (
            <div className="space-y-2">
              {incidents.map((inc) => {
                const sev = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;
                return (
                  <Card key={inc.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5", sev.bg, sev.text)}>
                          {INCIDENT_SEVERITIES.find((s) => s.value === inc.severity)?.label ?? inc.severity}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{inc.title}</p>
                          <p className="text-xs text-muted-foreground">{inc.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{format(new Date(inc.incident_date), "dd/MM/yyyy")}</p>
                        </div>
                        <Badge variant={inc.status === "resolved" ? "default" : "secondary"}>{inc.status === "resolved" ? "Resuelto" : inc.status === "closed" ? "Cerrado" : "Abierto"}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Training */}
        <TabsContent value="training" className="mt-4">
          {training.length === 0 ? (
            <EmptyState icon={GraduationCap} label="Sin capacitaciones asignadas" />
          ) : (
            <div className="space-y-2">
              {training.map((t) => {
                const prog = (t as any).training_programs;
                const progress = t.status === "completed" ? 100 : t.status === "in_progress" ? 50 : 0;
                return (
                  <Card key={t.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{prog?.name ?? "—"}</p>
                        <Badge variant="secondary">{TRAINING_STATUSES.find((s) => s.value === t.status)?.label ?? t.status}</Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-primary transition-all rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                      {prog?.duration_hours && <p className="text-xs text-muted-foreground">{prog.duration_hours}h · {prog.modality}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="mt-4">
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

        {/* Documents */}
        <TabsContent value="documents" className="mt-4">
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

        {/* Access tab */}
        <TabsContent value="access" className="mt-4">
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
                        <Badge
                          variant={ROLE_LABELS[linkedProfile.role]?.variant ?? "outline"}
                          className="mt-1 text-xs"
                        >
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
                                  if (id) {
                                    linkMutation.mutate({ employeeId: id, profileId: profile.id });
                                  }
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
