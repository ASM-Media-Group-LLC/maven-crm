import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlCaptura } from "@/hooks/useMonitorEventos";

// ATENCIÓN AHORA (Argos): quién necesita que lo mires, de peor a mejor. Lee las
// alertas VIVAS (argos_alertas sin cerrar) que abre y cierra el vigía server-side
// cada 2 min, las agrupa por persona y les pone cara, nombre y su pantallazo más
// reciente. Se refresca solo. Lo ve el dueño (lo fuerza la RLS).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export type TipoAlerta =
  | "fuera_de_lugar" | "sin_senal" | "sin_pantalla" | "pausa_de_mas"
  | "camara_apagada" | "camara_tapada" | "se_fue" | "cara_incompleta"
  | "celular" | "distraido" | "no_mira";

// PROBLEMAS (acción) vs PAUSAS/ojo. Una pausa (baño/break/almuerzo) nunca cuenta
// como problema; lo grave es dejar de trabajar o estar fuera de lugar. Lo usan
// el panel de Atención y el semáforo de Conectados ahora.
export const TIPOS_GRAVES = new Set<TipoAlerta>(["fuera_de_lugar", "sin_senal", "sin_pantalla", "camara_apagada", "se_fue", "celular", "no_mira"]);

export interface AlertaViva {
  id: string;
  tipo: TipoAlerta;
  gravedad: number;
  detalle: string | null;
  abiertaAt: string;
}

export interface PersonaEnAtencion {
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  gravedad: number; // la peor de sus alertas
  alertas: AlertaViva[]; // de peor a mejor
  abiertaAt: string; // la alerta más antigua aún viva
  capturaUrl: string | null; // su pantallazo más reciente (evidencia)
}

interface FilaAlerta {
  id: string; user_id: string; tipo: string; gravedad: number; detalle: string | null; captura_path: string | null; abierta_at: string;
}

const porGravedadYAntiguedad = <T extends { gravedad: number; abiertaAt: string }>(a: T, b: T): number =>
  (b.gravedad - a.gravedad) || (Date.parse(a.abiertaAt) - Date.parse(b.abiertaAt));

export function useAtencionAhora() {
  const q = useQuery({
    queryKey: ["atencion-ahora"],
    staleTime: 10_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<PersonaEnAtencion[]> => {
      const { data, error } = await sinTipar
        .from("argos_alertas")
        .select("id, user_id, tipo, gravedad, detalle, captura_path, abierta_at")
        .is("cerrada_at", null)
        .order("gravedad", { ascending: false })
        .order("abierta_at", { ascending: true })
        .limit(200);
      // PostgREST: error ≠ vacío. Si falló, propagamos; nunca "todo en orden" ante un fallo.
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as FilaAlerta[];
      if (filas.length === 0) return [];

      // Agrupar por persona.
      const porPersona = new Map<string, { alertas: AlertaViva[]; gravedad: number; abiertaAt: string; captura: string | null }>();
      for (const f of filas) {
        const p = porPersona.get(f.user_id) ?? { alertas: [], gravedad: 0, abiertaAt: f.abierta_at, captura: null };
        p.alertas.push({ id: f.id, tipo: f.tipo as TipoAlerta, gravedad: f.gravedad, detalle: f.detalle, abiertaAt: f.abierta_at });
        p.gravedad = Math.max(p.gravedad, f.gravedad);
        if (Date.parse(f.abierta_at) < Date.parse(p.abiertaAt)) p.abiertaAt = f.abierta_at;
        if (!p.captura && f.captura_path) p.captura = f.captura_path;
        porPersona.set(f.user_id, p);
      }
      const ids = [...porPersona.keys()];

      // Cara y nombre + el pantallazo más reciente de quien no trae evidencia propia.
      const sinEvidencia = ids.filter((id) => !porPersona.get(id)!.captura);
      const [{ data: perfiles }, { data: recientes }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids),
        sinEvidencia.length
          ? sinTipar.from("monitor_capturas").select("user_id, path, en_nas, nas_path").eq("tipo", "pantalla").in("user_id", sinEvidencia)
              .gte("created_at", new Date(Date.now() - 20 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(200)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);
      const perfilPor = new Map((perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]));
      for (const r of (recientes ?? []) as Array<{ user_id: string; path: string | null; en_nas: boolean; nas_path: string | null }>) {
        const p = porPersona.get(r.user_id);
        if (p && !p.captura) p.captura = r.en_nas ? r.nas_path : r.path;
      }

      const personas = await Promise.all(
        ids.map(async (id) => {
          const p = porPersona.get(id)!;
          p.alertas.sort(porGravedadYAntiguedad);
          const perfil = perfilPor.get(id);
          return {
            userId: id,
            nombre: perfil?.full_name?.trim() || "",
            avatarUrl: perfil?.avatar_url ?? null,
            avatarSeed: perfil?.avatar_seed ?? null,
            gravedad: p.gravedad,
            alertas: p.alertas,
            abiertaAt: p.abiertaAt,
            capturaUrl: p.captura ? await urlCaptura(p.captura) : null,
          } as PersonaEnAtencion;
        }),
      );
      return personas.sort(porGravedadYAntiguedad);
    },
  });

  return {
    personas: q.data ?? [],
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    refrescar: () => q.refetch(),
  };
}
