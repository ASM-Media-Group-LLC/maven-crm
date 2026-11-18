import { useState, useEffect } from "react";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LiveKitCallView from "./messenger/videocall/LiveKitCallView";
import { LlamadaEnVentanaFlotante } from "@/components/LlamadaEnVentanaFlotante";
import { docPipSupported } from "@/pages/cowork/usePipWindow";
import PreJoinLobby from "./messenger/videocall/PreJoinLobby";
import { useQuienesEstanEnLaSala } from "@/hooks/useQuienesEstanEnLaSala";
import MeetGuestGate from "./meet/MeetGuestGate";
import InvitarDeAfuera from "./meet/InvitarDeAfuera";
import { salaAdmiteInvitados } from "@/lib/meetLinkInvitado";
import { useRoleTier } from "@/hooks/useRoleTier";
import type { BackgroundEffect } from "./messenger/videocall/BackgroundSelector";
import { Loader2, Maximize2, Minimize2 } from "lucide-react";
import { leerFondoGuardado } from "@/lib/fondoDeLlamada";
import { buscarLlamadaViva, conversacionDeLaSala } from "@/lib/llamadaInvitar";
import { guardarArchivoDeLlamada, guardarMensajeDeLlamada } from "@/lib/chatDeLaLlamada";
import { useInvitadosDeLaLlamada } from "@/hooks/useInvitadosDeLaLlamada";
import AgregarALaLlamada from "./messenger/videocall/AgregarALaLlamada";
import AvisoDeInvitados from "./messenger/videocall/AvisoDeInvitados";
import { useLanguage } from "@/hooks/useLanguage";

