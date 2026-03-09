import { useState, useCallback, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalParticipant,
  RemoteTrackPublication,
  LocalTrackPublication,
  ConnectionState,
  DataPacket_Kind,
  Participant,
  ParticipantEvent,
  createLocalTracks,
  VideoPresets,
} from "livekit-client";
import { BackgroundProcessor } from "@livekit/track-processors";
import { supabase } from "@/integrations/supabase/client";
import type { BackgroundEffect } from "@/pages/messenger/videocall/BackgroundSelector";

export interface LKParticipant {
  sid: string;
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing: boolean;
  isLocal: boolean;
  handRaised: boolean;
  reactions: string[];
}

export interface LKChatMessage {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface DataMessage {
  type: "chat" | "hand" | "reaction";
  payload: any;
}

export function useLiveKit() {
  const roomRef = useRef<Room | null>(null);
  const bgProcessorRef = useRef<any>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<LKParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<LKChatMessage[]>([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handRaisedMap = useRef<Record<string, boolean>>({});

  const buildParticipant = useCallback((p: Participant, isLocal: boolean): LKParticipant => {
    const audioTrack = Array.from(p.audioTrackPublications.values()).find(
      (t) => t.source === Track.Source.Microphone
    );
    const videoTrack = Array.from(p.videoTrackPublications.values()).find(
      (t) => t.source === Track.Source.Camera
    );
    const screenTrack = Array.from(p.videoTrackPublications.values()).find(
      (t) => t.source === Track.Source.ScreenShare
    );

    return {
      sid: p.sid,
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMuted: audioTrack ? audioTrack.isMuted || !audioTrack.isSubscribed : true,
      isCameraOff: videoTrack ? videoTrack.isMuted || !videoTrack.isSubscribed : true,
      isScreenSharing: !!screenTrack && !screenTrack.isMuted,
      isLocal,
      handRaised: handRaisedMap.current[p.identity] || false,
      reactions: [],
    };
  }, []);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const list: LKParticipant[] = [];
    list.push(buildParticipant(room.localParticipant, true));
    room.remoteParticipants.forEach((p) => {
      list.push(buildParticipant(p, false));
    });
    setParticipants(list);
  }, [buildParticipant]);

  const connect = useCallback(async (roomName: string, participantName: string, isAdmin = false) => {
    try {
      setError(null);
      setConnectionState(ConnectionState.Connecting);

      const { data, error: fnErr } = await supabase.functions.invoke("livekit-token", {
        body: { roomName, participantName, isAdmin },
      });

      console.log("LiveKit token response:", { data, fnErr });

      if (fnErr || !data?.token) {
        throw new Error(fnErr?.message || data?.error || "Failed to get token");
      }

      const livekitUrl = data.url;
      if (!livekitUrl || typeof livekitUrl !== "string" || (!livekitUrl.startsWith("wss://") && !livekitUrl.startsWith("ws://"))) {
        throw new Error(`Invalid LiveKit URL received: "${livekitUrl}". Ensure the LIVEKIT_URL secret is set correctly (e.g., wss://your-livekit-server.com)`);
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: VideoPresets.h720.resolution,
        },
      });

      roomRef.current = room;

      // Wire up events
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
      });

