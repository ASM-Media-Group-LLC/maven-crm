import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OnboardingCreator {
  id: string;
  name: string;
  profile_photo_url: string | null;
  position: string;
  area: string;
  company: string;
  startDate: string | null;
  manager: string;
  progress: number;
  status: "Pendiente" | "En Progreso" | "Completado";
  // Raw fields for step calculation
  email: string | null;
  country: string | null;
  rutina_diaria: string | null;
  hobbies: string | null;
  tono_voz: string | null;
  emoji_frecuente: string | null;
  contenido_jamas_haria: string | null;
  dbStatus: string | null;
}

function calculateProgress(training: any): number {
  if (!training) return 0;
  let count = 0;
  if (training.script_status === "completed" || training.script_status === "completado") count++;
  if (training.call_completed_date) count++;
  if (training.first_content_date) count++;
  if (training.autonomous_since_date) count++;
  return Math.round((count / 4) * 100);
}

function deriveStatus(dbStatus: string | null): "Pendiente" | "En Progreso" | "Completado" {
  if (dbStatus === "pendiente_verificacion") return "Pendiente";
  if (dbStatus === "asignado" || dbStatus === "activo") return "Completado";
  return "En Progreso";
}

export function calculateCurrentStep(creator: OnboardingCreator): number {
  const hasStep1 = creator.name && creator.email && creator.country;
  if (!hasStep1) return 1;

  const psyFields = [creator.rutina_diaria, creator.hobbies, creator.tono_voz, creator.emoji_frecuente, creator.contenido_jamas_haria];
  const hasStep2 = psyFields.filter(Boolean).length >= 2;
  if (!hasStep2) return 2;

  const hasStep3 = !!creator.profile_photo_url;
  if (!hasStep3) return 3;

  return 4;
}

export function getStepLabel(step: number, dbStatus: string | null): string {
  if (dbStatus === "pendiente_verificacion") return "Pendiente de aprobación";
  switch (step) {
    case 1: return "Completando datos personales";
    case 2: return "Completando perfil psicológico";
    case 3: return "Esperando documentos";
    case 4: return "Configurando precios";
    default: return "";
  }
}

export function useOnboarding() {
  return useQuery({
    queryKey: ["onboarding-creators"],
    queryFn: async (): Promise<OnboardingCreator[]> => {
      const { data, error } = await supabase
        .from("creators")
        .select("*, creator_business(*), creator_training(*)")
        .in("status", ["borrador", "pendiente_verificacion", "verificado", "asignado", "activo"]);

      if (error) throw error;

      return (data || []).map((c: any) => {
        const biz = Array.isArray(c.creator_business) ? c.creator_business[0] : c.creator_business;
        const training = Array.isArray(c.creator_training) ? c.creator_training[0] : c.creator_training;
        const progress = calculateProgress(training);

        return {
          id: c.id,
          name: c.name,
          profile_photo_url: c.profile_photo_url,
          position: biz?.kash_type || "Otro",
          area: biz?.manager_type || "Otro",
          company: biz?.assigned_agency || "Sin empresa",
          startDate: biz?.start_date || null,
          manager: "Sin asignar",
          progress,
          status: deriveStatus(c.status),
          email: c.email,
          country: c.country,
          rutina_diaria: c.rutina_diaria,
          hobbies: c.hobbies,
          tono_voz: c.tono_voz,
          emoji_frecuente: c.emoji_frecuente,
          contenido_jamas_haria: c.contenido_jamas_haria,
          dbStatus: c.status,
        };
      });
    },
  });
}
