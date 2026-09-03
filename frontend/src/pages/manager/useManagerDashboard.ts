import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Datos del tablero del manager. Todo es SUYO: su nota del bot, su objetivo y
// las creadoras que tiene asignadas. Nada de esto necesita privilegio extra —
// `corte_notas` tiene policy "cada quien ve lo suyo" (migración
// 20260904170000) y las creadoras salen de la vista enmascarada `v_creators`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Una nota diaria del bot con su desglose. */
export interface NotaDelBot {
  fecha: string;
  nota: number;
  /** Lo que el bot usó para calcularla. Las claves varían por objetivo. */
  componentes: {
    objetivo?: string | null;
    franjas?: number | null;
    franjas_max?: number | null;
    hub_h?: number | null;
    hub_act?: number | null;
    promos_roster?: number | null;
    roster?: number | null;
    contactadas?: number | null;
    numeros?: number | null;
    numeros_auto_reportados?: number | null;
    msgs_dia?: number | null;
  } | null;
}

const SIN_NOTAS: NotaDelBot[] = [];

/** Las notas 1-10 que el bot publica en el grupo de WhatsApp, del propio user. */
export function useMisNotasDelBot(desde: string, hasta: string) {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["mis-notas-bot", user?.id, desde, hasta],
    queryFn: async (): Promise<NotaDelBot[]> => {
      const { data, error } = await db
        .from("corte_notas")
        .select("fecha, nota_sugerida, componentes")
        .eq("profile_id", user!.id)
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ fecha: string; nota_sugerida: number | string; componentes: unknown }>)
        .map((r) => ({ fecha: r.fecha, nota: Number(r.nota_sugerida), componentes: (r.componentes ?? null) as NotaDelBot["componentes"] }));
    },
  });
  return { notas: q.data ?? SIN_NOTAS, cargando: q.isLoading };
}

/** El objetivo con el que el bot mide a esta persona (tabla corte_objetivos). */
export function useMiObjetivo() {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["mi-objetivo-corte", user?.id],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<{ metrica: string; meta_diaria: number } | null> => {
      const { data, error } = await db
        .from("corte_objetivos")
        .select("metrica, meta_diaria")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { metrica: data.metrica, meta_diaria: Number(data.meta_diaria) } : null;
    },
  });
  return q.data ?? null;
}

export interface CreadoraDelManager {
  id: string;
  nombre: string;
  instagram_handle: string | null;
  profile_photo_url: string | null;
  status: string | null;
}

const SIN_CREADORAS: CreadoraDelManager[] = [];

/** Las creadoras ACTIVAS asignadas a esta persona como manager. */
export function useMisCreadoras() {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["mis-creadoras", user?.id],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CreadoraDelManager[]> => {
      const { data, error } = await db
        .from("v_creators")
        .select("id, name, artistic_name, instagram_handle, profile_photo_url, status")
        .eq("assigned_manager_id", user!.id)
        .eq("status", "active")
        .order("name");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; name: string | null; artistic_name: string | null; instagram_handle: string | null; profile_photo_url: string | null; status: string | null }>)
        .map((c) => ({
          id: c.id,
          nombre: (c.artistic_name || c.name || "").trim() || "Sin nombre",
          instagram_handle: c.instagram_handle,
          profile_photo_url: c.profile_photo_url,
          status: c.status,
        }));
    },
  });
  return { creadoras: q.data ?? SIN_CREADORAS, cargando: q.isLoading };
}
