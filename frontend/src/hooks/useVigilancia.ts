import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useEsRh } from "@/hooks/useEsRh";

// ¿PUEDE ESTA PERSONA VIGILAR? (Monitoreo en vivo · Alvaro, 11/11/2026)
//
// «Quién está bajando ahora» y la vista en vivo los ven el DUEÑO, RR. HH. (rol
// HHRR) y los SUPERVISORES (solo su equipo). Es la misma regla que la base
// (puede_vigilar en 20261111210000_monitoreo_en_vivo.sql): aquí solo se decide
// si se dibuja la puerta; a QUIÉN ve cada uno lo filtra la base, persona por
// persona. Un fallo de red no es «no puedes»: queda en null y se ofrece
// reintentar.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export type AlcanceVigilancia = "dueno" | "rrhh" | "equipo";

export function alcanceDeVigilancia(esDueno: boolean, esRh: boolean, nivel: string | null): AlcanceVigilancia | null {
  if (esDueno) return "dueno";
  if (esRh) return "rrhh";
  if (nivel === "supervisor") return "equipo";
  return null;
}

export function useVigilancia(): {
  puede: boolean | null;
  alcance: AlcanceVigilancia | null;
  cargando: boolean;
  error: Error | null;
  reintentar: () => void;
} {
  const { user } = useAuth();
  const dueno = useEsDueno();
  const rh = useEsRh();
  // Misma clave que usePulsoEquipo: una sola lectura del nivel por sesión.
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

  const listo = dueno.esDueno != null && rh.esRh != null && nivelQ.isSuccess;
  const alcance = listo ? alcanceDeVigilancia(dueno.esDueno === true, rh.esRh === true, nivelQ.data ?? null) : null;
  // Si ya se sabe que es dueño (o RR. HH.), un fallo en lo demás no importa.
  const puede = dueno.esDueno === true || rh.esRh === true ? true : listo ? alcance != null : null;
  return {
    puede,
    alcance: dueno.esDueno === true ? "dueno" : rh.esRh === true ? "rrhh" : alcance,
    cargando: dueno.cargando || rh.cargando || nivelQ.isLoading,
    error: puede === null ? (dueno.error ?? rh.error ?? (nivelQ.error as Error | null) ?? null) : null,
    reintentar: () => { void nivelQ.refetch(); },
  };
}
