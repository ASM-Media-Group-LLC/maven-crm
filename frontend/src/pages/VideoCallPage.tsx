import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LiveKitCallView from "./messenger/videocall/LiveKitCallView";
import PreJoinLobby from "./messenger/videocall/PreJoinLobby";
import MeetGuestGate from "./meet/MeetGuestGate";
import type { BackgroundEffect } from "./messenger/videocall/BackgroundSelector";
import { Loader2 } from "lucide-react";

export default function VideoCallPage() {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAdmin = searchParams.get("admin") === "1";
  const callDisplayName = searchParams.get("name") || roomName || "Videollamada";
  const { user } = useAuth();
  const [joined, setJoined] = useState(false);
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
  }>({ micOn: false, camOn: false, backgroundEffect: "none" });

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

  const handleLeave = () => {
    window.close();
    setTimeout(() => {
      window.location.href = "/messenger";
    }, 300);
  };

  if (!roomName) {
    return (
      <div className="h-screen flex items-center justify-center bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)]">
        <p>Sala no especificada</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)]">
        <p>Debes iniciar sesión para unirte a una llamada</p>
      </div>
    );
  }

  // Block rendering while resolving cowork redirect
  if (coworkRedirecting) {
    return (
      <div className="h-screen flex items-center justify-center bg-[hsl(240_10%_6%)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading || !profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-[hsl(240_10%_6%)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const userName = profile.full_name || "Usuario";

  if (!joined) {
    return (
      <PreJoinLobby
        roomName={roomName}
        displayName={userName}
        callDisplayName={callDisplayName}
        onJoin={(opts) => {
          setJoinOpts(opts);
          setJoined(true);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <LiveKitCallView
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
      />
      {/* Sala de espera: si es una reunión de Meet, quien está adentro (con cuenta)
          ve a los invitados sin cuenta que piden entrar y los admite. */}
      {roomName.startsWith("meet_") && <MeetGuestGate livekitRoom={roomName} />}
    </div>
  );
}
