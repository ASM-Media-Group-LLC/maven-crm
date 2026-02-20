import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useDepartments, usePositions } from "@/hooks/useEmployees";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
];

export default function EmployeeNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: departments = [] } = useDepartments();
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
        birth_date: values.birth_date || null,
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
        hire_date: values.hire_date || null,
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
        notes: values.notes || null,
        created_by: user?.id,
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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <HRPageHeader
        title="Nuevo Empleado"
        subtitle="Complete los datos para registrar un nuevo empleado"
        icon={UserPlus}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/hr/directorio")}>
            Cancelar
          </Button>
        }
      />

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              className={cn("flex items-center gap-2 text-sm font-medium transition-colors", step === s.id ? "text-primary" : step > s.id ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all", step === s.id ? "border-primary bg-primary text-primary-foreground" : step > s.id ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/30 text-muted-foreground")}>
                {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <div className={cn("h-px flex-1 mx-2 transition-colors", step > s.id ? "bg-green-500" : "bg-border")} />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
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
                <Input {...register("phone")} placeholder="+57 300 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Celular</Label>
                <Input {...register("mobile")} placeholder="+57 300 000 0000" />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de Nacimiento</Label>
                <Input {...register("birth_date")} type="date" />
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
                <Input {...register("emergency_contact_phone")} placeholder="+57 300 000 0000" />
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
                <Input {...register("hire_date")} type="date" />
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
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
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
      </form>
    </div>
  );
}
