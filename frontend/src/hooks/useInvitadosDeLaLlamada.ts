// Quién está invitado a la llamada de esta sala y en qué anda cada uno
// (sonando, adentro, rechazó, no contestó). Lo usan «Agregar a la llamada» y el
// aviso para quien llama («Ana no contestó»), que antes no existía: quien
// llamaba se quedaba solo en la sala sin saber nada.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import { buscarUltimaLlamada, type EstadoInvitado, type LlamadaViva } from "@/lib/llamadaInvitar";

export interface Invitado {
  user_id: string;
  nombre: string;
  status: EstadoInvitado;
}

export function useInvitadosDeLaLlamada(roomName: string | undefined, uid: string | undefined, activo: boolean) {
  const [llamada, setLlamada] = useState<LlamadaViva | null>(null);
  const [invitados, setInvitados] = useState<Invitado[]>([]);
  const [error, setError] = useState(false);
  const nombres = useRef(new Map<string, string>());

  const cargar = useCallback(async () => {
    if (!roomName || !uid) return;
    try {
      const viva = await buscarUltimaLlamada(roomName);
      setLlamada(viva);
      setError(false);
      if (!viva) { setInvitados([]); return; }
      const { data, error: e } = await (supabase.from("call_participants") as any)
        .select("user_id, status")
        .eq("call_id", viva.id);
      if (e) throw e;
      const filas = (data ?? []) as { user_id: string; status: EstadoInvitado }[];
      const faltan = filas.map((f) => f.user_id).filter((id) => !nombres.current.has(id));
      if (faltan.length) {
        const { data: perfiles } = await supabase.from("profiles").select("id, full_name").in("id", faltan);
        for (const p of perfiles ?? []) nombres.current.set(p.id as string, (p.full_name as string) || "");
      }
      setInvitados(filas.map((f) => ({ ...f, nombre: nombres.current.get(f.user_id) || "" })));
    } catch {
      setError(true);
    }
  }, [roomName, uid]);

  useEffect(() => {
    if (!activo) return;
    void cargar();
  }, [activo, cargar]);

  // En vivo: cada cambio de una fila de esta llamada (alguien contestó,
  // rechazó, lo agregaron).
  useCanalQueRevive({
    topic: activo && llamada?.id ? `invitados-${llamada.id}` : null,
    armar: (canal) =>
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_participants", filter: `call_id=eq.${llamada?.id}` },
        () => { void cargar(); },
      ),
    alRevivir: () => { void cargar(); },
  });

  // Red por si el evento no llega: cada 10 s se vuelve a mirar.
  useEffect(() => {
    if (!activo) return;
    const red = setInterval(() => { void cargar(); }, 10_000);
    return () => clearInterval(red);
  }, [activo, cargar]);

  return { llamada, invitados, error, recargar: cargar };
}
