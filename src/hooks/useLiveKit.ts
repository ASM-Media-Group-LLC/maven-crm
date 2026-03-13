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

// ── Background processor timeouts (reduced for responsiveness) ───
const BACKGROUND_ATTACH_TIMEOUT_MS = 6000;
const BACKGROUND_SWITCH_TIMEOUT_MS = 8000;
const BACKGROUND_FAILURE_COOLDOWN_MS = 10000;

// ── Sync interval — Google Meet polls ~3-5s for participant state ─
const PARTICIPANT_SYNC_INTERVAL_MS = 3000;

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

/**
 * Schedules a callback to run when the browser is idle.
 * Falls back to setTimeout(cb, delay) if requestIdleCallback is unavailable.
 */
function scheduleWhenIdle(cb: () => void, delay = 100) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(cb, { timeout: delay + 500 });
  } else {
    setTimeout(cb, delay);
  }
}

function isReloadNavigation() {
  try {
    const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return navigationEntry?.type === "reload";
  } catch {
    return false;
  }
}

// ── Production Room configuration (Google Meet-inspired) ─────────
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Keep local tracks alive when unpublished — avoids getUserMedia re-calls
  // during quick toggling which causes visible camera flashes
  stopLocalTrackOnUnpublish: false,
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
    dtx: true,          // Discontinuous transmission — saves bandwidth on silence
    red: true,          // Redundant encoding — better packet loss resilience
    simulcast: true,    // SFU-style adaptive quality layers
    videoSimulcastLayers: [
      VideoPresets.h180,
      VideoPresets.h360,
      VideoPresets.h720,
    ],
    videoCodec: "vp9",
  },
  disconnectOnPageLeave: true,
  // Reconnection resilience — Google Meet reconnects transparently
  reconnectPolicy: {
    nextRetryDelayInMs: (context) => {
      // Exponential backoff: 300ms, 600ms, 1.2s, 2.4s, capped at 5s
      // Attempt up to 7 times (~20s total before giving up)
      if (context.retryCount >= 7) return null; // give up
      return Math.min(300 * Math.pow(2, context.retryCount), 5000);
    },
  },
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
  const connectingRef = useRef(false);
  const audioResumeCleanupRef = useRef<(() => void) | null>(null);
  // Track whether the initial background has been applied for this session
  const bgInitialApplyDoneRef = useRef(false);
  // Prevent automatic background restoration after reload/failure (user can re-enable manually)
  const skipAutoBackgroundRestoreRef = useRef(false);

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

      // Lazy-create the processor — the constructor loads the ML model
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

      // Critical stability guard: never force camera restart when background ML fails.
      // Keep camera stream alive and disable only automatic background re-apply.
      skipAutoBackgroundRestoreRef.current = effect !== "none";
      refreshParticipants();

      return false;
    }
  }, [disposeBackgroundProcessor, refreshParticipants]);

  const queueBackgroundEffectApply = useCallback((effect: BackgroundEffect) => {
    bgRequestedEffectRef.current = effect;

    bgApplyQueueRef.current = bgApplyQueueRef.current
      .catch(() => false)
      .then(async () => {
        // Bounded loop (max 3 iterations) to prevent infinite spinning
        let iterations = 0;
        while (iterations++ < 3) {
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
          // Effect changed mid-apply — loop once more to apply the new one
        }
        return false;
      });

    return bgApplyQueueRef.current;
  }, [applyBackgroundEffectToCurrentCamera]);

  /**
   * Non-blocking background apply: schedules via requestIdleCallback
   * so the ML model initialization doesn't freeze the main thread on page load.
   * This is the key fix for the "page not responding" freeze on reload.
   */
  const scheduleBackgroundApply = useCallback((room: Room) => {
    if (backgroundEffectRef.current === "none") return;
    if (skipAutoBackgroundRestoreRef.current) return;
    if (bgInitialApplyDoneRef.current) return;
    bgInitialApplyDoneRef.current = true;

    scheduleWhenIdle(() => {
      // Double-check room is still valid after idle delay
      if (roomRef.current !== room) return;
      if (backgroundEffectRef.current === "none") return;
      if (skipAutoBackgroundRestoreRef.current) return;

      const hasTrack = Array.from(room.localParticipant.videoTrackPublications.values()).some(
        (p) => p.source === Track.Source.Camera && p.track,
      );

      if (hasTrack) {
        queueBackgroundEffectApply(backgroundEffectRef.current);
      } else {
        // Camera track not ready yet — wait and retry once
        wait(400).then(() => {
          if (roomRef.current !== room || backgroundEffectRef.current === "none") return;
          if (skipAutoBackgroundRestoreRef.current) return;
          queueBackgroundEffectApply(backgroundEffectRef.current);
        });
      }
    }, 800); // Give the page 800ms to render before starting ML
  }, [queueBackgroundEffectApply]);

  const applyConfiguredBackgroundIfNeeded = useCallback(async (room: Room) => {
    if (backgroundEffectRef.current === "none") {
      bgLastAppliedEffectRef.current = "none";
      return true;
    }

    if (skipAutoBackgroundRestoreRef.current) {
      return false;
    }

    // Fast-check: if track is already available, skip polling entirely
    const hasTrack = Array.from(room.localParticipant.videoTrackPublications.values()).some(
      (p) => p.source === Track.Source.Camera && p.track,
    );
    if (!hasTrack) {
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

  // ── Kick all audio elements (used after connect and reconnect) ─
  const kickAudioPlayback = useCallback((room: Room) => {
    room.startAudio().then(() => {
      console.info("[LiveKit] Audio context started successfully");
      document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
        if (el.paused && el.srcObject) {
          el.play().catch(() => {});
        }
      });
    }).catch(() => {});
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
      bgInitialApplyDoneRef.current = false;
      // On page reload with active background, skip auto-restore to keep startup smooth.
      skipAutoBackgroundRestoreRef.current =
        isReloadNavigation() && backgroundEffectRef.current !== "none";

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
        kickAudioPlayback(room);

        // Re-apply background if needed (non-blocking)
        if (backgroundEffectRef.current !== "none" && !skipAutoBackgroundRestoreRef.current) {
          scheduleWhenIdle(() => {
            if (roomRef.current !== room) return;
            applyConfiguredBackgroundIfNeeded(room);
          }, 300);
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
        // NOTE: Background is handled by scheduleBackgroundApply on connect
        // and applyConfiguredBackgroundIfNeeded on explicit toggleCam.
        // We do NOT trigger background apply here to avoid duplicate races.
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
          cleanupAudioResumeListeners();

          const resumeAudio = () => {
            room.startAudio().then(() => {
              console.info("[LiveKit] Audio playback resumed");
              document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
                if (el.paused && el.srcObject) {
                  el.play().catch(() => {});
                }
              });
              cleanupAudioResumeListeners();
            });
          };

          document.addEventListener("click", resumeAudio);
          document.addEventListener("touchstart", resumeAudio);

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
            const senderParticipant = participant ? room.remoteParticipants.get(participant.identity) || (participant.identity === room.localParticipant.identity ? room.localParticipant : null) : null;
            const senderPermissions = senderParticipant?.permissions;
            const isSenderAdmin = senderPermissions?.canPublish && senderPermissions?.canSubscribe;

            let metadataAdmin = false;
            try {
              const meta = JSON.parse(senderParticipant?.metadata || "{}");
              metadataAdmin = !!meta.isAdmin;
            } catch {}

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
          // Schedule background apply via requestIdleCallback — never blocks the main thread
          scheduleBackgroundApply(room);
        }
      }

      // Aggressively start audio context and ensure all audio elements play
      kickAudioPlayback(room);

      // Second attempt after a delay (catches late track subscriptions)
      setTimeout(() => kickAudioPlayback(room), 1500);

      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      setIsCamOn(hasActiveCameraPublication(room));
      playJoinSound();
      refreshParticipants();

      clearSyncInterval();
      syncIntervalRef.current = setInterval(() => {
        refreshParticipants();
      }, PARTICIPANT_SYNC_INTERVAL_MS);
    } catch (err: any) {
      clearSyncInterval();
      setError(err.message || "Connection failed");
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
    } finally {
      connectingRef.current = false;
    }
  }, [refreshParticipants, debouncedRefresh, clearSyncInterval, cleanupAudioResumeListeners, queueBackgroundEffectApply, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor, applyConfiguredBackgroundIfNeeded, scheduleBackgroundApply, kickAudioPlayback]);

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
        bgAttachedTrackRef.current = null;

        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);

        if (cameraEnabled) {
          refreshParticipants();
          // User-driven camera ON: allow background apply attempts again.
          skipAutoBackgroundRestoreRef.current = false;
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
      // Use switchActiveDevice for seamless audio switching (no gap)
      await room.switchActiveDevice("audioinput", deviceId);
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Audio input switch error:", err);
      // Fallback: disable/re-enable
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(deviceId));
        setIsMicOn(room.localParticipant.isMicrophoneEnabled);
        refreshParticipants();
      } catch (fallbackErr) {
        console.error("[LiveKit] Audio input fallback switch error:", fallbackErr);
      }
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
      // Use switchActiveDevice for seamless video switching
      await room.switchActiveDevice("videoinput", deviceId);
      await wait(200); // Brief wait for the new track to be ready
      const isReady = await waitForCameraPublication(room, [80, 150, 300]);
      if (isReady && backgroundEffectRef.current !== "none") {
        await applyConfiguredBackgroundIfNeeded(room);
      }
      setIsCamOn(hasActiveCameraPublication(room));
      refreshParticipants();
    } catch (err) {
      console.error("[LiveKit] Video input switch error:", err);
      // Fallback: disable/re-enable
      try {
        await room.localParticipant.setCameraEnabled(false);
        await room.localParticipant.setCameraEnabled(true, getDeviceConstraint(deviceId));
        const isReady = await waitForCameraPublication(room, [80, 150, 300]);
        if (isReady && backgroundEffectRef.current !== "none") {
          await applyConfiguredBackgroundIfNeeded(room);
        }
        setIsCamOn(hasActiveCameraPublication(room));
        refreshParticipants();
      } catch (fallbackErr) {
        console.error("[LiveKit] Video input fallback switch error:", fallbackErr);
      }
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
