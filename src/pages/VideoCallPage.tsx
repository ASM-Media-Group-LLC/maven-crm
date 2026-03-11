import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LiveKitCallView from "./messenger/videocall/LiveKitCallView";
import PreJoinLobby from "./messenger/videocall/PreJoinLobby";
import type { BackgroundEffect } from "./messenger/videocall/BackgroundSelector";
import { Loader2 } from "lucide-react";

export default function VideoCallPage() {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get("admin") === "1";
  const callDisplayName = searchParams.get("name") || roomName || "Videollamada";
  const { user } = useAuth();
  const [joined, setJoined] = useState(false);
  const [joinOpts, setJoinOpts] = useState<{
    micOn: boolean;
    camOn: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioOutputDeviceId?: string;
    backgroundEffect?: BackgroundEffect;
  }>({ micOn: true, camOn: true, backgroundEffect: "none" });

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
    </div>
  );
}
