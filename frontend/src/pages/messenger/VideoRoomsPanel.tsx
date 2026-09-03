import { useState } from "react";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { useNavigate } from "react-router-dom";
import { Video, Plus, Link2, X, Users2, KeyRound, Copy, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useMeetRooms, MeetRoom } from "@/hooks/useMeetRooms";
import { parseJoinInput } from "@/lib/meetJoinInput";

interface VideoRoomsPanelProps {
  onClose: () => void;
}

// Atajo a las reuniones desde Messenger: estás chateando y quieres llamar.
//
// ANTES este panel tenía su propio mecanismo de salas viviendo en el `useState`
// de MessengerPage: se perdían al recargar, no existían para nadie más, y la
// lista renderizaba avatares de una lista siempre vacía con un badge "EN VIVO"
// que no podía encenderse nunca (isActive quedaba en false para siempre). Peor:
// su link era /call/<sala>, que a un invitado sin cuenta lo deja en el login.
//
// Ahora es la MISMA cosa que /meet: reuniones de verdad, con código y sala de
// espera para externos. Este panel es solo la puerta corta.
export default function VideoRoomsPanel({ onClose }: VideoRoomsPanelProps) {
  const navigate = useNavigate();
  const { myRooms, loading, createRoom, joinByCode, resolveByLivekitRoom, endRoom } = useMeetRooms();
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const openCall = (room: MeetRoom) => {
    const params = new URLSearchParams();
    if (room.isHost) params.set("admin", "1");
    params.set("name", room.name);
    const url = `/call/${encodeURIComponent(room.livekit_room_name)}?${params.toString()}`;
    const target = `call-${room.livekit_room_name}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    window.open(url, target, "noopener");
  };

  // El link que se comparte es /entrar/<código>: sirve con cuenta (entra directo)
  // y sin cuenta (pide entrada y espera que alguien la acepte).
  const shareLink = (room: MeetRoom) => `${getPublicBaseUrl()}/entrar/${room.code}`;

  const handleCreate = async () => {
    setCreating(true);
    try {
      const room = await createRoom();
      openCall(room);
      await navigator.clipboard.writeText(shareLink(room)).catch(() => { /* sin portapapeles */ });
      toast.success(`Reunión creada · código ${room.code}`, { description: "Link copiado." });
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

  const handleEnd = async (room: MeetRoom) => {
    if (!window.confirm(`¿Terminar "${room.name}"? El link y el código dejan de funcionar.`)) return;
    try {
      await endRoom(room.id);
      toast.success("Reunión terminada");
    } catch (e: any) {
      toast.error(e.message || "No se pudo terminar la reunión");
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Reuniones</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleCreate} disabled={creating} className="h-auto py-3 flex-col gap-1 rounded-2xl">
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
            <span className="text-xs">Nueva</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById("join-link-input")?.focus()}
            className="h-auto py-3 flex-col gap-1 rounded-2xl"
          >
            <Link2 className="h-5 w-5" />
            <span className="text-xs">Unirse</span>
          </Button>
          <Button variant="secondary" onClick={() => navigate("/cowork")} className="h-auto py-3 flex-col gap-1 rounded-2xl">
            <Users2 className="h-5 w-5" />
            <span className="text-xs">Cowork</span>
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            id="join-link-input"
            placeholder="Código o enlace de la reunión..."
            className="h-9 bg-primary/5 border-0 text-xs rounded-full"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleJoin}
            disabled={!joinInput.trim() || joining}
            className="rounded-full"
            title="Entrar con el código o el link"
          >
            {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Entrar"}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => navigate("/meet")}
          className="text-[11px] text-muted-foreground hover:text-primary transition-colors w-full text-center"
        >
          Ver todas en Meet
        </button>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {!loading && myRooms.length === 0 && (
          <p className="text-xs text-muted-foreground text-center px-2 py-6">
            No tienes reuniones abiertas. Crea una y comparte el link o el código.
          </p>
        )}
        <div className="space-y-3">
          {myRooms.map((room) => (
            <Card key={room.id} className="border-0 rounded-3xl bg-primary/[0.04]">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/15 shrink-0">
                    <Video className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{room.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(room.code);
                        toast.success(`Código copiado: ${room.code}`);
                      }}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                      title="Copiar código"
                    >
                      <KeyRound className="h-2.5 w-2.5" />
                      <span className="font-mono tracking-[0.15em]">{room.code}</span>
                      <Copy className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    title={`Entrar a ${room.name}`}
                    onClick={() => openCall(room)}
                  >
                    Entrar
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Copiar link de invitación"
                    onClick={() => {
                      navigator.clipboard.writeText(shareLink(room));
                      toast.success("Link copiado — sirve con o sin cuenta en Maven");
                    }}
                  >
                    <Link2 className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    title="Terminar reunión"
                    onClick={() => handleEnd(room)}
                  >
                    <PhoneOff className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
