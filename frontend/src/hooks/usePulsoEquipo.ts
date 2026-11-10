import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsRh } from "@/hooks/useEsRh";
import { useRondinVivo } from "@/hooks/useRondinVivo";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { equipoDeRoles } from "@/hooks/useTurnoPersonas";
import { alcanceDelPulso, construirPulso, nivelesVisibles, type AlcancePulso, type Pulso } from "@/lib/pulsoEquipo";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Junta el
// ROSTER visible con el ESTADO EN VIVO de cada persona (useRondinVivo, refresca
// 15 s) y arma la nota viva + quién la baja + las cajas por equipo.
//
// A quién ve cada uno (Alvaro, 10/11 — «quién mira qué»), ver alcanceDelPulso:
// dueño/admin/manager por jerarquía, RR. HH. a todo el personal menos admins, y
// cada supervisor SOLO a su equipo (la lista la da la base).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

interface MiembroRoster { userId: string; nombre: string; avatarUrl: string | null; avatarSeed: string | null; equipo: string }
type Perfil = { id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null };

export interface PulsoEquipo {
  puedeVer: boolean;
  alcance: AlcancePulso | null;
  nivel: string | null;
  pulso: Pulso | null;
  cargando: boolean;
  error: Error | null;
  ultimaRonda: Date | null;
  reintentar: () => void;
}

/** Perfiles + su equipo (por rol) para armar el roster. */
async function conEquipo(perfiles: Perfil[]): Promise<MiembroRoster[]> {
  const ids = perfiles.map((p) => p.id);
  if (ids.length === 0) return [];
  const { data: roles, error } = await sinTipar.from("user_roles").select("user_id, role").in("user_id", ids);
  if (error) throw new Error(error.message);
  const rolesPor = new Map<string, Set<string>>();
  for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
    const s = rolesPor.get(r.user_id) ?? new Set<string>();
    s.add(r.role);
    rolesPor.set(r.user_id, s);
  }
  return perfiles.map((p) => ({
    userId: p.id,
    nombre: p.full_name?.trim() || "",
    avatarUrl: p.avatar_url,
    avatarSeed: p.avatar_seed,
    equipo: equipoDeRoles(rolesPor.get(p.id)),
  }));
}

export function usePulsoEquipo(): PulsoEquipo {
  const { user } = useAuth();
  const { esRh, cargando: rhCargando, error: rhError } = useEsRh();
  const { onlineUsers } = useOnlinePresence();

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
  const alcance = nivelQ.isSuccess && !rhCargando ? alcanceDelPulso(nivel, esRh === true) : null;
  const puedeVer = alcance != null;

  // El rondín solo corre para quien ve el Pulso (no 28 chatters cada 15 s).
  const rondin = useRondinVivo(puedeVer);

  const rosterQ = useQuery({
    enabled: !!user?.id && puedeVer,
    queryKey: ["pulso-roster", alcance, nivel, user?.id ?? null],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MiembroRoster[]> => {
      const campos = "id, full_name, avatar_url, avatar_seed";
      if (alcance === "equipo") {
        // El equipo lo decide la base (el mismo criterio que abre la data de Argos).
        const { data: ids, error } = await sinTipar.rpc("mi_equipo_supervisado");
        if (error) throw new Error(error.message);
        const lista = ((ids ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
        if (lista.length === 0) return [];
        const { data, error: e2 } = await sinTipar.from("profiles").select(campos).in("id", lista);
        if (e2) throw new Error(e2.message);
        return conEquipo((data ?? []) as Perfil[]);
      }
      // RR. HH.: todo el personal que no es admin ni dueño (menos uno mismo).
      const niveles = alcance === "rrhh" ? ["manager", "supervisor", "agente"] : nivelesVisibles(nivel);
      if (niveles.length === 0) return [];
      const { data, error } = await sinTipar.from("profiles").select(campos).is("deleted_at", null).in("nivel", niveles);
      if (error) throw new Error(error.message);
      return conEquipo(((data ?? []) as Perfil[]).filter((p) => p.id !== user?.id));
    },
  });

  const estadoPor = new Map(rondin.personas.map((p) => [p.userId, { estado: p.estado, desde: p.desde }]));
  const pulso = puedeVer && rosterQ.data ? construirPulso(rosterQ.data, estadoPor, onlineUsers) : null;

  return {
    puedeVer,
    alcance,
    nivel,
    pulso,
    // El rondín es solo una CAPA de calidad encima; no bloquea (la presencia
    // online llega al instante del contexto). Basta con nivel + roster.
    cargando: nivelQ.isLoading || rhCargando || (puedeVer && rosterQ.isLoading),
    // Un fallo no es «sin equipo»: se dice y se deja reintentar.
    error: (nivelQ.error as Error | null) ?? rhError ?? (rosterQ.error as Error | null) ?? rondin.error ?? null,
    ultimaRonda: rondin.resumen.ultimaRonda,
    reintentar: () => { void nivelQ.refetch(); void rosterQ.refetch(); },
  };
}
