import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Plus, KeyRound, Loader2, Copy, Link2, PhoneOff, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useMeetRooms, MeetRoom } from "@/hooks/useMeetRooms";
import { usePermissions } from "@/hooks/usePermissions";
import { isCompleteRoomCode } from "@/lib/coworkRoomCode";
import { parseJoinInput } from "@/lib/meetJoinInput";

// El link que se COMPARTE es /entrar/<código>, no /call/<sala>: esa página manda
// a la llamada a quien tiene cuenta en Maven y le pide entrada a quien no la
// tiene (sala de espera). Un link a /call/ directo dejaría al invitado externo
// mirando la pantalla de login.
function shareLink(room: MeetRoom) {
  return `${window.location.origin}/entrar/${room.code}`;
}

// La llamada vive en /call/:roomName (VideoCallPage + livekit-token), igual que
// cualquier otra videollamada de Maven. Se abre en pestaña aparte para que quien
// está en la reunión pueda seguir usando el CRM sin cortar el audio.
function openCall(room: MeetRoom) {
  const params = new URLSearchParams();
  if (room.isHost) params.set("admin", "1");
  params.set("name", room.name);
  const url = `/call/${encodeURIComponent(room.livekit_room_name)}?${params.toString()}`;
  const target = `call-${room.livekit_room_name}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  window.open(url, target, "noopener");
}

export default function MeetPage() {
  const { myRooms, loading, createRoom, joinByCode, resolveByLivekitRoom, endRoom } = useMeetRooms();
  const { explicitPermission } = usePermissions();
  const [creating, setCreating] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joining, setJoining] = useState(false);

  // Crear una reunión lo puede hacer cualquiera; un admin puede quitar el permiso
  // por rol desde Administración → Roles y acá se respeta (misma precedencia que
  // aplica la edge: fila explícita ?? default, que para Meet es "todos").
  const canCreate = explicitPermission("Meet", "Crear reunión") ?? true;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const room = await createRoom();
      openCall(room);
      await navigator.clipboard
        .writeText(shareLink(room))
        .catch(() => { /* sin permiso de portapapeles: el link igual está en la lista */ });
      toast.success(`Reunión creada · código ${room.code}`, {
        description: "Link copiado. Compartilo con quien quieras que entre.",
      });
    } catch (e: any) {
      toast.error(e.message || "No se pudo crear la reunión");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    const parsed = parseJoinInput(joinInput);
    if (!parsed.code && !parsed.livekitRoom) return;
    setJoining(true);
    try {
      const room = parsed.livekitRoom
        ? await resolveByLivekitRoom(parsed.livekitRoom)
        : await joinByCode(parsed.code!);
      setJoinInput("");
      openCall(room);
    } catch (e: any) {
      toast.error(e.message || "No se pudo entrar a la reunión");
    } finally {
      setJoining(false);
    }
  };

  const copyLink = (room: MeetRoom) => {
    navigator.clipboard.writeText(shareLink(room));
    toast.success("Link copiado — sirve con o sin cuenta en Maven");
  };

  const copyCode = (room: MeetRoom) => {
    navigator.clipboard.writeText(room.code);
    toast.success(`Código copiado: ${room.code}`);
  };

  const handleEnd = async (room: MeetRoom) => {
    if (!window.confirm(`¿Terminar "${room.name}"? El link y el código dejan de funcionar.`)) return;
    try {
      await endRoom(room.id);
      toast.success("Reunión terminada");
    } catch (e: any) {
      toast.error(e.message || "No se pudo terminar la reunión");
    }
  };

  const joinDisabled = joining || (() => {
    const parsed = parseJoinInput(joinInput);
    return !parsed.livekitRoom && !isCompleteRoomCode(parsed.code || "");
  })();

  return (
    <div className="flex flex-col items-center min-h-screen gap-6 p-4 md:p-6 pt-10 md:pt-16">
      <div className="w-full max-w-lg flex flex-col items-center gap-4 bg-primary/5 rounded-3xl px-6 md:px-10 py-10 md:py-12">
        <div className="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10">
          <Video className="h-8 w-8 md:h-10 md:w-10 text-primary" />
        </div>
        <h1 className="text-xl md:text-3xl font-bold text-foreground tracking-tight text-center">
          Meet
        </h1>
        <p className="text-muted-foreground text-center text-sm md:text-base max-w-sm">
          Crea una reunión, comparte el link o el código, y quien lo tenga entra.
        </p>

        {canCreate && (
          <Button onClick={handleCreate} disabled={creating} size="lg" className="gap-2 rounded-full px-8 mt-2 shadow-md">
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            Nueva reunión
          </Button>
        )}

        <div className="w-full max-w-sm flex flex-col gap-2 mt-3 pt-4 border-t border-border/40">
          <span className="text-xs text-muted-foreground text-center">
            Entrar con un link o un código
          </span>
          <div className="flex gap-2">
            <Input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !joinDisabled && handleJoin()}
              placeholder="ABC234 o pega el link"
              className="rounded-full"
            />
            <Button onClick={handleJoin} disabled={joinDisabled} className="rounded-full gap-1 shrink-0">
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Entrar
            </Button>
          </div>
        </div>
      </div>

      {!loading && myRooms.length > 0 && (
        <div className="w-full max-w-lg flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Tus reuniones abiertas
          </h2>
          {myRooms.map((room) => (
            <div key={room.id} className="flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0">
                <Video className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{room.name}</div>
                <button
                  type="button"
                  onClick={() => copyCode(room)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                  title="Copiar código"
                >
                  <KeyRound className="h-3 w-3" />
                  <span className="font-mono tracking-[0.2em]">{room.code}</span>
                  <Copy className="h-2.5 w-2.5 opacity-60" />
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                title="Copiar link"
                onClick={() => copyLink(room)}
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
                title="Terminar reunión"
                onClick={() => handleEnd(room)}
              >
                <PhoneOff className="h-4 w-4" />
              </Button>
              <Button size="sm" className="rounded-full gap-1 shrink-0" onClick={() => openCall(room)}>
                Entrar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
