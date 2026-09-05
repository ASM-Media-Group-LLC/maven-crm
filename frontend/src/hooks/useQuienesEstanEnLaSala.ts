// Quién está YA adentro de una llamada, para mostrarlo en la sala de espera
// antes de entrar (como Google Meet: "Ana y Luis están en esta llamada").
//
// La respuesta la arma la edge `livekit-moderate` (acción `quienesEstan`)
// preguntándole al servidor de LiveKit y cruzando con `profiles` para traer
// foto y muñequito. Se vuelve a preguntar cada pocos segundos mientras la
// persona sigue en la sala de espera: la gente entra y sale justo en ese rato.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PersonaEnSala {
  id: string;
  nombre: string;
  foto: string | null;
  seed: string | null;
  invitado: boolean;
}

export const INTERVALO_QUIENES_ESTAN_MS = 5_000;

export async function pedirQuienesEstan(roomName: string): Promise<PersonaEnSala[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-moderate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "quienesEstan", room: roomName }),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || "No se pudo ver quién está en la llamada");
  return (json?.personas ?? []) as PersonaEnSala[];
}

export function useQuienesEstanEnLaSala(roomName: string | undefined, activo = true) {
  const query = useQuery({
    queryKey: ["quienes-estan-en-la-sala", roomName],
    enabled: !!roomName && activo,
    queryFn: () => pedirQuienesEstan(roomName!),
    refetchInterval: INTERVALO_QUIENES_ESTAN_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 1,
  });
  return {
    personas: query.data ?? [],
    // "Cargando" solo la PRIMERA vez: en los refrescos siguientes ya hay lista
    // que mostrar y no queremos que parpadee.
    cargando: query.isLoading,
    fallo: query.isError,
  };
}