export default function VideoCallPage() {
  const { t } = useLanguage();
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdmin = searchParams.get("admin") === "1";
  // Viaja como título de la grabación (se guarda): no se traduce.
  const callDisplayName = searchParams.get("name") || roomName || "Videollamada";
  const { user } = useAuth();
  // Invitar gente de afuera (link directo, sin sala de espera): supervisores y
  // arriba, en un Meet o en una llamada del Messenger (Alvaro, 17/11/2026).
  const { isSupervisorOrAbove } = useRoleTier();
  // Llamadas del Messenger (Alvaro, 18/11/2026): contestar o llamar = entrar
  // ya, sin sala previa; la de voz arranca sin cámara.
  const directo = searchParams.get("directo") === "1";
  const soloAudio = searchParams.get("audio") === "1";
  const esDelMessenger = !!roomName?.startsWith("call-");
  const conversacion = roomName ? conversacionDeLaSala(roomName) : null;
  const [joined, setJoined] = useState(directo);
  const [coworkRedirecting, setCoworkRedirecting] = useState(() => {
    // Synchronously detect cowork rooms to block rendering from the start
    return !!roomName && (roomName.startsWith("cowork_hub_") || roomName.startsWith("cowork_"));
  });
  const [joinOpts, setJoinOpts] = useState<{
    micOn: boolean;
    camOn: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioOutputDeviceId?: string;
    backgroundEffect?: BackgroundEffect;
  }>(() =>
    directo
      ? { micOn: true, camOn: !soloAudio, backgroundEffect: soloAudio ? "none" : leerFondoGuardado() }
      : { micOn: false, camOn: false, backgroundEffect: "none" },
  );
  const invitados = useInvitadosDeLaLlamada(roomName, user?.id, esDelMessenger && joined);
  // Entrar a la sala = contestar. Si llegaste por el aviso del celular o por el
  // link del chat, tu timbre se apaga y la llamada deja de contar como perdida.
  useEffect(() => {
    if (!joined || !esDelMessenger || !roomName || !user?.id) return;
    void (async () => {
      try {
        const viva = await buscarLlamadaViva(roomName);
        if (!viva) return;
        const ahora = new Date().toISOString();
        await (supabase.from("call_participants") as any)
          .update({ status: "accepted", actualizado: ahora })
          .eq("call_id", viva.id).eq("user_id", user.id).in("status", ["ringing", "missed", "declined"]);
        if (viva.call_status === "ringing" && viva.caller_id !== user.id) {
          await (supabase.from("calls") as any)
            .update({ call_status: "accepted", start_time: ahora })
            .eq("id", viva.id).eq("call_status", "ringing");
        }
      } catch { /* contestar es un extra: la llamada sigue igual */ }
    })();
  }, [joined, esDelMessenger, roomName, user?.id]);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  useEffect(() => {
    const alCambiar = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);
  const alternarPantallaCompleta = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Detect cowork rooms and redirect to cowork dashboard
  useEffect(() => {
    if (!roomName) return;
    const isCoworkRoom = roomName.startsWith("cowork_hub_") || roomName.startsWith("cowork_");
    if (!isCoworkRoom) return;

    setCoworkRedirecting(true);
    const resolveAndRedirect = async () => {
      try {
        // Try host hub first
        if (roomName.startsWith("cowork_hub_")) {
          const { data } = await supabase
            .from("cowork_sessions")
            .select("id")
            .eq("host_hub_livekit_room", roomName)
            .eq("status", "active")
            .maybeSingle();
          if (data) {
            navigate(`/cowork?session=${data.id}&role=host`, { replace: true });
            return;
          }
        }
        // Try regular cowork room
        const { data: room } = await supabase
          .from("cowork_rooms")
          .select("session_id")
          .eq("livekit_room_name", roomName)
          .maybeSingle();
        if (room) {
          navigate(`/cowork?session=${room.session_id}`, { replace: true });
          return;
        }
      } catch (e) {
        console.error("Cowork redirect failed:", e);
      }
      // If no match found, allow normal video call rendering
      setCoworkRedirecting(false);
    };
    resolveAndRedirect();
  }, [roomName, navigate]);

  // Link para "Copiar enlace" en salas de Meet: el PÚBLICO (/entrar/<código>),
  // que atiende con y sin cuenta. El interno /call/... exige login y dejaba a
  // los invitados externos mirando la pantalla de login (feedback 21/08).
  // Mientras resuelve (o si falla), se queda el link interno de siempre.
  const { data: meetShareLink } = useQuery({
    queryKey: ["meet-share-link", roomName],
    enabled: !!user?.id && !!roomName?.startsWith("meet_"),
    staleTime: Infinity,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-room`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "resolve", livekitRoom: roomName }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.room?.code) return null;
      return `${getPublicBaseUrl()}/entrar/${json.room.code}`;
    },
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-for-call", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
  });

  // Quién ya está adentro, para la sala de espera. Solo mientras la persona
  // sigue afuera: al entrar lo ve en la llamada misma.
  const quienesEstan = useQuienesEstanEnLaSala(
    roomName,
    !!user && !joined && !coworkRedirecting,
  );

  const handleLeave = () => {
    window.close();
    setTimeout(() => {
      window.location.href = "/messenger";
    }, 300);
  };

  if (!roomName) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p>{t("page.call.noRoom")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p>{t("page.call.signInToJoin")}</p>
      </div>
    );
  }

  // Block rendering while resolving cowork redirect
  if (coworkRedirecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Es el nombre con el que te ven los demás en la llamada: no depende de tu idioma.
  const userName = profile.full_name || "Usuario";

  if (!joined) {
    return (
      <PreJoinLobby
        roomName={roomName}
        displayName={userName}
        callDisplayName={callDisplayName}
        // Si la consulta falla (edge caída, sin red) el bloque no se dibuja:
        // decir "nadie ha llegado" sin saberlo sería mentir.
        quienesEstan={quienesEstan.fallo ? undefined : { personas: quienesEstan.personas, cargando: quienesEstan.cargando }}
        onJoin={(opts) => {
          setJoinOpts(opts);
          setJoined(true);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      {/* La llamada puede salir a la ventana flotante del sistema cuando la
          persona se va a otro programa: esta pestaña es SOLO la llamada, así
          que si se va, deja de verse. La ventana queda siempre al frente. */}
      <LlamadaEnVentanaFlotante activa>
        <LiveKitCallView
          autoPip={!docPipSupported()}
          roomName={roomName}
          displayName={userName}
          callDisplayName={callDisplayName}
          isAdmin={isAdmin}
          onLeave={handleLeave}
          initialMicOn={joinOpts.micOn}
          initialCamOn={joinOpts.camOn}
          initialAudioDeviceId={joinOpts.audioDeviceId}
          initialVideoDeviceId={joinOpts.videoDeviceId}
          initialAudioOutputDeviceId={joinOpts.audioOutputDeviceId}
          initialBackgroundEffect={joinOpts.backgroundEffect}
          // Grabar: reuniones de Meet Y llamadas del chat (`call-`). Se guardan
          // en Grabaciones con la misma lógica; el título (nombre del chat) las
          // distingue. Con botón, como en Meet — no arranca sola.
          recording={
            roomName.startsWith("meet_") || roomName.startsWith("call-")
              ? { source: "meet", title: callDisplayName }
              : undefined
          }
          shareLink={meetShareLink ?? undefined}
          accionesBarra={
            <>
              {esDelMessenger && user && (
                <AgregarALaLlamada
                  roomName={roomName}
                  uid={user.id}
                  tipo={soloAudio ? "audio" : "video"}
                  invitados={invitados.invitados}
                  alInvitar={() => void invitados.recargar()}
                />
              )}
              {isSupervisorOrAbove && salaAdmiteInvitados(roomName) && <InvitarDeAfuera livekitRoom={roomName} />}
              <button
                type="button"
                onClick={alternarPantallaCompleta}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-foreground hover:bg-primary/10"
                title={t(pantallaCompleta ? "messenger.enLlamada.pantallaCompleta.salir" : "messenger.enLlamada.pantallaCompleta.entrar")}
                aria-label={t(pantallaCompleta ? "messenger.enLlamada.pantallaCompleta.salir" : "messenger.enLlamada.pantallaCompleta.entrar")}
              >
                {pantallaCompleta ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </>
          }
          guardarChat={
            esDelMessenger && conversacion && user
              ? {
                  texto: (texto) => { void guardarMensajeDeLlamada(conversacion, user.id, texto); },
                  archivo: (archivo) => { void guardarArchivoDeLlamada(conversacion, user.id, archivo); },
                }
              : undefined
          }
          encima={
            esDelMessenger && user ? (
              <AvisoDeInvitados
                roomName={roomName}
                uid={user.id}
                llamada={invitados.llamada}
                invitados={invitados.invitados}
                alColgar={handleLeave}
                alReintentar={() => void invitados.recargar()}
              />
            ) : undefined
          }
        />
        {/* Sala de espera: si es una reunión de Meet, quien está adentro (con
            cuenta) ve a los invitados sin cuenta que piden entrar y los admite.

            VA ADENTRO DEL ENVOLTORIO a propósito. Si quedara afuera, se dibuja
            en el documento de la pestaña — y justo cuando la llamada sale a la
            ventana flotante, el anfitrión está mirando la ventana y NO la
            pestaña. Un invitado podría golpear y él no ver nada, sin badge, sin
            sonido y sin nada que lo haga volver. El invitado se queda esperando
            contra un cartel que no vence nunca.

            Es un hueco que abre esta misma función: antes no había motivo para
            estar fuera de la pestaña. */}
        {/* Admitir a alguien de afuera es invitarlo: solo supervisores y
            arriba (la edge decideGuest lo exige igual). */}
        {roomName.startsWith("meet_") && isSupervisorOrAbove && <MeetGuestGate livekitRoom={roomName} />}
      </LlamadaEnVentanaFlotante>
    </div>
  );
}
