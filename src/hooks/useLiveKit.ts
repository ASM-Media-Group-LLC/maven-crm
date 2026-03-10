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
  ConnectionQuality,
  RoomOptions,
} from "livekit-client";
import { BackgroundProcessor } from "@livekit/track-processors";
import { supabase } from "@/integrations/supabase/client";
import type { BackgroundEffect } from "@/pages/messenger/videocall/BackgroundSelector";

export type ConnectionQualityLevel = "excellent" | "good" | "poor" | "lost" | "unknown";

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
  connectionQuality: ConnectionQualityLevel;
}

export interface LKChatMessage {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
}

interface DataMessage {
  type: "chat" | "hand" | "reaction" | "moderation";
  payload: any;
}

// ── Audio feedback helper ───────────────────────────────────────
function playTone(frequency: number, duration: number, volume = 0.15) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch {
    // AudioContext not available — fail silently
  }
}

function playJoinSound() {
  playTone(880, 0.15, 0.12);
  setTimeout(() => playTone(1100, 0.12, 0.1), 160);
}

function playLeaveSound() {
  playTone(600, 0.15, 0.1);
  setTimeout(() => playTone(440, 0.18, 0.08), 170);
}

// ── Map livekit ConnectionQuality to our level ───────────────────
function mapConnectionQuality(q: ConnectionQuality): ConnectionQualityLevel {
  switch (q) {
    case ConnectionQuality.Excellent:
      return "excellent";
    case ConnectionQuality.Good:
      return "good";
    case ConnectionQuality.Poor:
      return "poor";
    case ConnectionQuality.Lost:
      return "lost";
    default:
      return "unknown";
  }
}