      // Use debounced refresh to avoid rapid re-renders causing flickering
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedRefresh = () => {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => refreshParticipants(), 50);
      };

      room.on(RoomEvent.ParticipantConnected, debouncedRefresh);
      room.on(RoomEvent.ParticipantDisconnected, debouncedRefresh);
      room.on(RoomEvent.TrackSubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackUnsubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackMuted, debouncedRefresh);
      room.on(RoomEvent.TrackUnmuted, debouncedRefresh);
      room.on(RoomEvent.LocalTrackPublished, debouncedRefresh);
      room.on(RoomEvent.LocalTrackUnpublished, debouncedRefresh);

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (speakers.length > 0) {
          setActiveSpeaker(speakers[0].identity);
        }
        refreshParticipants();
      });

      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const msg: DataMessage = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "chat") {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${participant?.identity}`,
                sender: participant?.identity || "unknown",
                senderName: participant?.name || participant?.identity || "Unknown",
                content: msg.payload.text,
                timestamp: Date.now(),
              },
            ]);
          } else if (msg.type === "hand") {
            handRaisedMap.current[participant?.identity || ""] = msg.payload.raised;
            refreshParticipants();
          } else if (msg.type === "reaction") {
            // Briefly show reaction
            setParticipants((prev) =>
              prev.map((p) =>
                p.identity === participant?.identity
                  ? { ...p, reactions: [...p.reactions, msg.payload.emoji] }
                  : p
              )
            );
            setTimeout(() => {
              setParticipants((prev) =>
                prev.map((p) =>
                  p.identity === participant?.identity
                    ? { ...p, reactions: p.reactions.slice(1) }
                    : p
                )
              );
            }, 3000);
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, () => {
        setConnectionState(ConnectionState.Disconnected);
        setParticipants([]);
      });

      await room.connect(livekitUrl, data.token);
      await room.localParticipant.enableCameraAndMicrophone();

      setIsMicOn(true);
      setIsCamOn(true);
      refreshParticipants();
    } catch (err: any) {
      setError(err.message || "Connection failed");
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
    }
  }, [refreshParticipants]);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, []);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!isMicOn);
    setIsMicOn(!isMicOn);
    refreshParticipants();
  }, [isMicOn, refreshParticipants]);

  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!isCamOn);
    setIsCamOn(!isCamOn);
    refreshParticipants();
  }, [isCamOn, refreshParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
      refreshParticipants();
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }, [isScreenSharing, refreshParticipants]);

  const toggleHand = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    handRaisedMap.current[room.localParticipant.identity] = newState;
    const msg: DataMessage = { type: "hand", payload: { raised: newState } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    refreshParticipants();
  }, [isHandRaised, refreshParticipants]);

  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg: DataMessage = { type: "reaction", payload: { emoji } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    // Show locally
    setParticipants((prev) =>
      prev.map((p) =>
        p.isLocal ? { ...p, reactions: [...p.reactions, emoji] } : p
      )
    );
    setTimeout(() => {
      setParticipants((prev) =>
        prev.map((p) =>
          p.isLocal ? { ...p, reactions: p.reactions.slice(1) } : p
        )
      );
    }, 3000);
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || !text.trim()) return;
    const msg: DataMessage = { type: "chat", payload: { text } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-local`,
        sender: room.localParticipant.identity,
        senderName: room.localParticipant.name || "Tú",
        content: text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const muteParticipant = useCallback(async (identity: string) => {
    // Room admin can request mute via data channel
    const room = roomRef.current;
    if (!room) return;
    // For moderator actions, LiveKit server API is typically used
    // Here we send a data message requesting the user to mute
    const msg = { type: "moderation", payload: { action: "mute", target: identity } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
  }, []);

  const removeParticipant = useCallback(async (identity: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg = { type: "moderation", payload: { action: "remove", target: identity } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
  }, []);

  // Get the Room object for attaching video/audio elements
  const getRoom = useCallback(() => roomRef.current, []);

  // Background effect using LiveKit track processors (ML-based segmentation)
  // Uses a single persistent processor with switchTo() to avoid flickering
  const setBackgroundEffect = useCallback(async (effect: BackgroundEffect) => {
    const room = roomRef.current;
    if (!room) return;

    const camTrack = Array.from(room.localParticipant.videoTrackPublications.values())
      .find((t) => t.source === Track.Source.Camera)?.track;

    if (!camTrack) return;

    try {
      // If no processor exists yet, create one in disabled mode and attach it
      if (!bgProcessorRef.current) {
        const processor = BackgroundProcessor({ mode: "disabled" });
        await camTrack.setProcessor(processor);
        bgProcessorRef.current = processor;
      }

      const processor = bgProcessorRef.current;

      if (effect === "none") {
        await processor.switchTo({ mode: "disabled" });
      } else if (effect === "soft-blur") {
        await processor.switchTo({ mode: "background-blur", blurRadius: 10 });
      } else if (effect === "hard-blur") {
        await processor.switchTo({ mode: "background-blur", blurRadius: 25 });
      } else {
        // Template image
        const { BACKGROUND_TEMPLATES } = await import("@/pages/messenger/videocall/BackgroundSelector");
        const tpl = BACKGROUND_TEMPLATES.find((t) => t.id === effect);
        if (tpl) {
          const imagePath = `${window.location.origin}${tpl.src}`;
          await processor.switchTo({ mode: "virtual-background", imagePath });
        }
      }
    } catch (err) {
      console.error("Background processor error:", err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  return {
    connectionState,
    participants,
    chatMessages,
    isMicOn,
    isCamOn,
    isScreenSharing,
    isHandRaised,
    activeSpeaker,
    error,
    connect,
    disconnect,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    toggleHand,
    sendReaction,
    sendChatMessage,
    muteParticipant,
    removeParticipant,
    getRoom,
    setBackgroundEffect,
  };
}
