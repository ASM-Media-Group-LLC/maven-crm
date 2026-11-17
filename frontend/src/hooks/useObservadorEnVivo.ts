import { afirmarRelojesDeLiveKit } from "@/lib/relojesFirmes";
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication } from "livekit-client";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { idDePestana } from "@/lib/idDePestana";

// VER A UNA PERSONA EN VIVO (Monitoreo en vivo · Alvaro, 11/11/2026).
//
// Cómo lo hacen hoy los supervisores: entran a la sala de Cowork por LiveKit y
// miran las miniaturas (el tablero del anfitrión) o, el admin, de incógnito
// (cowork-session · incognito_room: observador OCULTO que solo se suscribe).
// Aquí se reusa ese mismo observador, pero apuntado a UNA persona:
//   · el edge cowork-session (acción observarPersona) resuelve en qué sala está
//     la persona AHORA (su asignación viva + quién ve LiveKit conectado), revisa
//     con la base que quien mira pueda vigilarla (puede_vigilar) y entrega un
//     token hidden + solo suscribirse (no puede publicar nada, no aparece en la
//     lista de la sala, no crea membresía);
//   · el navegador entra con autoSubscribe APAGADO y se suscribe SOLO a la
//     pantalla y la cámara de esa persona (y a su micrófono si se pide oír). El
//     resto de la sala ni se descarga.
// Si la persona no está en Cowork, si el edge todavía no tiene la acción (antes
// del despliegue) o si no se puede, el estado lo dice y la vista muestra el
// video de esos minutos en su lugar. Se reconecta solo, con espera creciente.

export type EstadoObservador =
  | "apagado"       // no se pidió (p. ej. se está viendo el video)
  | "conectando"
  | "en_vivo"       // la persona está en la sala (con o sin cámara/pantalla)
  | "esperando"     // dentro de su sala, pero ella no está conectada ahora
  | "sin_cowork"    // no tiene sala asignada: no está en Cowork
  | "sin_permiso"   // la base dice que no puedes verla
  | "no_disponible" // el edge no ofrece la vista en vivo (o no se pudo pedir)
  | "error";        // LiveKit no conectó; se reintenta solo

export interface SalaObservada {
  nombre: string | null;
  sesion: string | null;
}

interface RespuestaObservar {
  enCowork?: boolean;
  presente?: boolean | null;
  token?: string;
  url?: string;
  roomName?: string;
  sessionName?: string;
  identidad?: string;
  error?: string;
}

type Pedido =
  | { tipo: "token"; token: string; url: string; identidad: string; sala: SalaObservada }
  | { tipo: "estado"; estado: EstadoObservador };

/** Pide al edge el pase de observador para esta persona. Nunca lanza: traduce
 *  cada respuesta a un estado de la vista. */
export async function pedirObservar(targetUserId: string): Promise<Pedido> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cowork-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ action: "observarPersona", targetUserId, clientId: idDePestana() }),
    });
    let j: RespuestaObservar | null = null;
    try { j = (await res.json()) as RespuestaObservar; } catch { j = null; }
    if (res.status === 403) return { tipo: "estado", estado: "sin_permiso" };
    if (!res.ok || !j) return { tipo: "estado", estado: "no_disponible" };
    if (j.enCowork === false) return { tipo: "estado", estado: "sin_cowork" };
    if (!j.token || !j.url) return { tipo: "estado", estado: "no_disponible" };
    return {
      tipo: "token",
      token: j.token,
      url: j.url,
      identidad: j.identidad || targetUserId,
      sala: { nombre: j.roomName ?? null, sesion: j.sessionName ?? null },
    };
  } catch {
    return { tipo: "estado", estado: "no_disponible" };
  }
}

const ESPERA_REVISAR_MS = 45_000; // si no está en esa sala, se vuelve a preguntar dónde está

