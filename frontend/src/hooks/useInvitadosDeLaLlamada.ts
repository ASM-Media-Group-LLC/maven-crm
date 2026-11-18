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
  /** Foto y muñequito, para la pantalla de «Llamando a…». */
  foto?: string | null;
  seed?: string | null;
}

type Perfil = { nombre: string; foto: string | null; seed: string | null };

export function useInvitadosDeLaLlamada(roomName: string | undefined, uid: string | undefined, activo: boolean) {
  const [llamada, setLlamada] = useState<LlamadaViva | null>(null);
  const [invitados, setInvitados] = useState<Invitado[]>([]);
  const [error, setError] = useState(false);
  const perfiles = useRef(new Map<string, Perfil>());

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
      const faltan = filas.map((f) => f.user_id).filter((id) => !perfiles.current.has(id));
      if (faltan.length) {
        const { data: filasPerfil } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", faltan);
        for (const p of (filasPerfil ?? []) as { id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }[]) {
          perfiles.current.set(p.id, { nombre: p.full_name || "", foto: p.avatar_url ?? null, seed: p.avatar_seed ?? null });
        }
      }
      setInvitados(filas.map((f) => {
        const p = perfiles.current.get(f.user_id);
        return { ...f, nombre: p?.nombre || "", foto: p?.foto ?? null, seed: p?.seed ?? null };
      }));
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
