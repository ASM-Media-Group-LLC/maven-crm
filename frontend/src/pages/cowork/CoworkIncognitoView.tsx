import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { VenetianMask, Volume2, VolumeX, Loader2, ArrowLeft } from "lucide-react";
import CoworkRoomMonitor from "./CoworkRoomMonitor";
import type { useCoworkSession, AdminSessionRow } from "@/hooks/useCoworkSession";

// MODO INCÓGNITO (solo admin): mirar y escuchar las salas de una sesión SIN
// existir para nadie — sin membresía (no aparece en el tablero del host), como
// observador hidden de LiveKit (no aparece en la lista de participantes) y sin
// poder publicar nada (el token no lo permite, no es solo UI).
//
// Reutiliza CoworkRoomMonitor tal cual: el wrapper de issueToken ignora el
// purpose que pide el monitor y siempre canjea "incognito_room" — el edge es
// quien garantiza hidden + subscribe-only + rol admin.
interface Props {
  sessionId: string;
  cowork: ReturnType<typeof useCoworkSession>;
  onExit: () => void;
}

export default function CoworkIncognitoView({ sessionId, cowork, onExit }: Props) {
  const [sesion, setSesion] = useState<AdminSessionRow | null>(null);
  const [cargando, setCargando] = useState(true);
  // Audio POR SALA, apagado por defecto: entrar y que exploten nueve salas de
  // audio a la vez no es espiar, es un susto.
  const [escuchando, setEscuchando] = useState<Record<string, boolean>>({});

  // MEMOIZADO a propósito: el efecto de conexión de cada CoworkRoomMonitor
  // depende de esta función. Como arrow inline se recreaba en cada render
  // (p.ej. al togglear el 🔊 de UNA sala) y TODAS las salas se desconectaban
  // y reconectaban — el video se cortaba en todas y volvía. El purpose que
  // pide el monitor se ignora: incógnito canjea SIEMPRE el token oculto de
  // solo-lectura.
  const issueIncognitoToken = useCallback(
    (_purpose: string, rid?: string) => cowork.issueLiveKitToken("incognito_room", rid),
    [cowork.issueLiveKitToken],
  );

  // Las salas salen de adminListSessions, no de cowork.rooms: sin membresía la
  // RLS no deja leer cowork_rooms, y justamente NO queremos membresía.
  useEffect(() => {
    let alive = true;
    setCargando(true);
    cowork.adminListSessions()
      .then((all) => { if (alive) setSesion(all.find((s) => s.id === sessionId) ?? null); })
      .catch(() => { if (alive) setSesion(null); })
      .finally(() => { if (alive) setCargando(false); });
    return () => { alive = false; };
  }, [sessionId, cowork.adminListSessions]);

  // Latido admin-a-admin: mientras esta vista está montada, los OTROS admins
  // ven "de incógnito: <nombre>" en su lista. Ping cada 60s; al desmontar se
  // borra; si la pestaña muere sin desmontar, el edge lo deja caducar (150s).
  useEffect(() => {
    void cowork.incognitoPing(sessionId).catch(() => { /* sin latido, sin drama */ });
    const t = setInterval(() => { void cowork.incognitoPing(sessionId).catch(() => { /* idem */ }); }, 60_000);
    return () => {
      clearInterval(t);
      void cowork.incognitoLeave(sessionId).catch(() => { /* caduca solo */ });
    };
  }, [sessionId, cowork.incognitoPing, cowork.incognitoLeave]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center flex-1 min-h-0">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sesion) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">No se pudo cargar la sesión (¿sigue activa? ¿eres admin?).</p>
        <Button variant="secondary" className="rounded-full" onClick={onExit}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Barra de estado: que el ADMIN nunca dude en qué modo está. */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-violet-500/10 border-b border-violet-500/20">
        <VenetianMask className="h-5 w-5 text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-foreground">{sesion.name}</span>
          <span className="text-xs text-muted-foreground"> · Modo incógnito — nadie te ve ni te escucha (solo otro admin sabe que estás acá)</span>
          {sesion.incognito.length > 0 && (
            <span className="block text-xs text-violet-500 truncate">
              🕶 También de incógnito: {sesion.incognito.join(", ")}
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" className="rounded-full gap-1" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" /> Salir
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-4">
        {(() => {
          // El Supervisor Hub también se espía: es donde hablan los coordinadores.
          // No es una fila de cowork_rooms — el edge acepta roomId="hub" y resuelve
          // la sala LiveKit del hub de la sesión.
          const espiables = [
            { id: "hub", name: "🎧 Supervisor Hub", online: sesion.hubOnline },
            ...sesion.rooms,
          ];
          return (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
            {espiables.map((room) => {
              const oyendo = !!escuchando[room.id];
              return (
                <div key={room.id} className={`flex flex-col rounded-2xl border bg-card overflow-hidden ${room.id === "hub" ? "border-amber-500/40" : "border-border"}`}>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className={`font-medium text-sm truncate flex-1 ${room.id === "hub" ? "text-amber-500" : "text-foreground"}`}>{room.name}</span>
                    {room.online != null && (
                      <span className={`text-[11px] ${room.online > 0 ? "text-success font-medium" : "text-muted-foreground"}`}>
                        {room.online} en línea
                      </span>
                    )}
                    <Button
                      variant={oyendo ? "default" : "ghost"}
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      title={oyendo ? "Dejar de escuchar esta sala" : "Escuchar esta sala"}
                      onClick={() => setEscuchando((m) => ({ ...m, [room.id]: !m[room.id] }))}
                    >
                      {oyendo ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="aspect-video bg-black/90">
                    <CoworkRoomMonitor
                      roomId={room.id}
                      roomName={room.name}
                      issueToken={issueIncognitoToken}
                      showVideo
                      hearOn={oyendo}
                      broadcastOn={false}
                      micBaseTrack={null}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>
    </div>
  );
}
