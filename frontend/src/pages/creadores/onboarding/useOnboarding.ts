import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TranslationKey } from "@/lib/i18n";

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
  // Llave interna del estado del proceso (la usan los filtros); se muestra con ETIQUETA_ESTADO_ONBOARDING.
  status: "Pendiente" | "En Progreso" | "Completado";
  hasTeamAssigned: boolean;
  // Raw fields for step calculation
  email: string | null;
  country: string | null;
  rutina_diaria: string | null;
  hobbies: string | null;
  tono_voz: string | null;
  emoji_frecuente: string | null;
  contenido_jamas_haria: string | null;
  dbStatus: string | null;
  updated_at: string | null;
  assigned_manager_profile_id: string | null;
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
  const hasPrecios = creator.precios_contenido && typeof creator.precios_contenido === "object" && Object.keys(creator.precios_contenido).length > 0;
  if (biz?.main_platform || biz?.payment_method || hasPrecios) count++;
  return Math.round((count / total) * 100);
}

/** La etiqueta de cada estado del proceso de onboarding. */
export const ETIQUETA_ESTADO_ONBOARDING: Record<OnboardingCreator["status"], TranslationKey> = {
  Pendiente: "common.pending",
  "En Progreso": "cr.inProgressCap",
  Completado: "common.completed",
};

function deriveStatus(dbStatus: string | null): "Pendiente" | "En Progreso" | "Completado" {
  if (dbStatus === "borrador" || dbStatus === "pendiente") return "Pendiente";
  if (dbStatus === "onboarding" || dbStatus === "pendiente_verificacion") return "En Progreso";
  if (dbStatus === "verificado" || dbStatus === "active") return "Completado";
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

/** La CLAVE de la etiqueta del paso: se traduce con t() al dibujarla. */
export function getStepLabel(step: number, dbStatus: string | null): TranslationKey | null {
  if (dbStatus === "pendiente_verificacion") return "creadores.status.pendingVerification";
  switch (step) {
    case 1: return "creadores.onb.stepPersonal";
    case 2: return "creadores.onb.stepPsych";
    case 3: return "creadores.onb.stepDocs";
    case 4: return "creadores.onb.stepPricing";
    default: return null;
  }
}

async function checkInactivityAlerts(creators: OnboardingCreator[]) {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const inactive = creators.filter((c) => {
    if (c.dbStatus !== "onboarding") return false;
    if (!c.assigned_manager_profile_id) return false;
    if (!c.updated_at) return false;
    return now - new Date(c.updated_at).getTime() > THREE_DAYS_MS;
  });

  if (inactive.length === 0) return;

  // Check for existing recent notifications (last 24h) to avoid duplicates
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const creatorIds = inactive.map((c) => c.id);

  const { data: existing } = await supabase
    .from("notifications")
    .select("reference_id")
    .eq("type", "onboarding_inactivity")
    .in("reference_id", creatorIds)
    .gte("created_at", oneDayAgo);

  const alreadyNotified = new Set((existing ?? []).map((e) => e.reference_id));

  const toNotify = inactive.filter((c) => !alreadyNotified.has(c.id));
  if (toNotify.length === 0) return;

  const notifications = toNotify.map((c) => ({
    user_id: c.assigned_manager_profile_id,
    type: "onboarding_inactivity",
    // Se guarda en la base y la lee OTRA persona (el manager asignado), que
    // puede tener otro idioma: queda en español a propósito, como el resto de
    // los datos persistidos.
    title: "Creadora inactiva por 3+ días",
    message: `${c.name} no ha actualizado su onboarding en más de 3 días.`,
    reference_id: c.id,
    reference_type: "creator",
    module_origin: "creadores",
    priority: "high",
    deep_link_url: `/creadores/${c.id}`,
    required_permission_module: "Creadores",
  }));

  await supabase.from("notifications").insert(notifications);
}

export function useOnboarding() {
  const alertsChecked = useRef(false);

  const query = useQuery({
    queryKey: ["onboarding-creators"],
    queryFn: async (): Promise<OnboardingCreator[]> => {
      const { data, error } = await supabase
        .from("v_creators" as never) // PII enmascarada (real solo admin)
        .select("*, creator_business(*)")
        // Incluye verificado/active a propósito: son las "Completadas" del KPI.
        // La lista las esconde por defecto (OnboardingContent, FILTRO_POR_DEFECTO).
        .in("status", ["borrador", "pendiente", "onboarding", "pendiente_verificacion", "verificado", "active"]);

      if (error) throw error;

      // Resolve manager names via auxiliary query
      const managerIds = [...new Set(
        (data || [])
          .map((c: any) => c.assigned_manager_profile_id)
          .filter(Boolean)
      )];

      let managerMap: Record<string, string> = {};
      if (managerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", managerIds);
        if (profiles) {
          managerMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || "Sin nombre"]));
        }
      }

      return (data || []).map((c: any) => {
        const biz = Array.isArray(c.creator_business) ? c.creator_business[0] : c.creator_business;
        const progress = calculateProgress(c);
        const hasTeamAssigned = !!c.assigned_manager_profile_id;

        return {
          id: c.id,
          name: c.name,
          profile_photo_url: c.profile_photo_url,
          position: biz?.kash_type || "Otro",
          area: biz?.manager_type || "Otro",
          // Vacío = sin empresa; la etiqueta se pone al mostrarla.
          company: biz?.assigned_agency || "",
          startDate: biz?.start_date || null,
          manager: c.assigned_manager_profile_id ? (managerMap[c.assigned_manager_profile_id] || "Sin asignar") : "Sin asignar",
          progress,
          status: deriveStatus(c.status),
          hasTeamAssigned,
          email: c.email,
          country: c.country,
          rutina_diaria: c.rutina_diaria,
          hobbies: c.hobbies,
          tono_voz: c.tono_voz,
          emoji_frecuente: c.emoji_frecuente,
          contenido_jamas_haria: c.contenido_jamas_haria,
          dbStatus: c.status,
          updated_at: c.updated_at,
          assigned_manager_profile_id: c.assigned_manager_profile_id,
        };
      });
    },
  });

  // Check inactivity alerts once after data loads
  useEffect(() => {
    if (query.data && query.data.length > 0 && !alertsChecked.current) {
      alertsChecked.current = true;
      checkInactivityAlerts(query.data);
    }
  }, [query.data]);

  return query;
}
