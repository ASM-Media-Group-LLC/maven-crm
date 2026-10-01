import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Check, CalendarIcon, Search, Link2, ArrowLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
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
import { UserAvatar } from "@/components/UserAvatar";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import {
  CONTRACT_TYPES, WORK_MODALITIES, NATIONAL_ID_TYPES, GENDER_OPTIONS,
  SALARY_FREQUENCIES, BANK_ACCOUNT_TYPES, EPS_OPTIONS, ARL_OPTIONS, AFP_OPTIONS,
} from "@/lib/hrConstants";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  etiqueta, FRECUENCIA_PAGO, GENERO, MODALIDAD_TRABAJO, SEGURIDAD_SOCIAL, TIPO_CONTRATO, TIPO_CUENTA, TIPO_DOCUMENTO,
} from "./etiquetasRrhh";

// Los mensajes de zod son CLAVES del diccionario: el schema se arma una sola vez al
// cargar el módulo, y un texto ya traducido ahí se quedaría en el idioma de ese
// momento. Se traducen al dibujarse (ver `mensaje`).
const MSG_REQUIRED: TranslationKey = "hr.emp.required";
const MSG_INVALID_EMAIL: TranslationKey = "common.invalidEmail";
const schema = z.object({
  first_name: z.string().min(1, MSG_REQUIRED),
  last_name: z.string().min(1, MSG_REQUIRED),
  email: z.string().email(MSG_INVALID_EMAIL).optional().or(z.literal("")),
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

const STEPS: { id: number; label: TranslationKey }[] = [
  { id: 1, label: "hr.emp.stepPersonal" },
  { id: 2, label: "hr.emp.stepWork" },
  { id: 3, label: "hr.emp.stepSocial" },
  { id: 4, label: "hr.emp.stepBank" },
  { id: 5, label: "hr.emp.stepAccess" },
];

export default function EmployeeNew() {
  const { t } = useLanguage();
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
  const mensaje = (m: string | undefined) => (m ? t(m as TranslationKey) : "");

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
      toast({ title: t("hr.emp.created") });
      navigate("/hr/directorio");
    } catch {
      toast({ title: t("hr.emp.errorCreating"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/hr/directorio")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("hr.emp.backToDirectory")}
        </Button>
        <PageHeader
          title={t("hr.emp.title")}
          subtitle={t("hr.emp.subtitle")}
        />
      </div>

      {/* Stepper */}
      <div className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-3 space-y-3">
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
                <span className="hidden sm:inline">{t(s.label)}</span>
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
                <CardHeader><CardTitle className="text-base">{t("hr.emp.stepPersonal")}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.firstNames")} <span className="text-destructive">*</span></Label>
                    <Input {...register("first_name")} placeholder={t("hr.emp.firstNamesPh")} />
                    {errors.first_name && <p className="text-xs text-destructive">{mensaje(errors.first_name.message)}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.lastNames")} <span className="text-destructive">*</span></Label>
                    <Input {...register("last_name")} placeholder={t("hr.emp.lastNamesPh")} />
                    {errors.last_name && <p className="text-xs text-destructive">{mensaje(errors.last_name.message)}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.idType")}</Label>
                    <Select onValueChange={(v) => setValue("national_id_type", v)} defaultValue="CC">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{NATIONAL_ID_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{etiqueta(t, TIPO_DOCUMENTO, o.value, o.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.idNumber")}</Label>
                    <Input {...register("national_id")} placeholder={t("hr.emp.idNumberPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input {...register("email")} type="email" placeholder={t("hr.emp.emailPh")} />
                    {errors.email && <p className="text-xs text-destructive">{mensaje(errors.email.message)}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.phone")}</Label>
                    <PhoneInput value={watch("phone") || ""} onChange={(v) => setValue("phone", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.mobile")}</Label>
                    <PhoneInput value={watch("mobile") || ""} onChange={(v) => setValue("mobile", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.birthDate")}</Label>
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
                    <Label>{t("hr.emp.gender")}</Label>
                    <Select onValueChange={(v) => setValue("gender", v)}>
                      <SelectTrigger><SelectValue placeholder={t("common.selectEllipsis")} /></SelectTrigger>
                      <SelectContent>{GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{etiqueta(t, GENERO, g.value, g.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.city")}</Label>
                    <Input {...register("city")} placeholder={t("hr.emp.cityPh")} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("common.address")}</Label>
                    <Input {...register("address")} placeholder={t("hr.emp.addressPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.emergencyContact")}</Label>
                    <Input {...register("emergency_contact_name")} placeholder={t("hr.emp.emergencyContactPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.emergencyPhone")}</Label>
                    <PhoneInput value={watch("emergency_contact_phone") || ""} onChange={(v) => setValue("emergency_contact_phone", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.relationship")}</Label>
                    <Input {...register("emergency_contact_relation")} placeholder={t("hr.emp.relationshipPh")} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Work info */}
            {step === 2 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("hr.emp.stepWork")}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hr.department")}</Label>
                    <Select onValueChange={(v) => { setValue("department_id", v); setValue("position_id", ""); }}>
                      <SelectTrigger><SelectValue placeholder={t("hr.emp.selectDepartment")} /></SelectTrigger>
                      <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.jobTitle")}</Label>
                    <Select onValueChange={(v) => setValue("position_id", v)} disabled={!selectedDept && positions.length === 0}>
                      <SelectTrigger><SelectValue placeholder={selectedDept ? t("hr.emp.selectJobTitle") : t("hr.emp.pickDepartmentFirst")} /></SelectTrigger>
                      <SelectContent>{positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.hireDate")}</Label>
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
                    <Label>{t("hr.emp.contractType")}</Label>
                    <Select onValueChange={(v) => setValue("contract_type", v)} defaultValue="indefinido">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONTRACT_TYPES.map((c) => <SelectItem key={c.value} value={c.value}>{etiqueta(t, TIPO_CONTRATO, c.value, c.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.workMode")}</Label>
                    <Select onValueChange={(v) => setValue("work_modality", v)} defaultValue="presencial">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{WORK_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{etiqueta(t, MODALIDAD_TRABAJO, m.value, m.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.baseSalary")}</Label>
                    <Input {...register("base_salary")} type="number" placeholder="0.00" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.payFrequency")}</Label>
                    <Select onValueChange={(v) => setValue("salary_frequency", v)} defaultValue="mensual">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{SALARY_FREQUENCIES.map((fr) => <SelectItem key={fr.value} value={fr.value}>{etiqueta(t, FRECUENCIA_PAGO, fr.value, fr.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.hasCommission")}</Label>
                    <Select onValueChange={(v) => setValue("has_commission", v)} defaultValue="no">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="si">{t("hr.yes")}</SelectItem>
                        <SelectItem value="no">{t("hr.no")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("hr.emp.internalNotes")}</Label>
                    <Textarea {...register("notes")} placeholder={t("hr.emp.internalNotesPh")} rows={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Social Security */}
            {step === 3 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("hr.emp.stepSocial")}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>EPS</Label>
                    <Select onValueChange={(v) => setValue("eps", v)}>
                      <SelectTrigger><SelectValue placeholder={t("hr.emp.selectEps")} /></SelectTrigger>
                      <SelectContent>{EPS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{etiqueta(t, SEGURIDAD_SOCIAL, o.value, o.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>ARL</Label>
                    <Select onValueChange={(v) => setValue("arl", v)}>
                      <SelectTrigger><SelectValue placeholder={t("hr.emp.selectArl")} /></SelectTrigger>
                      <SelectContent>{ARL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{etiqueta(t, SEGURIDAD_SOCIAL, o.value, o.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.afp")}</Label>
                    <Select onValueChange={(v) => setValue("afp", v)}>
                      <SelectTrigger><SelectValue placeholder={t("hr.emp.selectAfp")} /></SelectTrigger>
                      <SelectContent>{AFP_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.compensationFund")}</Label>
                    <Input {...register("caja_compensacion")} placeholder={t("hr.emp.compensationFundPh")} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Banking */}
            {step === 4 && (
              <Card>
                <CardHeader><CardTitle className="text-base">{t("hr.emp.stepBank")}</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.bank")}</Label>
                    <Input {...register("bank_name")} placeholder={t("hr.emp.bankPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.accountNumber")}</Label>
                    <Input {...register("bank_account_number")} placeholder={t("hr.emp.accountNumberPh")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("hr.emp.accountType")}</Label>
                    <Select onValueChange={(v) => setValue("bank_account_type", v)} defaultValue="ahorros">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BANK_ACCOUNT_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{etiqueta(t, TIPO_CUENTA, o.value, o.label)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t("hr.notes")}</Label>
                    <Textarea {...register("bank_notes")} placeholder={t("hr.emp.bankNotesPh")} rows={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Platform Access (optional) */}
            {step === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" />{t("hr.emp.platformAccess")}</CardTitle>
                  <CardDescription>{t("hr.emp.platformAccessDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {linkedProfileId ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                      <UserAvatar name={allProfiles.find(p => p.id === linkedProfileId)?.full_name ?? t("common.user")} size="sm" className="h-9 w-9" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{allProfiles.find(p => p.id === linkedProfileId)?.full_name ?? t("common.user")}</p>
                        <p className="text-xs text-muted-foreground">{t("hr.emp.linkedUser")}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setLinkedProfileId(null)}>{t("hr.emp.change")}</Button>
                    </div>
                  ) : (
                    <Popover open={profileSearchOpen} onOpenChange={setProfileSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start">
                          <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                          {t("hr.emp.searchLinkUser")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t("hr.emp.searchUser")} />
                          <CommandList>
                            <CommandEmpty>{t("hr.emp.noUsers")}</CommandEmpty>
                            <CommandGroup>
                              {allProfiles.map((profile) => (
                                <CommandItem key={profile.id} value={profile.full_name ?? profile.id} onSelect={() => { setLinkedProfileId(profile.id); setProfileSearchOpen(false); }}>
                                  <UserAvatar name={profile.full_name} src={profile.avatar_url} size="xs" className="mr-2" />
                                  {profile.full_name ?? t("hr.noName")}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                  <p className="text-xs text-muted-foreground">{t("hr.emp.accessHint")}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 border-t bg-background px-6 py-4">
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => navigate("/hr/directorio")}>
              {t("common.cancel")}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("common.previous")}
              </Button>
              {step < STEPS.length ? (
                <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}>
                  {t("common.next")} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? t("hr.saving") : t("hr.emp.create")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
