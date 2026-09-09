import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { invokeRecordings } from "@/hooks/useRecordings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Control de grabación DENTRO de la llamada.
//
// Dos modos:
//   · canControl (miembros de Maven): botón Grabar / Detener. Detener abre el
//     selector de destinatarios — la grabación se comparte al parar, no antes.
//   · pasivo (invitados sin cuenta): solo el punto rojo. Que TODOS los de la
//     sala vean que se está grabando no es cortesía, es la parte honesta del
//     feature — LiveKit marca la sala como "recording" cuando el egress entra,
//     así que la señal llega sola a cada cliente, sin backend nuestro.
//
// El id de la grabación que YO inicié vive en sessionStorage (sobrevive el
// F5 de la pestaña de la llamada). Para detener una que inició OTRO, la edge
// acepta room_name y resuelve la activa — el RLS no me deja ver esa fila.

interface Props {
  room: Room | null;
  roomName: string;
  source: "meet" | "cowork";
  title?: string;
  canControl: boolean;
  compact?: boolean;
}

const claveSesion = (roomName: string) => `maven_rec_${roomName}`;

export function leerMiGrabacion(roomName: string): { id: string; t: number } | null {
  try {
    const raw = sessionStorage.getItem(claveSesion(roomName));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Parar la grabación propia al irse (botón Salir o cerrar la pestaña). Va
 *  con `keepalive` para que el navegador termine el POST aunque la página ya
 *  se esté descargando; `invokeRecordings` normal moriría con la pestaña. */
export async function detenerAlSalir(roomName: string, recordingId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    sessionStorage.removeItem(claveSesion(roomName));
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recordings`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "stop", recording_id: recordingId, room_name: roomName, recipients: [] }),
    });
  } catch { /* el barrido del servidor la cierra igual a los 5 min */ }
}

export default function RecordingControl({ room, roomName, source, title, canControl, compact }: Props) {
  const [isRecording, setIsRecording] = useState<boolean>(() => room?.isRecording ?? false);
  const [busy, setBusy] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const miGrabacionRef = useRef(leerMiGrabacion(roomName));

  // Señal de "grabando" desde LiveKit: llega a todos los participantes.
  useEffect(() => {
    if (!room) return;
    setIsRecording(room.isRecording);
    const onChange = () => setIsRecording(room.isRecording);
    room.on(RoomEvent.RecordingStatusChanged, onChange);
    return () => { room.off(RoomEvent.RecordingStatusChanged, onChange); };
  }, [room]);

  // Cronómetro solo si la inicié yo (soy el único que sabe CUÁNDO arrancó).
  // Cerrar la pestaña con la grabación propia andando también la para.
  // `pagehide` corre en escritorio y en el teléfono (beforeunload no siempre).
  useEffect(() => {
    const alIrse = () => {
      const mia = miGrabacionRef.current;
      if (!mia || !isRecording) return;
      void detenerAlSalir(roomName, mia.id);
    };
    window.addEventListener("pagehide", alIrse);
    return () => window.removeEventListener("pagehide", alIrse);
  }, [isRecording, roomName]);

  useEffect(() => {
    if (!isRecording || !miGrabacionRef.current) { setElapsed(null); return; }
    const t0 = miGrabacionRef.current.t;
    setElapsed(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const start = useCallback(async () => {
    setBusy(true);
    try {
      const res = await invokeRecordings("start", { room_name: roomName, source, title });
      const id = res.recording_id as string;
      miGrabacionRef.current = { id, t: Date.now() };
      sessionStorage.setItem(claveSesion(roomName), JSON.stringify(miGrabacionRef.current));
      setIsRecording(true); // la señal de LiveKit tarda unos segundos; el punto rojo no
      toast.success("Grabando la reunión", {
        description: "Toda la sala ve el punto rojo. Al detener eliges con quién compartirla.",
      });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo iniciar la grabación");
    } finally {
      setBusy(false);
    }
  }, [roomName, source, title]);

  const stop = useCallback(async (recipients: string[]) => {
    setBusy(true);
    try {
      const res = await invokeRecordings("stop", {
        recording_id: miGrabacionRef.current?.id,
        room_name: roomName,
        recipients,
      });
      sessionStorage.removeItem(claveSesion(roomName));
      miGrabacionRef.current = null;
      setStopOpen(false);
      // Optimista: LiveKit tarda unos segundos en apagar la marca de la sala
      // y mientras tanto el pill seguia en REC con el cronometro corriendo.
      setIsRecording(false);
      const emails = (res.emails as number) ?? 0;
      toast.success("Grabación guardada", {
        description: emails > 0
          ? `Quedó en Grabaciones y se avisó por correo a ${emails} ${emails === 1 ? "persona" : "personas"}.`
          : "Quedó en Grabaciones (Maven → Grabaciones).",
      });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo detener la grabación");
    } finally {
      setBusy(false);
    }
  }, [roomName]);

  if (!isRecording && !canControl) return null;

  const mmss = elapsed !== null
    ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
    : null;

  return (
    <>
      {isRecording ? (
        <button
          type="button"
          disabled={!canControl || busy}
          onClick={() => canControl && setStopOpen(true)}
          title={canControl ? "Detener grabación" : "Esta reunión se está grabando"}
          className={cn(
            "flex items-center gap-2 rounded-full border border-red-500/40 bg-[hsl(0_60%_22%/0.92)] px-3 py-1.5 text-xs font-semibold text-red-100 backdrop-blur-sm shadow-lg",
            canControl && "hover:bg-[hsl(0_60%_28%/0.95)] cursor-pointer",
          )}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          REC{mmss && !compact ? ` ${mmss}` : ""}
          {canControl && !compact && (
            <span className="flex items-center gap-1 border-l border-red-300/30 pl-2 text-red-200/90">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
              Detener
            </span>
          )}
        </button>
      ) : (
        // Este botón FLOTA SOBRE EL VIDEO, y debajo puede haber cualquier cosa:
        // un mosaico apagado, la cara de alguien con buena luz o una pantalla
        // compartida en blanco. Antes era `bg-[hsl(220_3%_20%/0.9)]`, un gris
        // casi negro y encima translúcido — o sea, el mismo color que el
        // mosaico. Desaparecía, y en modo compacto perdía hasta la palabra.
        //
        // Ahora: fondo OPACO (no translúcido, para no adoptar el color de
        // atrás), borde rojo —que es como se dice "grabar" en todos lados— y
        // un halo negro exterior que lo despega también de un fondo claro.
        //
        // CONTORNO, no relleno: el estado "grabando" es una pastilla roja
        // LLENA con el punto latiendo. Si este fuera rojo lleno también, alguien
        // entraría a una reunión, lo vería rojo y creería que ya se está
        // grabando. Esa confusión es el error más caro que puede tener este
        // botón, y la diferencia contorno/relleno es lo que la evita.
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          title="Grabar la reunión"
          className="flex items-center gap-2 rounded-full border-[1.5px] border-red-500 bg-[hsl(240_5%_9%)] px-3 py-1.5 text-xs font-semibold text-red-200 shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_2px_10px_rgba(0,0,0,0.5)] hover:border-red-400 hover:bg-[hsl(0_50%_16%)] hover:text-white disabled:opacity-70"
        >
          {busy
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
          Grabar
        </button>
      )}

      <StopDialog open={stopOpen} onClose={() => setStopOpen(false)} onConfirm={stop} busy={busy} />
    </>
  );
}

/** Detener. Antes acá se elegía con quién compartir; eso vive ahora en
 *  Grabaciones (botón Compartir, con chips), así que parar es solo parar
 *  (Jhon, 09/09/2026). `onConfirm([])`: la edge deja a quien grabó como
 *  destinatario igual. */
function StopDialog({ open, onClose, onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (recipients: string[]) => void;
  busy: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Detener la grabación</DialogTitle>
          <DialogDescription>
            Queda guardada en <b>Grabaciones</b>; desde ahí la puedes compartir con
            quien quieras. <b>Se borra a los 90 días, sin excepciones</b>: quien la
            necesite más tiempo tiene que descargarla.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Seguir grabando</Button>
          <Button variant="destructive" onClick={() => onConfirm([])} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
            Detener grabación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
