import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminInvoke } from "@/lib/adminInvoke";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import type { TranslationKey } from "@/lib/i18n";

// La agencia y el portal de una creadora (pestaña Portal del perfil).
// Leer: creadora_cuentas, con la RLS (quien ve a la creadora; el correo, solo
// enmascarado). Dar, reenviar, cambiar y quitar: la edge portal-creadoras.

export interface AccesoPortal {
  user_id: string;
  correo_visible: string;
  invitada_por: string | null;
  invitada_en: string;
  primer_acceso: string | null;
  ultimo_acceso: string | null;
  invitadaPorNombre: string | null;
}

export function useAccesoPortal(creatorId: string) {
  return useQuery({
    queryKey: ["portal-acceso", creatorId],
    queryFn: async (): Promise<AccesoPortal | null> => {
      const { data, error } = await supabase
        .from("creadora_cuentas" as never)
        .select("user_id, correo_visible, invitada_por, invitada_en, primer_acceso, ultimo_acceso")
        .eq("creator_id", creatorId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const fila = data as unknown as Omit<AccesoPortal, "invitadaPorNombre">;
      let invitadaPorNombre: string | null = null;
      if (fila.invitada_por) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", fila.invitada_por).maybeSingle();
        invitadaPorNombre = (p as { full_name: string | null } | null)?.full_name ?? null;
      }
      return { ...fila, invitadaPorNombre };
    },
  });
}

/** Lo último que cambió ella desde el portal (el historial lo anota un trigger). */
export function useActividadPortal(creatorId: string) {
  return useQuery({
    queryKey: ["creator_history", creatorId, "portal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_history")
        .select("id, action, created_at")
        .eq("creator_id", creatorId)
        .like("action", "portal:%")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Espeja can_use_module_function(yo, 'Creadores', 'Invitar al portal',
 *  'supervisor_or_above'), que es lo que decide en la edge: admin sí; si su rol
 *  tiene la fila, lo que diga; si no, supervisor o más. */
export function usePuedeInvitarAlPortal(): boolean {
  const { isAdmin, isSupervisor } = useUserRole();
  const { explicitPermission } = usePermissions();
  if (isAdmin) return true;
  return explicitPermission("Creadores", "Invitar al portal") ?? isSupervisor;
}

export type AccionPortal = "invitar" | "reenviar" | "cambiar_correo" | "quitar";

export interface RespuestaPortal {
  ok?: boolean;
  correo_visible?: string;
  correo_enviado?: boolean;
  cuenta_bloqueada?: boolean;
}

export function useAccionPortal(creatorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { accion: AccionPortal; correo?: string }) =>
      adminInvoke<RespuestaPortal>("portal-creadoras", { accion: p.accion, creator_id: creatorId, correo: p.correo ?? null }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["portal-acceso", creatorId] });
      void qc.invalidateQueries({ queryKey: ["creator_history", creatorId] });
    },
  });
}

const ERRORES = [
  "sin_permiso", "no_existe", "ya_tiene_acceso", "correo_invalido", "sin_correo", "correo_de_equipo",
  "correo_de_otra_creadora", "correo_en_uso", "cuenta_compartida", "sin_acceso",
] as const;

/** El código que contesta la edge → la clave del texto. */
export function claveDeError(e: unknown): TranslationKey {
  const codigo = (e as Error)?.message ?? "";
  return (ERRORES as readonly string[]).includes(codigo) ? (`portal.error.${codigo}` as TranslationKey) : "portal.error.generico";
}