// ── Production Room configuration ────────────────────────────────
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Video defaults
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
    facingMode: "user",
  },
  // Audio defaults — enable all processing for production quality
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    // Advanced constraints for supported browsers
    channelCount: 1,
    sampleRate: 48000,
  },
  // Publish defaults
  publishDefaults: {
    audioBitrate: 32_000,        // 32kbps — clear voice
    dtx: true,                   // Discontinuous Transmission — saves bandwidth when silent
    red: true,                   // Redundant Audio Data — recovery from packet loss
    simulcast: true,             // Simulcast for adaptive quality
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
    ],
  },
  // Reconnect up to 7 times with backoff
  reconnectPolicy: {
    maxRetries: 7,
    nextRetryDelayInMs: (context) => {
      // Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, ... capped at 10s
      return Math.min(300 * Math.pow(2, context.retryCount), 10_000);
    },
  },
  disconnectOnPageLeave: true,
};

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
  const [isReconnecting, setIsReconnecting] = useState(false);
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
      connectionQuality: mapConnectionQuality(p.connectionQuality),
    };
  }, []);

  // ── Debounced participant refresh ──────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshParticipants(), 50);
  }, [refreshParticipants]);

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(async (roomName: string, participantName: string, isAdmin = false) => {
    try {
      setError(null);
      setConnectionState(ConnectionState.Connecting);

      const { data, error: fnErr } = await supabase.functions.invoke("livekit-token", {
        body: { roomName, participantName, isAdmin },
      });

      if (fnErr || !data?.token) {
        throw new Error(fnErr?.message || data?.error || "Failed to get token");
      }

      const livekitUrl = data.url;
      if (!livekitUrl || typeof livekitUrl !== "string" || (!livekitUrl.startsWith("wss://") && !livekitUrl.startsWith("ws://"))) {
        throw new Error(`Invalid LiveKit URL: "${livekitUrl}". Ensure LIVEKIT_URL is configured.`);
      }

      const room = new Room(ROOM_OPTIONS);
      roomRef.current = room;

      // ── Wire events ──────────────────────────────────────────
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        setConnectionState(state);
      });

      room.on(RoomEvent.Reconnecting, () => {
        setIsReconnecting(true);
        console.info("[LiveKit] Reconnecting...");
      });

      room.on(RoomEvent.Reconnected, () => {
        setIsReconnecting(false);
        console.info("[LiveKit] Reconnected successfully");
        refreshParticipants();
      });

      // Participant & track events
      room.on(RoomEvent.ParticipantConnected, (p) => {
        playJoinSound();
        debouncedRefresh();
      });
      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        playLeaveSound();
        debouncedRefresh();
      });
      room.on(RoomEvent.TrackSubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackUnsubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackMuted, debouncedRefresh);
      room.on(RoomEvent.TrackUnmuted, debouncedRefresh);
      room.on(RoomEvent.LocalTrackPublished, debouncedRefresh);
      room.on(RoomEvent.LocalTrackUnpublished, debouncedRefresh);

      // Connection quality
      room.on(RoomEvent.ConnectionQualityChanged, debouncedRefresh);

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (speakers.length > 0) {
          setActiveSpeaker(speakers[0].identity);
        }
        debouncedRefresh();
      });

      // ── Handle autoplay policy (resume audio context) ────────
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          // Audio blocked by browser — try to resume on next user click
          const resumeAudio = () => {
            room.startAudio().then(() => {
              console.info("[LiveKit] Audio playback resumed");
              document.removeEventListener("click", resumeAudio);
              document.removeEventListener("touchstart", resumeAudio);
            });
          };
          document.addEventListener("click", resumeAudio, { once: false });
          document.addEventListener("touchstart", resumeAudio, { once: false });
        }
      });

      // ── Data messages ────────────────────────────────────────
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
          } else if (msg.type === "moderation" && msg.payload?.action === "mute" && msg.payload?.target === room.localParticipant.identity) {
            // Respond to remote mute request
            room.localParticipant.setMicrophoneEnabled(false);
            setIsMicOn(false);
            refreshParticipants();
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, () => {
        setConnectionState(ConnectionState.Disconnected);
        setIsReconnecting(false);
        setParticipants([]);
      });

      // ── Connect & publish tracks ────────────────────────────
      await room.connect(livekitUrl, data.token);
      await room.localParticipant.enableCameraAndMicrophone();

      // Try to start audio context immediately (for browsers that allow it)
      room.startAudio().catch(() => {});

      setIsMicOn(true);
      setIsCamOn(true);
      playJoinSound();
      refreshParticipants();
    } catch (err: any) {
      setError(err.message || "Connection failed");
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
    }
  }, [refreshParticipants, debouncedRefresh]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (bgProcessorRef.current) {
      try {
        bgProcessorRef.current = null;
      } catch {}
    }
    roomRef.current?.disconnect();
    roomRef.current = null;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsReconnecting(false);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, []);

  // ── Mic toggle ────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newState = !isMicOn;
      await room.localParticipant.setMicrophoneEnabled(newState);
      setIsMicOn(newState);
      debouncedRefresh();
    } catch (err) {
      console.error("Mic toggle error:", err);
      // If mic fails (permission denied, device unavailable), keep state in sync
      const actualMicOn = room.localParticipant.isMicrophoneEnabled;
      setIsMicOn(actualMicOn);
    }
  }, [isMicOn, debouncedRefresh]);

  // ── Camera toggle ─────────────────────────────────────────────
  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newState = !isCamOn;
      await room.localParticipant.setCameraEnabled(newState);
      setIsCamOn(newState);
      debouncedRefresh();
    } catch (err) {
      console.error("Camera toggle error:", err);
      const actualCamOn = room.localParticipant.isCameraEnabled;
      setIsCamOn(actualCamOn);
    }
  }, [isCamOn, debouncedRefresh]);

  // ── Screen share ──────────────────────────────────────────────
  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
      debouncedRefresh();
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }, [isScreenSharing, debouncedRefresh]);

  // ── Hand raise ────────────────────────────────────────────────
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
    debouncedRefresh();
  }, [isHandRaised, debouncedRefresh]);

  // ── Reactions ─────────────────────────────────────────────────
  const sendReaction = useCallback((emoji: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg: DataMessage = { type: "reaction", payload: { emoji } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
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

  // ── Chat ──────────────────────────────────────────────────────
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

  // ── Moderation ────────────────────────────────────────────────
  const muteParticipant = useCallback(async (identity: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg: DataMessage = { type: "moderation", payload: { action: "mute", target: identity } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
  }, []);

  const removeParticipant = useCallback(async (identity: string) => {
    const room = roomRef.current;
    if (!room) return;
    const msg: DataMessage = { type: "moderation", payload: { action: "remove", target: identity } };
    room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify(msg)),
      { reliable: true }
    );
  }, []);

  const getRoom = useCallback(() => roomRef.current, []);

  // ── Background effect ─────────────────────────────────────────
  const setBackgroundEffect = useCallback(async (effect: BackgroundEffect) => {
    const room = roomRef.current;
    if (!room) return;

    const camTrack = Array.from(room.localParticipant.videoTrackPublications.values())
      .find((t) => t.source === Track.Source.Camera)?.track;

    if (!camTrack) return;

    try {
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

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
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
    isReconnecting,
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
