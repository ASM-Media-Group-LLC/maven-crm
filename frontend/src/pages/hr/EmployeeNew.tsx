import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Check, CalendarIcon, Search, Link2, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useDepartments, usePositions, useAllProfiles } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  CONTRACT_TYPES, WORK_MODALITIES, NATIONAL_ID_TYPES, GENDER_OPTIONS,
  SALARY_FREQUENCIES, BANK_ACCOUNT_TYPES, EPS_OPTIONS, ARL_OPTIONS, AFP_OPTIONS,
} from "@/lib/hrConstants";

const schema = z.object({
  first_name: z.string().min(1, "Requerido"),
  last_name: z.string().min(1, "Requerido"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  birth_date: z.string().optional(),
  gender: z.string().optional(),
  national_id_type: z.string().optional(),
  national_id: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  emergency_contact_relation: z.string().optional(),
  department_id: z.string().optional(),
  position_id: z.string().optional(),
  hire_date: z.string().optional(),
  contract_type: z.string().optional(),
  work_modality: z.string().optional(),
  base_salary: z.string().optional(),
  salary_frequency: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_account_type: z.string().optional(),
  bank_notes: z.string().optional(),
  has_commission: z.string().optional(),
  eps: z.string().optional(),
  arl: z.string().optional(),
  afp: z.string().optional(),
  caja_compensacion: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: "Datos Personales" },
  { id: 2, label: "Datos Laborales" },
  { id: 3, label: "Seguridad Social" },
  { id: 4, label: "Información Bancaria" },
  { id: 5, label: "Acceso (opcional)" },
];

export default function EmployeeNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [birthDate, setBirthDate] = useState<Date | undefined>();
  const [hireDate, setHireDate] = useState<Date | undefined>();
  const [linkedProfileId, setLinkedProfileId] = useState<string | null>(null);
  const [profileSearchOpen, setProfileSearchOpen] = useState(false);

  const { data: departments = [] } = useDepartments();
  const { data: allProfiles = [] } = useAllProfiles();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { country: "Colombia", national_id_type: "CC", contract_type: "indefinido", work_modality: "presencial", salary_frequency: "mensual", bank_account_type: "ahorros" } });
  const { register, handleSubmit, watch, setValue, formState: { errors } } = form;

  const selectedDept = watch("department_id");
  const { data: positions = [] } = usePositions(selectedDept);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email || null,
        phone: values.phone || null,
        mobile: values.mobile || null,
        birth_date: birthDate ? format(birthDate, "yyyy-MM-dd") : null,
        gender: values.gender || null,
        national_id_type: values.national_id_type || null,
        national_id: values.national_id || null,
        address: values.address || null,
        city: values.city || null,
        country: values.country || null,
        emergency_contact_name: values.emergency_contact_name || null,
        emergency_contact_phone: values.emergency_contact_phone || null,
        emergency_contact_relation: values.emergency_contact_relation || null,
        department_id: values.department_id || null,
        position_id: values.position_id || null,
        hire_date: hireDate ? format(hireDate, "yyyy-MM-dd") : null,
        contract_type: values.contract_type || null,
        work_modality: values.work_modality || null,
        base_salary: values.base_salary ? parseFloat(values.base_salary) : null,
        salary_frequency: values.salary_frequency || null,
        bank_name: values.bank_name || null,
        bank_account_number: values.bank_account_number || null,
        bank_account_type: values.bank_account_type || null,
        eps: values.eps || null,
        arl: values.arl || null,
        afp: values.afp || null,
        caja_compensacion: values.caja_compensacion || null,
        bank_notes: values.bank_notes || null,
        has_commission: values.has_commission === "si",
        notes: values.notes || null,
        created_by: user?.id,
        profile_id: linkedProfileId || null,
      };
      const { error } = await supabase.from("employees").insert(payload);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Empleado creado correctamente" });
      navigate("/hr/directorio");
    } catch {
      toast({ title: "Error al crear el empleado", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/hr/directorio")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver al Directorio
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Nuevo Empleado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Complete los datos para registrar un nuevo empleado</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b bg-background px-6 py-3 space-y-3">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                className={cn("flex items-center gap-2 text-sm font-medium transition-colors", step === s.id ? "text-foreground" : step > s.id ? "text-foreground/70" : "text-muted-foreground")}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all", step === s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30" : step > s.id ? "border-transparent bg-gradient-to-r from-accent to-primary text-white" : "border-muted-foreground/30 text-muted-foreground")}>
                  {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={cn("h-px flex-1 mx-2 transition-colors", step > s.id ? "bg-gradient-to-r from-accent to-primary" : "bg-border")} />}
            </div>
          ))}
        </div>
        <Progress value={(step / STEPS.length) * 100} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
      </div>

      {/* Scrollable content */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-auto px-6 py-6">
          <div>
            {/* Step 1: Personal Info */}
            {step === 1 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Datos Personales</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nombres <span className="text-destructive">*</span></Label>
                    <Input {...register("first_name")} placeholder="Nombre(s)" />
                    {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Apellidos <span className="text-destructive">*</span></Label>
                    <Input {...register("last_name")} placeholder="Apellido(s)" />
                    {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de Documento</Label>
                    <Select onValueChange={(v) => setValue("national_id_type", v)} defaultValue="CC">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{NATIONAL_ID_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Número de Documento</Label>
                    <Input {...register("national_id")} placeholder="Ej: 1234567890" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input {...register("email")} type="email" placeholder="correo@empresa.com" />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Teléfono</Label>
                    <PhoneInput value={watch("phone") || ""} onChange={(v) => setValue("phone", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Celular</Label>
                    <PhoneInput value={watch("mobile") || ""} onChange={(v) => setValue("mobile", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fecha de Nacimiento</Label>
                    <DateInput
                      value={birthDate ? format(birthDate, "yyyy-MM-dd") : ""}
                      onChange={(v) => {
                        if (v) {
                          setBirthDate(new Date(v + "T12:00:00"));
                        } else {
                          setBirthDate(undefined);
                        }
                      }}
                      toYear={new Date().getFullYear()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Género</Label>
                    <Select onValueChange={(v) => setValue("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>{GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ciudad</Label>
                    <Input {...register("city")} placeholder="Bogotá" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Dirección</Label>
                    <Input {...register("address")} placeholder="Calle / Carrera / Manzana..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contacto de Emergencia</Label>
                    <Input {...register("emergency_contact_name")} placeholder="Nombre del contacto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Teléfono de Emergencia</Label>
                    <PhoneInput value={watch("emergency_contact_phone") || ""} onChange={(v) => setValue("emergency_contact_phone", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Parentesco</Label>
                    <Input {...register("emergency_contact_relation")} placeholder="Ej: Cónyuge, Madre..." />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Work info */}
            {step === 2 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Datos Laborales</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Departamento</Label>
                    <Select onValueChange={(v) => { setValue("department_id", v); setValue("position_id", ""); }}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar departamento" /></SelectTrigger>
                      <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cargo</Label>
                    <Select onValueChange={(v) => setValue("position_id", v)} disabled={!selectedDept && positions.length === 0}>
                      <SelectTrigger><SelectValue placeholder={selectedDept ? "Seleccionar cargo" : "Primero elige departamento"} /></SelectTrigger>
                      <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fecha de Ingreso</Label>
                    <DateInput
                      value={hireDate ? format(hireDate, "yyyy-MM-dd") : ""}
                      onChange={(v) => {
                        if (v) {
                          setHireDate(new Date(v + "T12:00:00"));
                        } else {
                          setHireDate(undefined);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de Contrato</Label>
                    <Select onValueChange={(v) => setValue("contract_type", v)} defaultValue="indefinido">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONTRACT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Modalidad de Trabajo</Label>
                    <Select onValueChange={(v) => setValue("work_modality", v)} defaultValue="presencial">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{WORK_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Salario Base</Label>
                    <Input {...register("base_salary")} type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Frecuencia de Pago</Label>
                    <Select onValueChange={(v) => setValue("salary_frequency", v)} defaultValue="mensual">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SALARY_FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>¿Comisiona o Bonifica?</Label>
                    <Select onValueChange={(v) => setValue("has_commission", v)} defaultValue="no">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">Sí</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Notas Internas</Label>
                    <Textarea {...register("notes")} placeholder="Observaciones relevantes..." rows={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Social Security */}
            {step === 3 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Seguridad Social</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>EPS</Label>
                    <Select onValueChange={(v) => setValue("eps", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar EPS" /></SelectTrigger>
                      <SelectContent>{EPS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>ARL</Label>
                    <Select onValueChange={(v) => setValue("arl", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar ARL" /></SelectTrigger>
                      <SelectContent>{ARL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>AFP (Pensión)</Label>
                    <Select onValueChange={(v) => setValue("afp", v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar AFP" /></SelectTrigger>
                      <SelectContent>{AFP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Caja de Compensación</Label>
                    <Input {...register("caja_compensacion")} placeholder="Ej: Compensar, Cafam..." />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Banking */}
            {step === 4 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Información Bancaria</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Banco</Label>
                    <Input {...register("bank_name")} placeholder="Ej: Bancolombia, Davivienda..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Número de Cuenta</Label>
                    <Input {...register("bank_account_number")} placeholder="Número de cuenta" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tipo de Cuenta</Label>
                    <Select onValueChange={(v) => setValue("bank_account_type", v)} defaultValue="ahorros">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BANK_ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Notas</Label>
                    <Textarea {...register("bank_notes")} placeholder="Observaciones sobre la información bancaria..." rows={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Platform Access (optional) */}
            {step === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" />Acceso a Plataforma</CardTitle>
                  <CardDescription>Opcional. Vincula este empleado a un usuario existente en la plataforma.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {linkedProfileId ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{(allProfiles.find(p => p.id === linkedProfileId)?.full_name ?? "U")[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{allProfiles.find(p => p.id === linkedProfileId)?.full_name ?? "Usuario"}</p>
                        <p className="text-xs text-muted-foreground">Usuario vinculado</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setLinkedProfileId(null)}>Cambiar</Button>
                    </div>
                  ) : (
                    <Popover open={profileSearchOpen} onOpenChange={setProfileSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                          Buscar y vincular usuario...
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar usuario..." />
                          <CommandList>
                            <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
                            <CommandGroup>
                              {allProfiles.map((profile) => (
                                <CommandItem key={profile.id} value={profile.full_name ?? profile.id} onSelect={() => { setLinkedProfileId(profile.id); setProfileSearchOpen(false); }}>
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
                  )}
                  <p className="text-xs text-muted-foreground">Si el empleado no necesita acceso a la plataforma, deja este campo vacío y haz clic en "Crear Empleado".</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 border-t bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate("/hr/directorio")}>
              Cancelar
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              {step < STEPS.length ? (
                <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}>
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : "Crear Empleado"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
