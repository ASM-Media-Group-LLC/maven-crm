import { useState, useCallback, useRef, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  Participant,
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

interface ConnectOptions {
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
  audioOutputDeviceId?: string;
  backgroundEffect?: BackgroundEffect;
}

function getDeviceConstraint(deviceId?: string) {
  return deviceId ? ({ deviceId: { ideal: deviceId } } as any) : undefined;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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
    dtx: true,                   // Discontinuous Transmission — saves bandwidth when silent
    red: true,                   // Redundant Audio Data — recovery from packet loss
    simulcast: true,             // Simulcast for adaptive quality
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
    ],
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
  const preferredDevicesRef = useRef<{
    audioDeviceId?: string;
    videoDeviceId?: string;
    audioOutputDeviceId?: string;
  }>({});
  const backgroundEffectRef = useRef<BackgroundEffect>("none");
  const bgApplyOpRef = useRef(0);

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

    const localParticipant = p as any;
    const micMuted = isLocal
      ? (typeof localParticipant.isMicrophoneEnabled === "boolean" ? !localParticipant.isMicrophoneEnabled : (audioTrack ? audioTrack.isMuted : true))
      : (audioTrack ? audioTrack.isMuted || !audioTrack.isSubscribed : true);
    const camOff = isLocal
      ? (typeof localParticipant.isCameraEnabled === "boolean" ? !localParticipant.isCameraEnabled : (videoTrack ? videoTrack.isMuted : true))
      : (videoTrack ? videoTrack.isMuted || !videoTrack.isSubscribed : true);

    return {
      sid: p.sid,
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMuted: micMuted,
      isCameraOff: camOff,
      isScreenSharing: !!screenTrack && !screenTrack.isMuted,
      isLocal,
      handRaised: handRaisedMap.current[p.identity] || false,
      reactions: [],
      connectionQuality: mapConnectionQuality(p.connectionQuality),
    };
  }, []);

  // ── Debounced participant refresh ──────────────────────────────
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSyncInterval = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const participantMap = new Map<string, LKParticipant>();
    const local = buildParticipant(room.localParticipant, true);
    participantMap.set(local.identity || local.sid || "local", local);

    room.remoteParticipants.forEach((p) => {
      const remote = buildParticipant(p, false);
      const key = remote.identity || remote.sid;
      if (key) participantMap.set(key, remote);
    });

    setParticipants(Array.from(participantMap.values()));
  }, [buildParticipant]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshParticipants(), 50);
  }, [refreshParticipants]);

  const camToggleInFlightRef = useRef(false);

  const hasActiveCameraPublication = useCallback((room: Room) => {
    const cameraPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (publication) => publication.source === Track.Source.Camera,
    );

    return !!cameraPublication?.track && !cameraPublication.isMuted;
  }, []);

  const waitForCameraPublication = useCallback(
    async (room: Room, delays: number[]) => {
      let isCameraReady = hasActiveCameraPublication(room);

      for (const delayMs of delays) {
        if (isCameraReady) break;
        await wait(delayMs);
        isCameraReady = hasActiveCameraPublication(room);
        refreshParticipants();
      }

      return isCameraReady;
    },
    [hasActiveCameraPublication, refreshParticipants],
  );

  const disposeBackgroundProcessor = useCallback(async () => {
    bgApplyOpRef.current += 1;
    const processor = bgProcessorRef.current;
    bgProcessorRef.current = null;

    if (processor?.destroy) {
      try {
        await processor.destroy();
      } catch {
        // no-op
      }
    }
  }, []);

  const enableCameraWithRecovery = useCallback(
    async (room: Room, preferredVideoDeviceId?: string) => {
      // Attempt 1: with preferred device (uses "ideal" so it gracefully falls back)
      try {
        await room.localParticipant.setCameraEnabled(true, getDeviceConstraint(preferredVideoDeviceId));
        const isReady = await waitForCameraPublication(room, [150, 250, 400, 600]);
        if (isReady) {
          refreshParticipants();
          return true;
        }
      } catch (err) {
        console.warn("[LiveKit] Camera enable attempt 1 failed:", err);
      }

      // Attempt 2: hard reset camera + processor, then enable using browser default
      try {
        await disposeBackgroundProcessor();
        await room.localParticipant.setCameraEnabled(false);
        await wait(180);
        await room.localParticipant.setCameraEnabled(true);
        const isReady = await waitForCameraPublication(room, [200, 350, 500]);
        if (isReady) {
          refreshParticipants();
          return true;
        }
      } catch (err) {
        console.warn("[LiveKit] Camera enable attempt 2 failed:", err);
      }

      // All attempts failed
      try { await room.localParticipant.setCameraEnabled(false); } catch {}
      setIsCamOn(false);
      refreshParticipants();
      return false;
    },
    [refreshParticipants, waitForCameraPublication, disposeBackgroundProcessor],
  );

  const applyBackgroundEffectToCurrentCamera = useCallback(async (effect: BackgroundEffect) => {
    const room = roomRef.current;
    if (!room) return false;

    const opId = ++bgApplyOpRef.current;
    const camTrack = Array.from(room.localParticipant.videoTrackPublications.values())
      .find((publication) => publication.source === Track.Source.Camera)?.track as any;

    if (!camTrack) {
      if (effect === "none") {
        await disposeBackgroundProcessor();
        return true;
      }
      return false;
    }

    try {
      let processor = bgProcessorRef.current;
      if (!processor) {
        processor = BackgroundProcessor({ mode: "disabled" });
        bgProcessorRef.current = processor;
      }

      try {
        await camTrack.setProcessor(processor);
      } catch {
        if (opId !== bgApplyOpRef.current) return false;
        try { await processor?.destroy?.(); } catch {}
        processor = BackgroundProcessor({ mode: "disabled" });
        bgProcessorRef.current = processor;
        await camTrack.setProcessor(processor);
      }

      if (opId !== bgApplyOpRef.current) return false;

      if (effect === "none") {
        await processor.switchTo({ mode: "disabled" });
      } else if (effect === "soft-blur") {
        await processor.switchTo({ mode: "background-blur", blurRadius: 10 });
      } else if (effect === "hard-blur") {
        await processor.switchTo({ mode: "background-blur", blurRadius: 25 });
      } else {
        const { BACKGROUND_TEMPLATES } = await import("@/pages/messenger/videocall/BackgroundSelector");
        const selectedTemplate = BACKGROUND_TEMPLATES.find((template) => template.id === effect);
        if (selectedTemplate) {
          await processor.switchTo({
            mode: "virtual-background",
            imagePath: `${window.location.origin}${selectedTemplate.src}`,
          });
        }
      }

      return true;
    } catch (err) {
      console.error("Background processor error:", err);
      return false;
    }
  }, [disposeBackgroundProcessor]);

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(async (
    roomName: string,
    participantName: string,
    isAdmin = false,
    options: ConnectOptions = {},
  ) => {
    try {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      clearSyncInterval();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      preferredDevicesRef.current = {
        audioDeviceId: options.audioDeviceId,
        videoDeviceId: options.videoDeviceId,
        audioOutputDeviceId: options.audioOutputDeviceId,
      };
      backgroundEffectRef.current = options.backgroundEffect || "none";

      setError(null);
      setConnectionState(ConnectionState.Connecting);
      setParticipants([]);
      setChatMessages([]);
      setIsScreenSharing(false);
      setIsHandRaised(false);
      setActiveSpeaker(null);
      handRaisedMap.current = {};

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
        console.info("[LiveKit] Participant connected:", p.identity, p.name);
        playJoinSound();
        refreshParticipants();
      });
      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        console.info("[LiveKit] Participant disconnected:", p.identity, p.name);
        playLeaveSound();
        refreshParticipants();
      });
      room.on(RoomEvent.TrackSubscribed, (_track, _pub, participant) => {
        console.info("[LiveKit] Track subscribed from:", participant.identity);
        debouncedRefresh();
      });
      room.on(RoomEvent.TrackUnsubscribed, debouncedRefresh);
      room.on(RoomEvent.TrackPublished, (_pub, participant) => {
        console.info("[LiveKit] Track published by:", participant.identity);
        debouncedRefresh();
      });
      room.on(RoomEvent.TrackMuted, debouncedRefresh);
      room.on(RoomEvent.TrackUnmuted, debouncedRefresh);
      room.on(RoomEvent.LocalTrackPublished, debouncedRefresh);
      room.on(RoomEvent.LocalTrackUnpublished, debouncedRefresh);

      // Connection quality
      room.on(RoomEvent.ConnectionQualityChanged, debouncedRefresh);

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeaker(speakers.length > 0 ? speakers[0].identity : null);
        debouncedRefresh();
      });

      // ── Handle autoplay policy (resume audio context) ────────
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!room.canPlaybackAudio) {
          // Audio blocked by browser — try to resume on next user click
          const resumeAudio = () => {
            room.startAudio().then(() => {
              console.info("[LiveKit] Audio playback resumed");
              // Re-play all audio elements that may have been blocked
              document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
                if (el.paused && el.srcObject) {
                  el.play().catch(() => {});
                }
              });
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
          } else if (msg.type === "moderation" && msg.payload?.action === "remove" && msg.payload?.target === room.localParticipant.identity) {
            setError("Has sido removido de la llamada por un moderador");
            room.disconnect();
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, () => {
        clearSyncInterval();
        void disposeBackgroundProcessor();
        setConnectionState(ConnectionState.Disconnected);
        setIsReconnecting(false);
        setParticipants([]);
        setActiveSpeaker(null);
      });

      // ── Connect & publish tracks ────────────────────────────
      await room.connect(livekitUrl, data.token);
      console.info("[LiveKit] Connected to room:", roomName, "as", room.localParticipant.identity);
      console.info("[LiveKit] Remote participants already in room:", room.remoteParticipants.size);

      const shouldEnableMic = options.initialMicOn ?? true;
      const shouldEnableCam = options.initialCamOn ?? true;

      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);

      if (shouldEnableMic) {
        await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(options.audioDeviceId));
      }

      if (shouldEnableCam) {
        const cameraEnabled = await enableCameraWithRecovery(room, options.videoDeviceId);

        if (cameraEnabled && backgroundEffectRef.current !== "none") {
          for (const delayMs of [120, 240, 420]) {
            await wait(delayMs);
            const applied = await applyBackgroundEffectToCurrentCamera(backgroundEffectRef.current);
            if (applied) break;
          }
        }
      }

      // Try to start audio context immediately (for browsers that allow it)
      room.startAudio().catch(() => {});

      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      setIsCamOn(hasActiveCameraPublication(room));
      playJoinSound();
      refreshParticipants();

      clearSyncInterval();
      syncIntervalRef.current = setInterval(() => {
        refreshParticipants();
      }, 1500);
    } catch (err: any) {
      clearSyncInterval();
      setError(err.message || "Connection failed");
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
    }
  }, [refreshParticipants, debouncedRefresh, clearSyncInterval, applyBackgroundEffectToCurrentCamera, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearSyncInterval();
    void disposeBackgroundProcessor();
    roomRef.current?.disconnect();
    roomRef.current = null;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsReconnecting(false);
    setActiveSpeaker(null);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, [clearSyncInterval, disposeBackgroundProcessor]);

  // ── Mic toggle ────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const shouldEnable = !room.localParticipant.isMicrophoneEnabled;
      await room.localParticipant.setMicrophoneEnabled(
        shouldEnable,
        shouldEnable ? getDeviceConstraint(preferredDevicesRef.current.audioDeviceId) : undefined,
      );
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 180);
    } catch (err) {
      console.error("Mic toggle error:", err);
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    }
  }, [refreshParticipants]);

  // ── Camera toggle ─────────────────────────────────────────────
  const toggleCam = useCallback(async () => {
    const room = roomRef.current;
    if (!room || camToggleInFlightRef.current) return;

    camToggleInFlightRef.current = true;

    try {
      const currentlyEnabled = hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled;

      if (!currentlyEnabled) {
        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);
        if (cameraEnabled && backgroundEffectRef.current !== "none") {
          // Small delay so the track is fully ready before applying processor
          await wait(100);
          await applyBackgroundEffectToCurrentCamera(backgroundEffectRef.current);
        }
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }

      await wait(80);
      const camActive = hasActiveCameraPublication(room);
      setIsCamOn(camActive);
      refreshParticipants();
      // Single delayed refresh to catch late track state changes
      setTimeout(() => refreshParticipants(), 400);
    } catch (err) {
      console.error("[LiveKit] Camera toggle error:", err);
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } finally {
      camToggleInFlightRef.current = false;
    }
  }, [refreshParticipants, hasActiveCameraPublication, applyBackgroundEffectToCurrentCamera, enableCameraWithRecovery]);

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
    backgroundEffectRef.current = effect;
    await applyBackgroundEffectToCurrentCamera(effect);
  }, [applyBackgroundEffectToCurrentCamera]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearSyncInterval();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      roomRef.current?.disconnect();
    };
  }, [clearSyncInterval]);

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
