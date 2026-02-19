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
        };
      });
    },
  });
}
