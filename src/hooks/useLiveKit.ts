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

const BACKGROUND_ATTACH_TIMEOUT_MS = 10000;
const BACKGROUND_SWITCH_TIMEOUT_MS = 12000;
const BACKGROUND_FAILURE_COOLDOWN_MS = 15000;

function isTemplateBackground(effect: BackgroundEffect) {
  return effect !== "none" && effect !== "blur";
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
    resolution: VideoPresets.h1080.resolution,
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
      VideoPresets.h720,
    ],
    videoCodec: "vp9",
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
  const [unreadChatCount, setUnreadChatCount] = useState(0);
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

    if (!processor) return; // Fast path: nothing to dispose

    if (processor.destroy) {
      try {
        await withTimeout(Promise.resolve(processor.destroy()), 1500, "bg-destroy");
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
        const isReady = await waitForCameraPublication(room, [80, 150, 300]);
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
        await wait(80);
        await room.localParticipant.setCameraEnabled(true);
        const isReady = await waitForCameraPublication(room, [100, 200, 400]);
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

      if (effect === "blur") {
        await withTimeout(
          Promise.resolve(processor.switchTo({ mode: "background-blur", blurRadius: 20 })),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-blur",
        );
      } else if (isTemplateBackground(effect)) {
        const { BACKGROUND_TEMPLATES } = await import("@/pages/messenger/videocall/BackgroundSelector");
        const selectedTemplate = BACKGROUND_TEMPLATES.find((template) => template.id === effect);

        if (!selectedTemplate) return false;

        // Use low-res image for the ML processor (480px is enough for segmentation)
        const processorUrl = `${window.location.origin}${selectedTemplate.lowSrc || selectedTemplate.src}`;
        if (!preloadedBackgroundsRef.current.has(processorUrl)) {
          await new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = processorUrl;
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("template-load-failed"));
          });
          preloadedBackgroundsRef.current.add(processorUrl);
        }

        if (opId !== bgApplyOpRef.current) return false;

        await withTimeout(
          Promise.resolve(
            processor.switchTo({
              mode: "virtual-background",
              imagePath: processorUrl,
            }),
          ),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-template",
        );
      } else {
        return false;
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

      // Clean up processor from the track
      try {
        await withTimeout(Promise.resolve(camTrack.stopProcessor?.()), 1200, "bg-stop");
      } catch {
        // no-op
      }

      bgAttachedTrackRef.current = null;
      bgLastAppliedEffectRef.current = "none";
      await disposeBackgroundProcessor();

      // Brief wait for GPU/ML pipeline release
      await wait(150);

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

    // Fast-check: if track is already available, skip polling entirely
    const hasTrack = Array.from(room.localParticipant.videoTrackPublications.values()).some(
      (p) => p.source === Track.Source.Camera && p.track,
    );
    if (!hasTrack) {
      // Brief wait with tight intervals — camera should be ready almost immediately
      const cameraReady = await waitForCameraPublication(room, [40, 80, 150]);
      if (!cameraReady) return false;
    }

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

        // Force audio re-kick after reconnection
        room.startAudio().then(() => {
          document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
            if (el.srcObject) {
              el.play().catch(() => {});
            }
          });
        }).catch(() => {});

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
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        console.info("[LiveKit] Track subscribed from:", participant.identity, "kind:", track.kind);
        debouncedRefresh();

        // Force audio playback for newly subscribed audio tracks
        if (track.kind === "audio") {
          room.startAudio().catch(() => {});
          // Kick all audio elements to play after a brief delay
          setTimeout(() => {
            document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
              if (el.paused && el.srcObject) {
                el.play().catch(() => {});
              }
            });
          }, 200);
        }
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
            setUnreadChatCount((c) => c + 1);
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
            }, 15000);
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

      // Aggressively start audio context and ensure all audio elements play
      room.startAudio().then(() => {
        console.info("[LiveKit] Audio context started successfully");
        // Kick all existing audio elements
        document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
          if (el.paused && el.srcObject) {
            el.play().catch(() => {});
          }
        });
      }).catch(() => {});

      // Second attempt after a delay (catches late track subscriptions)
      setTimeout(() => {
        room.startAudio().catch(() => {});
        document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
          if (el.paused && el.srcObject) {
            el.play().catch(() => {});
          }
        });
      }, 1500);

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
        // Optimistic UI: show cam on immediately
        setIsCamOn(true);

        // DON'T dispose the processor when turning ON — we'll reuse or re-attach it
        // to the new track. This avoids the destroy→recreate cycle that causes a
        // visible flash of the raw camera feed.
        // Just detach the stale track reference so applyBackground re-attaches.
        bgAttachedTrackRef.current = null;

        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);

        if (cameraEnabled) {
          refreshParticipants();
          // Apply background without blocking the UI — processor is reused
          applyConfiguredBackgroundIfNeeded(room).catch(() => {});
        } else {
          setIsCamOn(false);
        }
      } else {
        // Optimistic UI: show cam off immediately
        setIsCamOn(false);

        // Turning off: disable camera first (instant), then dispose processor
        // in the background so the UI doesn't wait for ML teardown.
        const processorToDispose = bgProcessorRef.current;
        bgAttachedTrackRef.current = null;
        bgLastAppliedEffectRef.current = "none";

        await room.localParticipant.setCameraEnabled(false);

        // Fire-and-forget disposal — no need to block the toggle
        if (processorToDispose) {
          disposeBackgroundProcessor().catch(() => {});
        }
      }

      const camActive = hasActiveCameraPublication(room);
      setIsCamOn(camActive);
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Camera toggle error:", err);
      try {
        await disposeBackgroundProcessor();
      } catch {}
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } finally {
      camToggleInFlightRef.current = false;
    }
  }, [refreshParticipants, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor, applyConfiguredBackgroundIfNeeded]);

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
    }, 15000);
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
    bgRequestedEffectRef.current = effect;

    const room = roomRef.current;
    if (!room) return;

    const hasCamera = hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled;
    if (!hasCamera && effect !== "none") return;

    await queueBackgroundEffectApply(effect);
  }, [queueBackgroundEffectApply, hasActiveCameraPublication]);

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

  const clearUnreadChat = useCallback(() => {
    setUnreadChatCount(0);
  }, []);

  // ── Device switching (in-call) ──────────────────────────────────
  const switchAudioInput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    preferredDevicesRef.current.audioDeviceId = deviceId;
    try {
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(deviceId));
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Audio input switch error:", err);
    }
  }, [refreshParticipants]);

  const switchAudioOutput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    preferredDevicesRef.current.audioOutputDeviceId = deviceId;
    try {
      await room.switchActiveDevice("audiooutput", deviceId);
    } catch (err) {
      console.error("[LiveKit] Audio output switch error:", err);
    }
  }, []);

  const switchVideoInput = useCallback(async (deviceId: string) => {
    const room = roomRef.current;
    if (!room) return;
    preferredDevicesRef.current.videoDeviceId = deviceId;
    try {
      bgAttachedTrackRef.current = null;
      await room.localParticipant.setCameraEnabled(false);
      await room.localParticipant.setCameraEnabled(true, getDeviceConstraint(deviceId));
      const isReady = await waitForCameraPublication(room, [80, 150, 300]);
      if (isReady && backgroundEffectRef.current !== "none") {
        await applyConfiguredBackgroundIfNeeded(room);
      }
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Video input switch error:", err);
    }
  }, [refreshParticipants, waitForCameraPublication, hasActiveCameraPublication, applyConfiguredBackgroundIfNeeded]);

  return {
    connectionState,
    participants,
    chatMessages,
    unreadChatCount,
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
    clearUnreadChat,
    switchAudioInput,
    switchAudioOutput,
    switchVideoInput,
  };
}
