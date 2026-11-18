// Banco de pruebas: la llamada del Messenger, tipo Skype (18/11/2026).
// /harness.html?ver=llamada[&estado=llamando|grupo|entrante|en-curso][&tipo=audio][&tema=claro]
// Sin sesión ni LiveKit: la barra de arriba, la pantalla de «Llamando a…» y el
// cartel de llamada entrante se pintan con datos armados. La de «Llamando a…»
// hace sonar el tono de espera (tocar la página una vez si el navegador no deja).
import { Mic, MicOff, PhoneOff, Video, Monitor, MessageSquare, Users } from "lucide-react";
import CallTopBar from "@/pages/messenger/videocall/CallTopBar";
import AvisoDeInvitados from "@/pages/messenger/videocall/AvisoDeInvitados";
import IncomingCallModal from "@/pages/messenger/components/IncomingCallModal";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";
import type { LlamadaViva } from "@/lib/llamadaInvitar";
import type { Call } from "@/hooks/useVideoCall";

const YO = "yo";

export function BancoLlamada({ estado, tipo }: { estado: string; tipo: string }) {
  const audio = tipo === "audio";
  const llamada = { id: "c1", room_id: "call-banco", call_status: "ringing", call_type: audio ? "audio" : "video" } as unknown as LlamadaViva;
  const invitados: Invitado[] =
    estado === "grupo"
      ? [
          { user_id: YO, nombre: "Alvaro Stephan Mejía", status: "accepted" },
          { user_id: "a", nombre: "Daniel Ospina", status: "ringing" },
          { user_id: "b", nombre: "Vanessa Giraldo", status: "ringing" },
          { user_id: "c", nombre: "Breyner Garzon", status: "ringing" },
        ]
      : estado === "en-curso"
        ? [
            { user_id: YO, nombre: "Alvaro Stephan Mejía", status: "accepted" },
            { user_id: "a", nombre: "Daniel Ospina", status: "accepted" },
          ]
        : [
            { user_id: YO, nombre: "Alvaro Stephan Mejía", status: "accepted" },
            { user_id: "a", nombre: "Daniel Ospina", status: "ringing" },
          ];
  const entrante = {
    id: "c2", caller_id: "x", receiver_id: YO, call_status: "ringing", room_id: "call-banco",
    start_time: null, end_time: null, caller_name: "Daniel Ospina", conversation_id: null,
    call_type: audio ? "audio" : "video", is_group: false,
  } as Call;

  return (
    <div className="fondo-glass relative flex h-dvh w-full flex-col overflow-hidden text-foreground">
      <CallTopBar
        roomName="Daniel Ospina"
        participantCount={estado === "en-curso" ? 2 : 1}
        onOpenAdjustView={() => {}}
        shareLink=""
        hideShareLink
        esLlamada
        acciones={
          <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 px-3 text-xs">
            <Users className="h-3.5 w-3.5" /> Agregar
          </button>
        }
      />
      {/* El escenario: la cámara de uno mismo, como queda mientras suena. */}
      <div className="relative flex-1 min-h-0 p-3">
        <div className="tile-estudio flex h-full items-center justify-center rounded-2xl text-sm text-muted-foreground">
          {estado === "en-curso" ? "Daniel Ospina" : "Tú"}
        </div>
      </div>
      <div className="flex shrink-0 justify-center gap-3 pb-5">
        {[audio ? MicOff : Mic, Video, Monitor, MessageSquare].map((Icono, i) => (
          <span key={i} className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card/60"><Icono className="h-4 w-4" /></span>
        ))}
        <span className="flex h-11 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><PhoneOff className="h-4 w-4" /></span>
      </div>
      {estado === "entrante" ? (
        <IncomingCallModal call={entrante} onAccept={() => {}} onDecline={() => {}} />
      ) : (
        <AvisoDeInvitados roomName="call-banco" uid={YO} llamada={llamada} invitados={invitados} alColgar={() => {}} alReintentar={() => {}} />
      )}
    </div>
  );
}
