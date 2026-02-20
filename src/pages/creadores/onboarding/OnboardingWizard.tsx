import { useState, useCallback, useMemo, useEffect } from "react";
import { Check, Loader2, ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAddCreadorWithBusiness } from "../useCreadores";
import { useQueryClient } from "@tanstack/react-query";
import Step1PersonalInfo, { type Step1Data, type Step1Errors, validateStep1 } from "./steps/Step1PersonalInfo";
import Step2PsychologyLimits, { type Step2PsyData } from "./steps/Step2PsychologyLimits";
import Step2Documentation, { type Step2Data, type Step2Errors, validateStep2 } from "./steps/Step2Documentation";
import Step4WorkConfig, { type Step4Data } from "./steps/Step4WorkConfig";
import { supabase } from "@/integrations/supabase/client";

const STEPS = [
  { label: "Información Personal" },
  { label: "Psicología y Límites" },
  { label: "Documentación" },
  { label: "Configuración" },
];

const initialStep1: Step1Data = { name: "", email: "", phone: "", age: "", country: "", city: "", timezone: "", artisticName: "", birthDate: "", medidas: "", tallaBrasier: "" };
const initialStep2Psy: Step2PsyData = { rutinaDiaria: "", hobbies: "", mascotasNombres: "", comidaFavorita: "", nivelEstudios: "", apodosPermitidos: "", palabrasProhibidas: "", emojiFrecuente: "", tonoVoz: "", contenidoJamasHaria: "" };
const initialStep3Doc: Step2Data = { idDocuments: [], profilePhotos: [], dataConfirmed: false };
const initialStep4: Step4Data = { schedule: {}, pricing: {}, monthlyGoal: "", notes: "", permisoIdentidadReal: "", terminosAfecto: "", restriccionesSeguridad: "", orientacionPerfil: "" };

interface Props {
  onCancel: () => void;
  initialStep?: number;
  editCreatorId?: string;
}

