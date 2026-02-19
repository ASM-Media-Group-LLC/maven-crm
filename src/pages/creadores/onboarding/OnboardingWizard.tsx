import { useState, useCallback, useMemo } from "react";
import { Check, Loader2, ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAddCreadorWithBusiness } from "../useCreadores";
import Step1PersonalInfo, { type Step1Data, type Step1Errors, validateStep1 } from "./steps/Step1PersonalInfo";
import Step2Documentation, { type Step2Data, type Step2Errors, validateStep2 } from "./steps/Step2Documentation";
import Step3ProfessionalProfile, { type Step3Data } from "./steps/Step3ProfessionalProfile";
import Step4WorkConfig, { type Step4Data } from "./steps/Step4WorkConfig";

const STEPS = [
  { label: "Información Personal" },
  { label: "Documentación" },
  { label: "Perfil Profesional" },
  { label: "Configuración" },
];

const initialStep1: Step1Data = { name: "", email: "", phone: "", age: "", country: "", city: "", timezone: "" };
const initialStep2: Step2Data = { idDocuments: [], profilePhotos: [], dataConfirmed: false };
const initialStep3: Step3Data = { experience: 0, workAreas: [], services: [], traits: [] };
const initialStep4: Step4Data = { schedule: {}, hourlyRate: "", monthlyGoal: "", notes: "" };

interface Props {
  onCancel: () => void;
}

export default function OnboardingWizard({ onCancel }: Props) {
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<Step1Data>(initialStep1);
  const [step2, setStep2] = useState<Step2Data>(initialStep2);
  const [step3, setStep3] = useState<Step3Data>(initialStep3);
  const [step4, setStep4] = useState<Step4Data>(initialStep4);
  const [step1Errors, setStep1Errors] = useState<Step1Errors>({});
  const [step2Errors, setStep2Errors] = useState<Step2Errors>({});

  const { toast } = useToast();
  const addCreador = useAddCreadorWithBusiness();
  const tempId = useMemo(() => `onboarding-${Date.now()}`, []);

  const updateStep1 = useCallback((field: keyof Step1Data, value: string) => {
    setStep1((prev) => ({ ...prev, [field]: value }));
    setStep1Errors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const updateStep2 = useCallback(<K extends keyof Step2Data>(field: K, value: Step2Data[K]) => {
    setStep2((prev) => ({ ...prev, [field]: value }));
    if (field === "dataConfirmed") setStep2Errors({});
  }, []);

  const updateStep3 = useCallback(<K extends keyof Step3Data>(field: K, value: Step3Data[K]) => {
    setStep3((prev) => ({ ...prev, [field]: value }));
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
    if (step === 2) {
      const errors = validateStep2(step2);
      setStep2Errors(errors);
      return Object.keys(errors).length === 0;
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setStep((s) => Math.min(s + 1, 4));
  };

  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const buildPayload = (isDraft: boolean) => {
    const extraData = JSON.stringify({
      experience: step3.experience,
      workAreas: step3.workAreas,
      services: step3.services,
      traits: step3.traits,
      schedule: step4.schedule,
      hourlyRate: step4.hourlyRate,
      monthlyGoal: step4.monthlyGoal,
      timezone: step1.timezone,
    });

    const profilePhotoUrl = step2.profilePhotos.length > 0 ? step2.profilePhotos[0].url : null;

    const documents = [
      ...step2.idDocuments.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Documento de identidad" })),
      ...step2.profilePhotos.map((f) => ({ file_name: f.name, file_url: f.url, file_type: f.type, description: "Foto de perfil" })),
    ];

    return {
      creator: {
        name: step1.name || "Borrador",
        email: step1.email || null,
        phone: step1.phone || null,
        age: step1.age ? Number(step1.age) : null,
        country: step1.country || null,
        city: step1.city || null,
        status: isDraft ? "borrador" : "pendiente_verificacion",
        profile_photo_url: profilePhotoUrl,
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

    try {
      await addCreador.mutateAsync(buildPayload(isDraft));
      toast({ title: isDraft ? "Borrador guardado" : "Onboarding completado exitosamente" });
      resetAndClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setStep1(initialStep1);
    setStep2(initialStep2);
    setStep3(initialStep3);
    setStep4(initialStep4);
    setStep1Errors({});
    setStep2Errors({});
    onCancel();
  };

  const isSubmitting = addCreador.isPending;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold leading-none tracking-tight">Iniciar Onboarding</h2>
          <p className="text-sm text-muted-foreground mt-1.5">Completa la información del nuevo creador en 4 pasos</p>
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
                        ? "bg-primary text-primary-foreground"
                        : isActive
                        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
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
          <Progress value={(step / 4) * 100} className="h-1.5" />
        </div>

        {/* Step Content */}
        <div>
          {step === 1 && <Step1PersonalInfo data={step1} errors={step1Errors} onChange={updateStep1} />}
          {step === 2 && <Step2Documentation data={step2} errors={step2Errors} tempId={tempId} onChange={updateStep2} />}
          {step === 3 && <Step3ProfessionalProfile data={step3} onChange={updateStep3} />}
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