export function useObservadorEnVivo(targetUserId: string | null, activo: boolean, escuchar: boolean) {
  const [estado, setEstado] = useState<EstadoObservador>(activo ? "conectando" : "apagado");
  const [pantalla, setPantalla] = useState<RemoteTrack | null>(null);
  const [camara, setCamara] = useState<RemoteTrack | null>(null);
  const [audio, setAudio] = useState<RemoteTrack | null>(null);
  const [sala, setSala] = useState<SalaObservada | null>(null);
  const [intento, setIntento] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const escucharRef = useRef(escuchar);
  escucharRef.current = escuchar;
  const identidadRef = useRef<string | null>(null);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    if (!activo || !targetUserId) {
      setEstado("apagado");
      return;
    }
    let cancelado = false;
    let temporizador: number | null = null;
    const programar = (ms: number) => {
      if (cancelado || temporizador !== null) return;
      temporizador = window.setTimeout(() => { temporizador = null; setIntento((n) => n + 1); }, ms);
    };
    const limpiarPistas = () => { setPantalla(null); setCamara(null); setAudio(null); };

    setEstado("conectando");
    limpiarPistas();

    afirmarRelojesDeLiveKit();
    const room = new Room({ adaptiveStream: true, dynacast: false });
    roomRef.current = room;

    const esElla = (p: RemoteParticipant | undefined | null) => !!p && p.identity === identidadRef.current;

    // Suscribirse SOLO a lo de ella: pantalla y cámara siempre; micro si se pide.
    const suscribir = (pub: RemoteTrackPublication) => {
      const fuente = pub.source;
      const quiere = fuente === Track.Source.ScreenShare || fuente === Track.Source.Camera
        || (fuente === Track.Source.Microphone && escucharRef.current);
      try { pub.setSubscribed(quiere); } catch { /* publicación que se fue */ }
    };
    const alEncontrarla = (p: RemoteParticipant) => {
      p.trackPublications.forEach((pub) => suscribir(pub as RemoteTrackPublication));
      setEstado("en_vivo");
    };
    const ponerPista = (track: RemoteTrack, pub: RemoteTrackPublication, valor: RemoteTrack | null) => {
      if (pub.source === Track.Source.ScreenShare) setPantalla(valor);
      else if (pub.source === Track.Source.Camera) setCamara(valor);
      else if (pub.source === Track.Source.Microphone) setAudio(valor);
      void track;
    };

    room
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => { if (esElla(p)) alEncontrarla(p); })
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        if (!esElla(p)) return;
        limpiarPistas();
        setEstado("esperando");
        programar(ESPERA_REVISAR_MS);
      })
      .on(RoomEvent.TrackPublished, (pub: RemoteTrackPublication, p: RemoteParticipant) => { if (esElla(p)) suscribir(pub); })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (esElla(p)) ponerPista(track, pub, track);
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, p: RemoteParticipant) => {
        if (esElla(p)) ponerPista(track, pub, null);
      })
      .on(RoomEvent.Disconnected, () => {
        if (cancelado) return;
        limpiarPistas();
        setEstado("error");
        programar(Math.min(30_000, 3_000 * 2 ** Math.min(intento, 3)));
      });

    (async () => {
      const pedido = await pedirObservar(targetUserId);
      if (cancelado) return;
      if (pedido.tipo === "estado") {
        setEstado(pedido.estado);
        // Si no está en Cowork, se vuelve a preguntar de a ratos: puede entrar.
        if (pedido.estado === "sin_cowork") programar(ESPERA_REVISAR_MS);
        return;
      }
      identidadRef.current = pedido.identidad;
      setSala(pedido.sala);
      try {
        await room.connect(pedido.url, pedido.token, { autoSubscribe: false });
      } catch {
        if (cancelado) return;
        setEstado("error");
        programar(Math.min(30_000, 3_000 * 2 ** Math.min(intento, 3)));
        return;
      }
      if (cancelado) { void room.disconnect(); return; }
      const ella = room.remoteParticipants.get(pedido.identidad);
      if (ella) alEncontrarla(ella);
      else {
        setEstado("esperando");
        programar(ESPERA_REVISAR_MS);
      }
    })();

    return () => {
      cancelado = true;
      if (temporizador !== null) window.clearTimeout(temporizador);
      roomRef.current = null;
      void room.disconnect();
    };
    // `intento` re-crea la conexión (reintento o volver a buscar su sala).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, targetUserId, intento]);

  // Oír o dejar de oír sin reconectar: solo cambia la suscripción al micro.
  useEffect(() => {
    const room = roomRef.current;
    const id = identidadRef.current;
    if (!room || !id) return;
    const ella = room.remoteParticipants.get(id);
    if (!ella) return;
    ella.trackPublications.forEach((pub) => {
      if (pub.source === Track.Source.Microphone) {
        try { (pub as RemoteTrackPublication).setSubscribed(escuchar); } catch { /* noop */ }
      }
    });
    if (!escuchar) setAudio(null);
  }, [escuchar, estado]);

  return { estado, pantalla, camara, audio, sala, reintentar };
}
