import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// La ACTIVIDAD del Drive de un archivo o carpeta (Alvaro, 04/11), como en Google:
// quién subió / creó / renombró / movió / tiró / restauró / borró, y cuándo. La
// alimenta la tabla public.drive_actividad (un trigger en drive_items la llena
// sola). Para una CARPETA se traen también los eventos de sus hijos directos
// (lo que pasó DENTRO), por eso se filtra por item_id O parent_id.

export type AccionDrive =
  | "subio" | "creo_carpeta" | "renombro" | "movio" | "a_papelera" | "restauro" | "borro";

export interface EventoActividad {
  id: string;
  itemId: string | null;
  actorId: string | null;
  actorNombre: string;
  actorAvatarUrl: string | null;
  actorAvatarSeed: string | null;
  accion: AccionDrive;
  nombre: string | null;
  createdAt: string;
  // Subido por el link público: no es de nadie interno. `quien` = el nombre que
  // tecleó quien subió (o null = invitado sin nombre).
  viaLink: boolean;
  quien: string | null;
}

interface FilaActividad {
  id: string;
  item_id: string | null;
  actor_id: string | null;
  accion: AccionDrive;
  nombre: string | null;
  created_at: string;
  detalle: { via_link?: boolean; quien?: string | null } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useActividadDrive(itemId: string | null, habilitado: boolean) {
  const q = useQuery({
    enabled: habilitado && !!itemId,
    queryKey: ["drive-actividad", itemId],
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<EventoActividad[]> => {
      const { data, error } = await sinTipar
        .from("drive_actividad")
        .select("id, item_id, actor_id, accion, nombre, created_at, detalle")
        .or(`item_id.eq.${itemId},parent_id.eq.${itemId}`)
        .order("created_at", { ascending: false })
        .limit(200);
      // PostgREST: null = la petición falló (no es "sin actividad"): se propaga el
      // error para mostrar "reintentar", no un falso vacío.
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaActividad[];
      if (filas.length === 0) return [];

      const ids = [...new Set(filas.map((f) => f.actor_id).filter((x): x is string => !!x))];
      const perfilPor = new Map<string, { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>();
      if (ids.length > 0) {
        const { data: perfiles } = await supabase
          .from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids);
        for (const p of perfiles ?? []) perfilPor.set(p.id as string, p as never);
      }

      return filas.map((f) => {
        const viaLink = f.detalle?.via_link === true;
        const quien = (f.detalle?.quien ?? null)?.trim() || null;
        const perfil = f.actor_id ? perfilPor.get(f.actor_id) : undefined;
        return {
          id: f.id,
          itemId: f.item_id,
          actorId: f.actor_id,
          actorNombre: viaLink ? (quien ?? "") : (perfil?.full_name?.trim() || ""),
          actorAvatarUrl: viaLink ? null : (perfil?.avatar_url ?? null),
          actorAvatarSeed: viaLink ? (quien ?? "link") : (perfil?.avatar_seed ?? null),
          accion: f.accion,
          nombre: f.nombre,
          createdAt: f.created_at,
          viaLink,
          quien,
        };
      });
    },
  });

  return { eventos: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null, refrescar: () => q.refetch() };
}
