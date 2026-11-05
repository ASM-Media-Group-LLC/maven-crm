import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRondinVivo } from "@/hooks/useRondinVivo";
import { equipoDeRoles } from "@/hooks/useTurnoPersonas";
import { construirPulso, puedeVerPulso, nivelesVisibles, type Pulso } from "@/lib/pulsoEquipo";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Junta el
// ROSTER visible por jerarquía (profiles.nivel: cada quien ve de su rango para
// abajo) con el ESTADO EN VIVO de cada persona (useRondinVivo, refresca 15 s) y
// arma la nota viva + quién la baja + las cajas por equipo. Lo ven supervisor+.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface MiembroRoster { userId: string; nombre: string; avatarUrl: string | null; avatarSeed: string | null; equipo: string }

export interface PulsoEquipo {
  puedeVer: boolean;
  nivel: string | null;
  pulso: Pulso | null;
  cargando: boolean;
  error: Error | null;
  ultimaRonda: Date | null;
}

export function usePulsoEquipo(): PulsoEquipo {
  const { user } = useAuth();
  const rondin = useRondinVivo();

  // El nivel del que mira (barato, cacheado): decide a quién puede ver.
  const nivelQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["mi-nivel", user?.id ?? null],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await sinTipar.from("profiles").select("nivel").eq("id", user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.nivel as string | null) ?? null;
    },
  });
  const nivel = nivelQ.data ?? null;
  const puedeVer = puedeVerPulso(nivel);

  // El roster visible: todos los activos de rango inferior, con su equipo.
  const rosterQ = useQuery({
    enabled: !!user?.id && puedeVer,
    queryKey: ["pulso-roster", nivel],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MiembroRoster[]> => {
      const niveles = nivelesVisibles(nivel);
      if (niveles.length === 0) return [];
      const { data: perfiles, error } = await sinTipar
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .is("deleted_at", null)
        .in("nivel", niveles);
      if (error) throw new Error(error.message);
      const ids = (perfiles ?? []).map((p: { id: string }) => p.id);
      if (ids.length === 0) return [];
      const { data: roles } = await sinTipar.from("user_roles").select("user_id, role").in("user_id", ids);
      const rolesPor = new Map<string, Set<string>>();
      for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
        const s = rolesPor.get(r.user_id) ?? new Set<string>();
        s.add(r.role);
        rolesPor.set(r.user_id, s);
      }
      return (perfiles ?? []).map((p: { id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }) => ({
        userId: p.id,
        nombre: p.full_name?.trim() || "",
        avatarUrl: p.avatar_url,
        avatarSeed: p.avatar_seed,
        equipo: equipoDeRoles(rolesPor.get(p.id)),
      }));
    },
  });

  const estadoPor = new Map(rondin.personas.map((p) => [p.userId, { estado: p.estado, desde: p.desde }]));
  const pulso = puedeVer && rosterQ.data ? construirPulso(rosterQ.data, estadoPor) : null;

  return {
    puedeVer,
    nivel,
    pulso,
    cargando: nivelQ.isLoading || (puedeVer && (rosterQ.isLoading || rondin.cargando)),
    error: (nivelQ.error as Error | null) ?? (rosterQ.error as Error | null) ?? rondin.error ?? null,
    ultimaRonda: rondin.resumen.ultimaRonda,
  };
}
