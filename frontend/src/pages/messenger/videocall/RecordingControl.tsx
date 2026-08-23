import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { RoomEvent } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { invokeRecordings } from "@/hooks/useRecordings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Disc, Loader2, Search, Square } from "lucide-react";
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

interface Perfil { id: string; full_name: string | null }

const claveSesion = (roomName: string) => `maven_rec_${roomName}`;

function leerMiGrabacion(roomName: string): { id: string; t: number } | null {
  try {
    const raw = sessionStorage.getItem(claveSesion(roomName));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
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
        <button
          type="button"
          disabled={busy}
          onClick={() => void start()}
          title="Grabar la reunión"
          className="flex items-center gap-1.5 rounded-full border border-[hsl(220_3%_30%)] bg-[hsl(220_3%_20%/0.9)] px-3 py-1.5 text-xs font-medium text-[hsl(220_3%_75%)] backdrop-blur-sm hover:bg-[hsl(220_3%_26%)] hover:text-white"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Disc className="h-3.5 w-3.5 text-red-400" />}
          {!compact && "Grabar"}
        </button>
      )}

      <StopDialog open={stopOpen} onClose={() => setStopOpen(false)} onConfirm={stop} busy={busy} />
    </>
  );
}

/** Detener = elegir con quién se comparte. Quien grabó queda incluido
 *  siempre (lo agrega la edge); acá se eligen los demás. */
function StopDialog({ open, onClose, onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (recipients: string[]) => void;
  busy: boolean;
}) {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) { setFiltro(""); setElegidos(new Set()); return; }
    let vivo = true;
    setCargando(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (!vivo) return;
      setPerfiles(((data as Perfil[]) ?? []).filter((p) => p.id !== user?.id));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [open]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return perfiles;
    return perfiles.filter((p) => (p.full_name ?? "").toLowerCase().includes(q));
  }, [perfiles, filtro]);

  const toggle = (id: string) => {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detener y compartir</DialogTitle>
          <DialogDescription>
            La grabación queda en <b>Grabaciones</b> para ti y para quienes elijas
            (se les avisa por correo). <b>Se borra a los 90 días, sin excepciones</b> —
            quien la necesite más tiempo tiene que descargarla.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar en el equipo…"
            className="pl-9 rounded-full"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/40">
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : visibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
          ) : (
            visibles.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
              >
                <Checkbox checked={elegidos.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {(p.full_name ?? "?").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                </span>
                <span className="truncate text-sm text-foreground">{p.full_name || "Sin nombre"}</span>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Seguir grabando</Button>
          <Button variant="destructive" onClick={() => onConfirm([...elegidos])} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
            Detener {elegidos.size > 0 ? `y compartir con ${elegidos.size}` : "grabación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
