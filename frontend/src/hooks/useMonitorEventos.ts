import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

// Las faltas que registró el monitor de cámara, para el panel de RRHH. Lo ven
// supervisores y admins (lo fuerza la RLS). Se refresca en vivo: cuando entra
// una falta nueva (gratis o de IA), la lista se actualiza sola. Desde acá RRHH
// también actúa sobre cada falta (marcarla, descartarla, anotarla).

export type EstadoEvento = "pendiente" | "falta" | "descartado";

export interface MonitorEvento {
  id: string;
  user_id: string;
  nombre: string | null;
  room_nombre: string | null;
  tipo: string;
  fuente: string; // 'local' | 'ia'
  detalle: string | null;
  captura_path: string | null;
  created_at: string;
  estado: EstadoEvento;
  nota: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useMonitorEventos(limite = 300) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["monitor-eventos", limite],
    staleTime: 15_000,
    queryFn: async (): Promise<MonitorEvento[]> => {
      const { data, error } = await sinTipar
        .from("monitor_eventos")
        .select("id, user_id, room_nombre, tipo, fuente, detalle, captura_path, created_at, estado, nota")
        .order("created_at", { ascending: false })
        .limit(limite);
      if (error) throw error;
      const filas = (data ?? []) as Array<Omit<MonitorEvento, "nombre">>;
      const ids = [...new Set(filas.map((f) => f.user_id))];
      const nombres: Record<string, string | null> = {};
      if (ids.length) {
        const { data: perfiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (perfiles ?? []) as Array<{ id: string; full_name: string | null }>) {
          nombres[p.id] = p.full_name;
        }
      }
      return filas.map((f) => ({ ...f, nombre: nombres[f.user_id] ?? null }));
    },
  });

  useCanalQueRevive({
    topic: "monitor-eventos-feed",
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monitor_eventos" },
        () => { void qc.invalidateQueries({ queryKey: ["monitor-eventos"] }); },
      ),
    alRevivir: () => { void qc.invalidateQueries({ queryKey: ["monitor-eventos"] }); },
  });

  // ── Acciones de RRHH sobre una falta ──
  // Marcar falta / descartar guardan el estado + quién y cuándo resolvió. La nota
  // es un comentario libre ("ya hablé con él"). La RLS solo deja a supervisor+.
  const resolver = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoEvento }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await sinTipar.from("monitor_eventos")
        .update({ estado, resuelto_por: uid, resuelto_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitor-eventos"] }),
  });

  const anotar = useMutation({
    mutationFn: async ({ id, nota }: { id: string; nota: string }) => {
      const { error } = await sinTipar.from("monitor_eventos")
        .update({ nota: nota.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitor-eventos"] }),
  });

  return {
    eventos: query.data ?? [],
    cargando: query.isLoading,
    // Un fallo de lectura NO es "no hay faltas": se distingue para no mostrar un
    // panel vacío ante un error de red o de permisos (regla del repo).
    error: (query.error as Error | null) ?? null,
    refrescar: () => qc.invalidateQueries({ queryKey: ["monitor-eventos"] }),
    marcarFalta: (id: string) => resolver.mutateAsync({ id, estado: "falta" }),
    descartar: (id: string) => resolver.mutateAsync({ id, estado: "descartado" }),
    reabrir: (id: string) => resolver.mutateAsync({ id, estado: "pendiente" }),
    guardarNota: (id: string, nota: string) => anotar.mutateAsync({ id, nota }),
    actuando: resolver.isPending || anotar.isPending,
  };
}

/** URL firmada (1 hora) para ver una captura del BUZÓN (bucket privado de Supabase).
 *  Antes caducaba a los 2 min: si el supervisor dejaba el Expediente abierto un
 *  rato, TODAS las miniaturas se rompían (ícono de imagen rota) porque la firma
 *  vencía y no se re-firmaba. 1 h cubre cualquier sesión de revisión (igual que
 *  el resto de firmados de la app). Alvaro, 04/11. */
export async function urlCaptura(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from("monitor-capturas").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** URLs firmadas para las capturas que ya viven en el NAS (en_nas), en un solo
 *  viaje. Devuelve un mapa { nasPath: url }. Solo el dueño puede (lo fuerza la
 *  edge argos-foto). Un fallo devuelve mapa vacío (la miniatura queda en spinner,
 *  nunca se concluye "no hay"). */
export async function urlsDeNas(nasPaths: string[]): Promise<Record<string, string>> {
  const unicas = [...new Set(nasPaths.filter(Boolean))];
  if (unicas.length === 0) return {};
  try {
    const { data, error } = await supabase.functions.invoke("argos-foto", { body: { nas_paths: unicas } });
    if (error) return {};
    return (data as { urls?: Record<string, string> } | null)?.urls ?? {};
  } catch {
    return {};
  }
}
