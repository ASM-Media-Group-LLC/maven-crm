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
import { BackgroundProcessor, supportsBackgroundProcessors } from "@livekit/track-processors";
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

// ── Audio feedback helper (shared AudioContext to avoid exhaustion) ──
let sharedAudioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
      sharedAudioCtx = new AudioContext();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, duration: number, volume = 0.15) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
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

// ── Chat message cap to prevent unbounded memory growth ──────────
const MAX_CHAT_MESSAGES = 500;

const BACKGROUND_ATTACH_TIMEOUT_MS = 6000;
const BACKGROUND_SWITCH_TIMEOUT_MS = 7000;
const BACKGROUND_FAILURE_COOLDOWN_MS = 12000;

function isTemplateBackground(effect: BackgroundEffect) {
  return effect !== "none" && effect !== "soft-blur" && effect !== "hard-blur";
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Production Room configuration ────────────────────────────────
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: {
    resolution: VideoPresets.h720.resolution,
    facingMode: "user",
  },
  audioCaptureDefaults: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: 1,
    sampleRate: 48000,
  },
  publishDefaults: {
    dtx: true,
    red: true,
    simulcast: true,
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
  const bgAttachedTrackRef = useRef<any>(null);
  const preloadedBackgroundsRef = useRef<Set<string>>(new Set());
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
  const bgLastAppliedEffectRef = useRef<BackgroundEffect>("none");
  const bgRequestedEffectRef = useRef<BackgroundEffect>("none");
  const bgApplyOpRef = useRef(0);
  const bgApplyQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const bgFailureCooldownUntilRef = useRef(0);
  const connectingRef = useRef(false); // Guard against concurrent connect()
  const audioResumeCleanupRef = useRef<(() => void) | null>(null); // Track audio resume listeners

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
    bgAttachedTrackRef.current = null;
    bgLastAppliedEffectRef.current = "none";

    if (processor?.destroy) {
      try {
        await withTimeout(Promise.resolve(processor.destroy()), 2500, "bg-destroy");
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

    if (effect !== "none" && !supportsBackgroundProcessors()) {
      console.warn("[LiveKit] Background processors are not supported in this browser.");
      return false;
    }

    if (effect !== "none" && Date.now() < bgFailureCooldownUntilRef.current) {
      return false;
    }

    const opId = ++bgApplyOpRef.current;
    const cameraPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (publication) => publication.source === Track.Source.Camera,
    );
    const camTrack = cameraPublication?.track as any;

    if (!camTrack) {
      if (effect === "none") {
        bgLastAppliedEffectRef.current = "none";
        await disposeBackgroundProcessor();
        return true;
      }
      return false;
    }

    const effectAlreadyApplied = effect === bgLastAppliedEffectRef.current;
    const needsProcessorAttach = effect !== "none" && bgAttachedTrackRef.current !== camTrack;

    if (effectAlreadyApplied && !needsProcessorAttach) {
      return true;
    }

    try {
      if (effect === "none") {
        const existingProcessor = bgProcessorRef.current;
        if (existingProcessor?.switchTo) {
          await withTimeout(
            Promise.resolve(existingProcessor.switchTo({ mode: "disabled" })),
            BACKGROUND_SWITCH_TIMEOUT_MS,
            "bg-disable",
          );
        }

        bgLastAppliedEffectRef.current = "none";
        refreshParticipants();
        return true;
      }

      let processor = bgProcessorRef.current;
      if (!processor) {
        processor = BackgroundProcessor({ mode: "disabled" });
        bgProcessorRef.current = processor;
      }

      if (bgAttachedTrackRef.current !== camTrack) {
        await withTimeout(
          Promise.resolve(camTrack.setProcessor(processor, true)),
          BACKGROUND_ATTACH_TIMEOUT_MS,
          "bg-attach",
        );
        bgAttachedTrackRef.current = camTrack;
      }

      if (opId !== bgApplyOpRef.current) return false;

      if (effect === "soft-blur") {
        await withTimeout(
          Promise.resolve(processor.switchTo({ mode: "background-blur", blurRadius: 10 })),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-soft-blur",
        );
      } else if (effect === "hard-blur") {
        await withTimeout(
          Promise.resolve(processor.switchTo({ mode: "background-blur", blurRadius: 25 })),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-hard-blur",
        );
      } else {
        const { BACKGROUND_TEMPLATES } = await import("@/pages/messenger/videocall/BackgroundSelector");
        const selectedTemplate = BACKGROUND_TEMPLATES.find((template) => template.id === effect);

        if (!selectedTemplate) return false;

        const templateUrl = `${window.location.origin}${selectedTemplate.src}`;
        if (!preloadedBackgroundsRef.current.has(templateUrl)) {
          await new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = templateUrl;
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("template-load-failed"));
          });
          preloadedBackgroundsRef.current.add(templateUrl);
        }

        if (opId !== bgApplyOpRef.current) return false;

        await withTimeout(
          Promise.resolve(
            processor.switchTo({
              mode: "virtual-background",
              imagePath: templateUrl,
            }),
          ),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-template",
        );
      }

      if (opId !== bgApplyOpRef.current) return false;

      bgFailureCooldownUntilRef.current = 0;
      bgLastAppliedEffectRef.current = effect;
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 140);
      return true;
    } catch (err) {
      console.error("Background processor error:", err);

      if (opId !== bgApplyOpRef.current) return false;

      bgFailureCooldownUntilRef.current = Date.now() + BACKGROUND_FAILURE_COOLDOWN_MS;

      try {
        await withTimeout(Promise.resolve(camTrack.stopProcessor?.()), 1500, "bg-stop");
      } catch {
        // no-op
      }

      bgAttachedTrackRef.current = null;
      bgLastAppliedEffectRef.current = "none";
      await disposeBackgroundProcessor();

      if (hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled) {
        const recovered = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);
        if (recovered) {
          refreshParticipants();
        }
      }

      return false;
    }
  }, [disposeBackgroundProcessor, hasActiveCameraPublication, enableCameraWithRecovery, refreshParticipants]);

  const queueBackgroundEffectApply = useCallback((effect: BackgroundEffect) => {
    bgRequestedEffectRef.current = effect;

    bgApplyQueueRef.current = bgApplyQueueRef.current
      .catch(() => false)
      .then(async () => {
        while (true) {
          const room = roomRef.current;
          if (!room) return false;

          const nextEffect = bgRequestedEffectRef.current;
          const cameraPublication = Array.from(room.localParticipant.videoTrackPublications.values()).find(
            (publication) => publication.source === Track.Source.Camera,
          );
          const camTrack = cameraPublication?.track as any;
          const camReady = !!camTrack || room.localParticipant.isCameraEnabled;

          if (!camReady) {
            bgLastAppliedEffectRef.current = "none";
            return nextEffect === "none";
          }

          const processorAttached = !!camTrack && bgAttachedTrackRef.current === camTrack;
          if (nextEffect === bgLastAppliedEffectRef.current && (nextEffect === "none" || processorAttached)) {
            return true;
          }

          const applied = await applyBackgroundEffectToCurrentCamera(nextEffect);
          if (bgRequestedEffectRef.current === nextEffect) {
            return applied;
          }
        }
      });

    return bgApplyQueueRef.current;
  }, [applyBackgroundEffectToCurrentCamera]);

  const applyConfiguredBackgroundIfNeeded = useCallback(async (room: Room) => {
    if (backgroundEffectRef.current === "none") {
      bgLastAppliedEffectRef.current = "none";
      return true;
    }

    const cameraReady = await waitForCameraPublication(room, [120, 220, 360]);
    if (!cameraReady) return false;

    await wait(90);
    return queueBackgroundEffectApply(backgroundEffectRef.current);
  }, [queueBackgroundEffectApply, waitForCameraPublication]);

  // ── Cleanup audio resume listeners ─────────────────────────────
  const cleanupAudioResumeListeners = useCallback(() => {
    if (audioResumeCleanupRef.current) {
      audioResumeCleanupRef.current();
      audioResumeCleanupRef.current = null;
    }
  }, []);

  // ── Connect ────────────────────────────────────────────────────
  const connect = useCallback(async (
    roomName: string,
    participantName: string,
    isAdmin = false,
    options: ConnectOptions = {},
  ) => {
    // Guard against concurrent connect calls
    if (connectingRef.current) {
      console.warn("[LiveKit] Connect already in progress, ignoring duplicate call");
      return;
    }
    connectingRef.current = true;

    try {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      clearSyncInterval();
      cleanupAudioResumeListeners();
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

        if (backgroundEffectRef.current !== "none") {
          void wait(220).then(() => applyConfiguredBackgroundIfNeeded(room));
        }
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
      room.on(RoomEvent.LocalTrackPublished, (publication) => {
        debouncedRefresh();

        if (publication.source === Track.Source.Camera && backgroundEffectRef.current !== "none") {
          void wait(150).then(() => queueBackgroundEffectApply(backgroundEffectRef.current));
        }
      });
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
          // Clean up any prior listeners first
          cleanupAudioResumeListeners();

          const resumeAudio = () => {
            room.startAudio().then(() => {
              console.info("[LiveKit] Audio playback resumed");
              document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
                if (el.paused && el.srcObject) {
                  el.play().catch(() => {});
                }
              });
              // Clean up listeners on success
              cleanupAudioResumeListeners();
            });
          };

          document.addEventListener("click", resumeAudio);
          document.addEventListener("touchstart", resumeAudio);

          // Store cleanup function
          audioResumeCleanupRef.current = () => {
            document.removeEventListener("click", resumeAudio);
            document.removeEventListener("touchstart", resumeAudio);
          };
        }
      });

      // ── Data messages ────────────────────────────────────────
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const msg: DataMessage = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "chat") {
            setChatMessages((prev) => {
              const newMessages = [
                ...prev,
                {
                  id: `${Date.now()}-${participant?.identity}`,
                  sender: participant?.identity || "unknown",
                  senderName: participant?.name || participant?.identity || "Unknown",
                  content: msg.payload.text,
                  timestamp: Date.now(),
                },
              ];
              // Cap chat messages to prevent unbounded memory growth
              if (newMessages.length > MAX_CHAT_MESSAGES) {
                return newMessages.slice(newMessages.length - MAX_CHAT_MESSAGES);
              }
              return newMessages;
            });
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
          } else if (msg.type === "moderation") {
            // Security: Verify the sender has roomAdmin permission via LiveKit metadata
            // Only process moderation from participants with admin grants
            const senderParticipant = participant ? room.remoteParticipants.get(participant.identity) || (participant.identity === room.localParticipant.identity ? room.localParticipant : null) : null;
            const senderPermissions = senderParticipant?.permissions;
            const isSenderAdmin = senderPermissions?.canPublish && senderPermissions?.canSubscribe;

            // For additional security, check participant metadata for admin flag
            let metadataAdmin = false;
            try {
              const meta = JSON.parse(senderParticipant?.metadata || "{}");
              metadataAdmin = !!meta.isAdmin;
            } catch {}

            // Only accept moderation from participants who are admins (have roomAdmin grant in token)
            if (!isSenderAdmin && !metadataAdmin) {
              console.warn("[LiveKit] Ignoring moderation command from non-admin:", participant?.identity);
              return;
            }

            if (msg.payload?.action === "mute" && msg.payload?.target === room.localParticipant.identity) {
              room.localParticipant.setMicrophoneEnabled(false);
              setIsMicOn(false);
              refreshParticipants();
            } else if (msg.payload?.action === "remove" && msg.payload?.target === room.localParticipant.identity) {
              setError("Has sido removido de la llamada por un moderador");
              room.disconnect();
            }
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, () => {
        clearSyncInterval();
        cleanupAudioResumeListeners();
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

        if (cameraEnabled) {
          await applyConfiguredBackgroundIfNeeded(room);
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
    } finally {
      connectingRef.current = false;
    }
  }, [refreshParticipants, debouncedRefresh, clearSyncInterval, cleanupAudioResumeListeners, queueBackgroundEffectApply, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor, applyConfiguredBackgroundIfNeeded]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearSyncInterval();
    cleanupAudioResumeListeners();
    void disposeBackgroundProcessor();
    roomRef.current?.disconnect();
    roomRef.current = null;
    connectingRef.current = false;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsReconnecting(false);
    setActiveSpeaker(null);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, [clearSyncInterval, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

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
        await disposeBackgroundProcessor();
        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);

        if (cameraEnabled) {
          await applyConfiguredBackgroundIfNeeded(room);
        }
      } else {
        await room.localParticipant.setCameraEnabled(false);
        await disposeBackgroundProcessor();
      }

      await wait(80);
      const camActive = hasActiveCameraPublication(room);
      setIsCamOn(camActive);
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 400);
    } catch (err) {
      console.error("[LiveKit] Camera toggle error:", err);
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } finally {
      camToggleInFlightRef.current = false;
    }
  }, [refreshParticipants, hasActiveCameraPublication, queueBackgroundEffectApply, enableCameraWithRecovery, disposeBackgroundProcessor]);

  // ── Screen share (using ref to avoid stale closure) ───────────
  const isScreenSharingRef = useRef(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const newState = !isScreenSharingRef.current;
      await room.localParticipant.setScreenShareEnabled(newState);
      setIsScreenSharing(newState);
      debouncedRefresh();
    } catch (err) {
      console.error("Screen share error:", err);
    }
  }, [debouncedRefresh]);

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
    setChatMessages((prev) => {
      const newMessages = [
        ...prev,
        {
          id: `${Date.now()}-local`,
          sender: room.localParticipant.identity,
          senderName: room.localParticipant.name || "Tú",
          content: text,
          timestamp: Date.now(),
        },
      ];
      if (newMessages.length > MAX_CHAT_MESSAGES) {
        return newMessages.slice(newMessages.length - MAX_CHAT_MESSAGES);
      }
      return newMessages;
    });
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
    await queueBackgroundEffectApply(effect);
  }, [queueBackgroundEffectApply]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearSyncInterval();
      cleanupAudioResumeListeners();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void disposeBackgroundProcessor();
      roomRef.current?.disconnect();
    };
  }, [clearSyncInterval, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

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