export default function OnboardingWizard({ onCancel, initialStep, editCreatorId }: Props) {
  const [step, setStep] = useState(initialStep || 1);
  const [step1, setStep1] = useState<Step1Data>(initialStep1);
  const [step2Psy, setStep2Psy] = useState<Step2PsyData>(initialStep2Psy);
  const [step3Doc, setStep3Doc] = useState<Step2Data>(initialStep3Doc);
  const [step4, setStep4] = useState<Step4Data>(initialStep4);
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [step3DocErrors, setStep3DocErrors] = useState<Step2Errors>({});
  const [loadingCreator, setLoadingCreator] = useState(!!editCreatorId);

  const { toast } = useToast();
  const addCreador = useAddCreadorWithBusiness();
  const queryClient = useQueryClient();
  const tempId = useMemo(() => `onboarding-${Date.now()}`, []);

  // Load existing creator data when editing
  useEffect(() => {
    if (!editCreatorId) return;
    (async () => {
      setLoadingCreator(true);
      const { data: c } = await supabase
        .from("creators")
        .select("*, creator_business(*)")
        .eq("id", editCreatorId)
        .maybeSingle();
      if (c) {
        let extraData: any = {};
        try { extraData = c.internal_notes ? JSON.parse(c.internal_notes) : {}; } catch {}
        const biz = Array.isArray(c.creator_business) ? c.creator_business[0] : c.creator_business;

        setStep1({
          name: c.name || "", email: c.email || "", phone: c.phone || "",
          age: c.age ? String(c.age) : "", country: c.country || "", city: c.city || "",
          timezone: extraData.timezone || "", artisticName: c.artistic_name || "",
          birthDate: c.birth_date || "", medidas: c.medidas_cm || "", tallaBrasier: c.talla_brasier || "",
        });
        setStep2Psy({
          rutinaDiaria: c.rutina_diaria || "", hobbies: c.hobbies || "",
          mascotasNombres: c.mascotas_nombres || "", comidaFavorita: c.comida_favorita || "",
          nivelEstudios: c.nivel_estudios || "", apodosPermitidos: c.apodos_permitidos || "",
          palabrasProhibidas: c.palabras_prohibidas || "", emojiFrecuente: c.emoji_frecuente || "",
          tonoVoz: c.tono_voz || "", contenidoJamasHaria: c.contenido_jamas_haria || "",
        });
        setStep4({
          schedule: extraData.schedule || {}, pricing: {},
          monthlyGoal: biz?.monthly_sales_target ? String(biz.monthly_sales_target) : "",
          notes: c.notes || "",
          permisoIdentidadReal: extraData.permisoIdentidadReal || "",
          terminosAfecto: extraData.terminosAfecto || "",
          restriccionesSeguridad: extraData.restriccionesSeguridad || "",
          orientacionPerfil: extraData.orientacionPerfil || "",
        });
      }
      setLoadingCreator(false);
    })();
  }, [editCreatorId]);

  const updateStep1 = useCallback((field: keyof Step1Data, value: string) => {
    setStep1((prev) => ({ ...prev, [field]: value }));
    setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const updateStep2Psy = useCallback(<K extends keyof Step2PsyData>(field: K, value: Step2PsyData[K]) => {
    setStep2Psy((prev) => ({ ...prev, [field]: value }));
  }, []);

  const updateStep3Doc = useCallback(<K extends keyof Step2Data>(field: K, value: Step2Data[K]) => {
    setStep3Doc((prev) => ({ ...prev, [field]: value }));
    if (field === "dataConfirmed") setStep3DocErrors({});
  }, []);

  const updateStep4 = useCallback(<K extends keyof Step4Data>(field: K, value: Step4Data[K]) => {
    setStep4((prev) => ({ ...prev, [field]: value }));
  }, []);

  const validateCurrentStep = (): boolean => {
    if (step === 1) {
      const errors = validateStep1(step1);
      setStep1Errors(errors);
      return Object.keys(errors).length === 0;
    }
    if (step === 3) {
      const errors = validateStep2(step3Doc);
      setStep3DocErrors(errors);
      return Object.keys(errors).length === 0;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    toast({ title: `Paso ${step} completado` });
    setStep((s) => Math.min(s + 1, 4));
  };

  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const buildPayload = (isDraft: boolean) => {
    const preciosContenido: Record<string, { price: number; notes: string }> = {};
    Object.entries(step4.pricing).forEach(([key, val]) => {
      const price = Number(val.price);
      if (price > 0) {
        preciosContenido[key] = { price, notes: val.notes || "" };
      }
    });

    const extraData = JSON.stringify({
      schedule: step4.schedule,
      monthlyGoal: step4.monthlyGoal,
      timezone: step1.timezone,
      permisoIdentidadReal: step4.permisoIdentidadReal || null,
      terminosAfecto: step4.terminosAfecto || null,
      restriccionesSeguridad: step4.restriccionesSeguridad || null,
      orientacionPerfil: step4.orientacionPerfil || null,
    });

    const profilePhotoUrl = step3Doc.profilePhotos.length > 0 ? step3Doc.profilePhotos[0].url : null;

    const documents = [
      ...step3Doc.idDocuments.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Documento de identidad" })),
      ...step3Doc.profilePhotos.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Foto de perfil" })),
    ];

    return {
      creator: {
        name: step1.name || "Borrador",
        email: step1.email || null,
        phone: step1.phone || null,
        age: step1.age ? Number(step1.age) : null,
        country: step1.country || null,
        city: step1.city || null,
        artistic_name: step1.artisticName || null,
        birth_date: step1.birthDate || null,
        medidas_cm: step1.medidas || null,
        talla_brasier: step1.tallaBrasier || null,
        rutina_diaria: step2Psy.rutinaDiaria || null,
        hobbies: step2Psy.hobbies || null,
        mascotas_nombres: step2Psy.mascotasNombres || null,
        comida_favorita: step2Psy.comidaFavorita || null,
        nivel_estudios: step2Psy.nivelEstudios || null,
        apodos_permitidos: step2Psy.apodosPermitidos || null,
        palabras_prohibidas: step2Psy.palabrasProhibidas || null,
        emoji_frecuente: step2Psy.emojiFrecuente || null,
        tono_voz: step2Psy.tonoVoz || null,
        contenido_jamas_haria: step2Psy.contenidoJamasHaria || null,
        status: isDraft ? "borrador" : "pendiente_verificacion",
        profile_photo_url: profilePhotoUrl,
        precios_contenido: Object.keys(preciosContenido).length > 0 ? preciosContenido : null,
        internal_notes: extraData,
        notes: step4.notes || null,
      },
      business: {
        start_date: new Date().toISOString().split("T")[0],
        monthly_sales_target: step4.monthlyGoal ? Number(step4.monthlyGoal) : null,
      },
      documents: documents.length > 0 ? documents : undefined,
    };
  };

  const handleSubmit = async (isDraft = false) => {
    if (!isDraft && !validateCurrentStep()) return;
    if (!isDraft && step < 4) return;
    if (!isDraft) {
      const s1Errors = validateStep1(step1);
      if (Object.keys(s1Errors).length > 0) {
        setStep1Errors(s1Errors);
        setStep(1);
        return;
      }
    } else {
      if (!step1.name.trim()) {
        setStep1Errors({ name: "Nombre es requerido para guardar borrador" });
        setStep(1);
        return;
      }
    }

    // If editing, update instead of insert
    if (editCreatorId) {
      try {
        const payload = buildPayload(isDraft);
        const { error } = await supabase
          .from("creators")
          .update(payload.creator as any)
          .eq("id", editCreatorId);
        if (error) throw error;

        // Update business record if exists
        const { data: existingBiz } = await supabase
          .from("creator_business")
          .select("id")
          .eq("creator_id", editCreatorId)
          .maybeSingle();
        if (existingBiz) {
          await supabase.from("creator_business").update(payload.business as any).eq("creator_id", editCreatorId);
        }

        queryClient.invalidateQueries({ queryKey: ["onboarding-creators"] });
        toast({ title: isDraft ? "Borrador actualizado" : "Onboarding actualizado exitosamente" });
        resetAndClose();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
      return;
    }

    // Duplicate check by email (only for new creators)
    if (step1.email) {
      const { data: existingByEmail } = await supabase
        .from("creators")
        .select("id, name, email")
        .ilike("email", step1.email.trim())
        .maybeSingle();
      if (existingByEmail) {
        toast({
          title: "Duplicado detectado",
          description: `Ya existe un creador con este email: ${existingByEmail.name}`,
          variant: "destructive",
        });
        setStep(1);
        return;
      }
    }

    try {
      const createdId = await addCreador.mutateAsync(buildPayload(isDraft));
      if (!isDraft && createdId) {
        await supabase.from("notifications").insert({
          type: "onboarding_complete",
          title: "Nueva modelo ha completado el onboarding",
          message: `${step1.name} ha completado el proceso de onboarding y está pendiente de verificación.`,
          reference_id: createdId,
          reference_type: "creator",
        });
      }
      toast({ title: isDraft ? "Borrador guardado" : "Onboarding completado exitosamente" });
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setStep1(initialStep1);
    setStep2Psy(initialStep2Psy);
    setStep3Doc(initialStep3Doc);
    setStep4(initialStep4);
    setStep1Errors({});
    setStep3DocErrors({});
    onCancel();
  };

  const isSubmitting = addCreador.isPending;

  if (loadingCreator) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando datos...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            {editCreatorId ? "Continuar Onboarding" : "Iniciar Onboarding"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">4 pasos para completar el registro</p>
        </div>
        <Button variant="ghost" size="sm" onClick={resetAndClose} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a la lista
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stepper */}
        <div>
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => {
              const num = i + 1;
              const isActive = num === step;
              const isDone = num < step;
              return (
                <div key={num} className="flex items-center gap-2 flex-1">
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold shrink-0 transition-colors ${
                      isDone
                        ? "bg-gradient-to-r from-accent to-primary text-white"
                        : isActive
                        ? "bg-gradient-to-r from-accent to-primary text-white ring-2 ring-accent/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : num}
                  </div>
                  <span className={`text-xs hidden sm:inline ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-2" />}
                </div>
              );
            })}
          </div>
          <Progress value={(step / 4) * 100} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
        </div>

        {/* Step Content */}
        <div key={step} className="animate-fade-in">
          {step === 1 && <Step1PersonalInfo data={step1} errors={step1Errors} onChange={updateStep1} />}
          {step === 2 && <Step2PsychologyLimits data={step2Psy} onChange={updateStep2Psy} />}
          {step === 3 && <Step2Documentation data={step3Doc} errors={step3DocErrors} tempId={tempId} onChange={updateStep3Doc} />}
          {step === 4 && <Step4WorkConfig data={step4} onChange={updateStep4} />}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleSubmit(true)} disabled={isSubmitting}>
            Guardar Borrador
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={handlePrev} disabled={isSubmitting}>Anterior</Button>
          )}
          {step < 4 ? (
            <Button onClick={handleNext}>Siguiente</Button>
          ) : (
            <Button onClick={() => handleSubmit(false)} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finalizar
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
