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

function calculateProgress(creator: any): number {
  let count = 0;
  const total = 4;
  // Step 1: personal info
  if (creator.name && creator.email && creator.country) count++;
  // Step 2: psychology/limits
  const psyFields = [creator.rutina_diaria, creator.hobbies, creator.tono_voz, creator.emoji_frecuente, creator.contenido_jamas_haria];
  if (psyFields.filter(Boolean).length >= 2) count++;
  // Step 3: profile photo / docs
  if (creator.profile_photo_url) count++;
  // Step 4: business config
  const biz = Array.isArray(creator.creator_business) ? creator.creator_business[0] : creator.creator_business;
  if (biz?.main_platform || biz?.payment_method) count++;
  return Math.round((count / total) * 100);
}

function deriveStatus(dbStatus: string | null): "Pendiente" | "En Progreso" | "Completado" {
  if (dbStatus === "borrador" || dbStatus === "pendiente" || dbStatus === "pendiente_verificacion") return "Pendiente";
  if (dbStatus === "verificado") return "Completado";
  if (dbStatus === "onboarding") return "En Progreso";
  return "Pendiente";
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
        .select("*, creator_business(*)")
        .in("status", ["borrador", "pendiente", "onboarding", "pendiente_verificacion", "verificado"]);

      if (error) throw error;

      return (data || []).map((c: any) => {
        const biz = Array.isArray(c.creator_business) ? c.creator_business[0] : c.creator_business;
        const progress = calculateProgress(c);

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
