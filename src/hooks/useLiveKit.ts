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
import { NoiseSuppresionTrackProcessor, supportsNoiseSuppression, loadNCPreference, saveNCPreference } from "@/lib/noise-suppression-processor";

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
  hasVideoTrack: boolean;
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

export interface ConnectOptions {
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
  audioOutputDeviceId?: string;
  backgroundEffect?: BackgroundEffect;
  /** If provided, used instead of calling the generic livekit-token edge function */
  tokenProvider?: () => Promise<{ token: string; url: string }>;
}

function getDeviceConstraint(deviceId?: string) {
  return deviceId ? ({ deviceId: { ideal: deviceId } } as any) : undefined;
}

const BACKGROUND_SAFE_VIDEO_CONSTRAINTS = {
  width: { ideal: 1280, max: 1280 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 24, max: 24 },
} as const;

function getVideoConstraint(deviceId?: string, backgroundSafeProfile = false) {
  const constraint: Record<string, any> = {};
  if (deviceId) constraint.deviceId = { ideal: deviceId };
  if (backgroundSafeProfile) {
    constraint.width = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.width;
    constraint.height = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.height;
    constraint.frameRate = BACKGROUND_SAFE_VIDEO_CONSTRAINTS.frameRate;
  }
  return Object.keys(constraint).length ? (constraint as any) : undefined;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatLiveKitConnectionError(err: any, livekitUrl?: string) {
  const rawMessage = String(err?.message || err || "Connection failed");
  const host = livekitUrl ? livekitUrl.replace(/^wss?:\/\//, "").replace(/\/$/, "") : "LiveKit";

  if (/Abort handler called|serverUnreachable|websocket.*closed|ERR_CONNECTION_TIMED_OUT|timeout|timed out/i.test(rawMessage)) {
    return `No se pudo conectar con el servidor de video (${host}). Verifica que LiveKit esté activo y que HTTPS/WSS en el puerto 443 sea accesible.`;
  }

  return rawMessage;
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

function playHandRaisedSound() {
  playTone(880, 0.2, 0.25);
  setTimeout(() => playTone(1174.66, 0.18, 0.2), 200);
}

function playChatMessageSound() {
  playTone(660, 0.12, 0.2);
  setTimeout(() => playTone(880, 0.1, 0.15), 80);
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
// Prevent burst camera-refresh operations from stacking expensive media reconfigurations.
const VIDEO_SWITCH_MIN_INTERVAL_MS = 420;

function isTemplateBackground(effect: BackgroundEffect) {
  return effect !== "none" && effect !== "blur" && !effect.startsWith("custom:");
}

function isCustomBackground(effect: BackgroundEffect) {
  return typeof effect === "string" && effect.startsWith("custom:");
}

function getCustomBackgroundUrl(effect: BackgroundEffect) {
  return effect.replace(/^custom:/, "");
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
  const bgQueueInFlightRef = useRef(false);
  const bgFailureCooldownUntilRef = useRef(0);
  const bgReapplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const audioResumeCleanupRef = useRef<(() => void) | null>(null);
  // Track whether the initial background has been applied for this session
  const bgInitialApplyDoneRef = useRef(false);
  // Prevent automatic background restoration after reload/failure (user can re-enable manually)
  const skipAutoBackgroundRestoreRef = useRef(false);
  // Hide local camera tile while a background effect is being prepared for the current track.
  const holdLocalVideoUntilBackgroundRef = useRef(false);
  // ── Noise cancellation ──────────────────────────────────────────
  const [isNoiseCancellationOn, setIsNoiseCancellationOn] = useState(false);
  const ncProcessorRef = useRef<NoiseSuppresionTrackProcessor | null>(null);
  const ncEnabledRef = useRef(false);

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

    const shouldHoldLocalVideo =
      isLocal && holdLocalVideoUntilBackgroundRef.current && backgroundEffectRef.current !== "none";

    const camOff = shouldHoldLocalVideo
      ? true
      : isLocal
        ? (typeof localParticipant.isCameraEnabled === "boolean" ? !localParticipant.isCameraEnabled : (videoTrack ? videoTrack.isMuted : true))
        : (videoTrack ? videoTrack.isMuted || !videoTrack.isSubscribed : true);

    const isScreenSharing = !!screenTrack && !screenTrack.isMuted;
    const hasCameraTrack = !!videoTrack?.track && !videoTrack.isMuted;
    const hasScreenTrack = !!screenTrack?.track && !screenTrack.isMuted;

    return {
      sid: p.sid,
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMuted: micMuted,
      isCameraOff: camOff,
      isScreenSharing,
      isLocal,
      handRaised: handRaisedMap.current[p.identity] || false,
      reactions: [],
      connectionQuality: mapConnectionQuality(p.connectionQuality),
      hasVideoTrack: isScreenSharing ? hasScreenTrack : hasCameraTrack,
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

  const clearBackgroundReapplyTimer = useCallback(() => {
    if (bgReapplyTimerRef.current) {
      clearTimeout(bgReapplyTimerRef.current);
      bgReapplyTimerRef.current = null;
    }
  }, []);

  const refreshParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const result: LKParticipant[] = [];
    const local = buildParticipant(room.localParticipant, true);

    // If local is screen-sharing AND camera is on, emit two tiles
    if (local.isScreenSharing && !local.isCameraOff) {
      const lp = room.localParticipant;
      const localScreenPub = Array.from(lp.videoTrackPublications.values()).find((t) => t.source === Track.Source.ScreenShare);
      const localCamPub = Array.from(lp.videoTrackPublications.values()).find((t) => t.source === Track.Source.Camera);
      // Screen share tile
      result.push({ ...local, sid: `${local.sid}-screen`, isCameraOff: true, hasVideoTrack: !!localScreenPub?.track && !localScreenPub.isMuted });
      // Camera tile
      result.push({ ...local, isScreenSharing: false, hasVideoTrack: !!localCamPub?.track && !localCamPub.isMuted });
    } else {
      result.push(local);
    }

    room.remoteParticipants.forEach((p) => {
      const remote = buildParticipant(p, false);
      if (remote.isScreenSharing && !remote.isCameraOff) {
        const screenPub = Array.from(p.videoTrackPublications.values()).find((t) => t.source === Track.Source.ScreenShare);
        const camPub = Array.from(p.videoTrackPublications.values()).find((t) => t.source === Track.Source.Camera);
        result.push({ ...remote, sid: `${remote.sid}-screen`, isCameraOff: true, hasVideoTrack: !!screenPub?.track && !screenPub.isMuted });
        result.push({ ...remote, isScreenSharing: false, hasVideoTrack: !!camPub?.track && !camPub.isMuted });
      } else {
        result.push(remote);
      }
    });

    setParticipants(result);
  }, [buildParticipant]);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => refreshParticipants(), 50);
  }, [refreshParticipants]);

  const camToggleInFlightRef = useRef(false);
  const videoSwitchInFlightRef = useRef(false);
  const pendingVideoSwitchDeviceIdRef = useRef<string | null>(null);
  const lastVideoSwitchAtRef = useRef(0);

  const getLocalCameraPublication = useCallback((room: Room) => {
    return Array.from(room.localParticipant.videoTrackPublications.values()).find(
      (publication) => publication.source === Track.Source.Camera,
    );
  }, []);

  const hasActiveCameraPublication = useCallback((room: Room) => {
    const cameraPublication = getLocalCameraPublication(room);
    return !!cameraPublication?.track && !cameraPublication.isMuted;
  }, [getLocalCameraPublication]);

  const getLocalCameraTrack = useCallback((room: Room) => {
    return (getLocalCameraPublication(room)?.track as any) || null;
  }, [getLocalCameraPublication]);

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
      const useBackgroundSafeProfile = backgroundEffectRef.current !== "none";
      const videoConstraint = getVideoConstraint(preferredVideoDeviceId, useBackgroundSafeProfile);

      // Attempt 1: preferred device + profile-aware constraints
      try {
        await room.localParticipant.setCameraEnabled(true, videoConstraint);
        const isReady = await waitForCameraPublication(room, [80, 150, 300]);
        if (isReady) {
          refreshParticipants();
          return true;
        }
      } catch (err) {
        console.warn("[LiveKit] Camera enable attempt 1 failed:", err);
      }

      // Attempt 2: hard reset camera + processor, then enable using fallback constraints
      try {
        await disposeBackgroundProcessor();
        await room.localParticipant.setCameraEnabled(false);
        await wait(80);
        await room.localParticipant.setCameraEnabled(true, getVideoConstraint(undefined, useBackgroundSafeProfile));
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
      } else if (isCustomBackground(effect)) {
        const customUrl = getCustomBackgroundUrl(effect);
        if (!preloadedBackgroundsRef.current.has(customUrl)) {
          await new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.src = customUrl;
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("custom-bg-load-failed"));
          });
          preloadedBackgroundsRef.current.add(customUrl);
        }

        if (opId !== bgApplyOpRef.current) return false;

        await withTimeout(
          Promise.resolve(
            processor.switchTo({
              mode: "virtual-background",
              imagePath: customUrl,
            }),
          ),
          BACKGROUND_SWITCH_TIMEOUT_MS,
          "bg-custom",
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

    if (bgQueueInFlightRef.current) {
      return bgApplyQueueRef.current;
    }

    bgQueueInFlightRef.current = true;
    bgApplyQueueRef.current = (async () => {
      try {
        // Coalesced loop: process only the latest requested effect.
        // This avoids an ever-growing promise chain under rapid camera refreshes.
        let iterations = 0;
        while (iterations++ < 6) {
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

        return false;
      } finally {
        bgQueueInFlightRef.current = false;
      }
    })();

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

  const scheduleDeferredBackgroundReapply = useCallback((room: Room, delayMs = 320) => {
    if (backgroundEffectRef.current === "none") return;
    if (skipAutoBackgroundRestoreRef.current) return;

    clearBackgroundReapplyTimer();
    const expectedEffect = backgroundEffectRef.current;

    bgReapplyTimerRef.current = setTimeout(() => {
      bgReapplyTimerRef.current = null;
      scheduleWhenIdle(() => {
        if (roomRef.current !== room) return;
        if (skipAutoBackgroundRestoreRef.current) return;
        if (backgroundEffectRef.current !== expectedEffect) return;
        void queueBackgroundEffectApply(expectedEffect);
      }, 250);
    }, delayMs);
  }, [clearBackgroundReapplyTimer, queueBackgroundEffectApply]);

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

  const applyBackgroundBeforeLocalVideoVisible = useCallback(async (room: Room) => {
    if (backgroundEffectRef.current === "none") {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      return true;
    }

    if (skipAutoBackgroundRestoreRef.current) {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      return false;
    }

    holdLocalVideoUntilBackgroundRef.current = true;
    refreshParticipants();

    try {
      return await applyConfiguredBackgroundIfNeeded(room);
    } finally {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
    }
  }, [applyConfiguredBackgroundIfNeeded, refreshParticipants]);

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
        roomRef.current.disconnect(true);
        roomRef.current = null;
      }
      clearSyncInterval();
      clearBackgroundReapplyTimer();
      cleanupAudioResumeListeners();
      bgQueueInFlightRef.current = false;
      bgApplyQueueRef.current = Promise.resolve(true);
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

      let tokenData: { token: string; url: string };

      if (options.tokenProvider) {
        tokenData = await options.tokenProvider();
      } else {
        const { data, error: fnErr } = await supabase.functions.invoke("livekit-token", {
          body: { roomName, participantName, isAdmin },
        });
        if (fnErr || !data?.token) {
          throw new Error(fnErr?.message || data?.error || "Failed to get token");
        }
        tokenData = { token: data.token, url: data.url };
      }

      const livekitUrl = tokenData.url;
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
            playChatMessageSound();
          } else if (msg.type === "hand") {
            handRaisedMap.current[participant?.identity || ""] = msg.payload.raised;
            if (msg.payload.raised) playHandRaisedSound();
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
            const action = msg.payload?.action;
            const target = msg.payload?.target;

            if (target !== room.localParticipant.identity) return;

            if (action === "mute") {
              // Any participant can mute others
              room.localParticipant.setMicrophoneEnabled(false);
              setIsMicOn(false);
              refreshParticipants();
            } else if (action === "remove") {
              // Only admins can remove — validate sender
              const senderParticipant = participant ? room.remoteParticipants.get(participant.identity) || (participant.identity === room.localParticipant.identity ? room.localParticipant : null) : null;
              let metadataAdmin = false;
              try {
                const meta = JSON.parse(senderParticipant?.metadata || "{}");
                metadataAdmin = !!meta.isAdmin;
              } catch {}
              const senderPermissions = senderParticipant?.permissions;
              const isSenderAdmin = (senderPermissions?.canPublish && senderPermissions?.canSubscribe) || metadataAdmin;

              if (!isSenderAdmin) {
                console.warn("[LiveKit] Ignoring remove command from non-admin:", participant?.identity);
                return;
              }
              setError("Has sido removido de la llamada por un moderador");
              room.disconnect(true);
            }
          }
        } catch {}
      });

      room.on(RoomEvent.Disconnected, () => {
        clearSyncInterval();
        clearBackgroundReapplyTimer();
        cleanupAudioResumeListeners();
        bgQueueInFlightRef.current = false;
        bgApplyQueueRef.current = Promise.resolve(true);
        void disposeBackgroundProcessor();
        holdLocalVideoUntilBackgroundRef.current = false;
        setConnectionState(ConnectionState.Disconnected);
        setIsReconnecting(false);
        setParticipants([]);
        setActiveSpeaker(null);
      });

      // ── Connect & publish tracks ────────────────────────────
      await room.connect(livekitUrl, tokenData.token);
      console.info("[LiveKit] Connected to room:", roomName, "as", room.localParticipant.identity);
      console.info("[LiveKit] Remote participants already in room:", room.remoteParticipants.size);

      const shouldEnableMic = options.initialMicOn ?? true;
      const shouldEnableCam = options.initialCamOn ?? true;

      await room.localParticipant.setMicrophoneEnabled(false);
      await room.localParticipant.setCameraEnabled(false);

      if (shouldEnableMic) {
        await room.localParticipant.setMicrophoneEnabled(true, getDeviceConstraint(options.audioDeviceId));
        // Apply noise cancellation if saved preference is on
        if (loadNCPreference() && supportsNoiseSuppression()) {
          ncEnabledRef.current = true;
          setIsNoiseCancellationOn(true);
          try {
            await wait(80);
            const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (p) => p.source === Track.Source.Microphone,
            );
            const localAudioTrack = micPub?.track;
            if (localAudioTrack) {
              const processor = new NoiseSuppresionTrackProcessor();
              ncProcessorRef.current = processor;
              await (localAudioTrack as any).setProcessor(processor);
              console.info("[LiveKit] Noise cancellation applied on connect");
            }
          } catch (err) {
            console.warn("[LiveKit] NC init error:", err);
            ncEnabledRef.current = false;
            setIsNoiseCancellationOn(false);
          }
        }
      }

      if (shouldEnableCam) {
        const shouldGateVideoUntilBackground = backgroundEffectRef.current !== "none" && !skipAutoBackgroundRestoreRef.current;
        if (shouldGateVideoUntilBackground) {
          bgFailureCooldownUntilRef.current = 0;
          holdLocalVideoUntilBackgroundRef.current = true;
          refreshParticipants();
        }

        const cameraEnabled = await enableCameraWithRecovery(room, options.videoDeviceId);

        if (cameraEnabled) {
          if (shouldGateVideoUntilBackground) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 260);
            }
          } else {
            // Fallback path when no effect is active or auto-restore is skipped.
            scheduleBackgroundApply(room);
          }
        } else if (shouldGateVideoUntilBackground) {
          holdLocalVideoUntilBackgroundRef.current = false;
          refreshParticipants();
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
      setError(formatLiveKitConnectionError(err, roomRef.current ? undefined : undefined));
      setConnectionState(ConnectionState.Disconnected);
      console.error("LiveKit connect error:", err);
      throw err;
    } finally {
      connectingRef.current = false;
    }
  }, [refreshParticipants, debouncedRefresh, clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, hasActiveCameraPublication, enableCameraWithRecovery, disposeBackgroundProcessor, applyConfiguredBackgroundIfNeeded, applyBackgroundBeforeLocalVideoVisible, scheduleBackgroundApply, scheduleDeferredBackgroundReapply, kickAudioPlayback]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    clearSyncInterval();
    clearBackgroundReapplyTimer();
    cleanupAudioResumeListeners();
    bgQueueInFlightRef.current = false;
    bgApplyQueueRef.current = Promise.resolve(true);
    void disposeBackgroundProcessor();
    try { ncProcessorRef.current?.destroy(); } catch {}
    ncProcessorRef.current = null;
    ncEnabledRef.current = false;
    setIsNoiseCancellationOn(false);
    roomRef.current?.disconnect(true);
    roomRef.current = null;
    connectingRef.current = false;
    holdLocalVideoUntilBackgroundRef.current = false;
    setParticipants([]);
    setChatMessages([]);
    setIsScreenSharing(false);
    setIsHandRaised(false);
    setIsReconnecting(false);
    setActiveSpeaker(null);
    handRaisedMap.current = {};
    setConnectionState(ConnectionState.Disconnected);
  }, [clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

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
      // Ensure remote audio playback is unblocked (browsers require a user gesture).
      // toggleMic is always invoked by a user gesture, so this is the right moment.
      if (!room.canPlaybackAudio) {
        room.startAudio().catch(() => {});
      }
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
      setTimeout(() => refreshParticipants(), 180);
    } catch (err) {
      console.error("Mic toggle error:", err);
      setIsMicOn(room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    }
  }, [refreshParticipants]);

  // ── Noise Cancellation toggle ─────────────────────────────────
  const toggleNoiseCancellation = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const newState = !ncEnabledRef.current;
    ncEnabledRef.current = newState;
    setIsNoiseCancellationOn(newState);
    saveNCPreference(newState);
    const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
      (pub) => pub.source === Track.Source.Microphone,
    );
    const localAudioTrack = micPub?.track;
    if (!localAudioTrack) return;
    if (newState) {
      if (!supportsNoiseSuppression()) { ncEnabledRef.current = false; setIsNoiseCancellationOn(false); return; }
      try {
        const processor = new NoiseSuppresionTrackProcessor();
        ncProcessorRef.current = processor;
        await (localAudioTrack as any).setProcessor(processor);
        console.info("[LiveKit] Noise cancellation enabled");
      } catch (err) {
        console.error("[LiveKit] NC toggle error:", err);
        ncProcessorRef.current = null;
        ncEnabledRef.current = false;
        setIsNoiseCancellationOn(false);
      }
    } else {
      try { await (localAudioTrack as any).stopProcessor(); } catch {}
      if (ncProcessorRef.current) { try { await ncProcessorRef.current.destroy(); } catch {} ncProcessorRef.current = null; }
      console.info("[LiveKit] Noise cancellation disabled");
    }
  }, []);

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

        const shouldGateVideoUntilBackground = backgroundEffectRef.current !== "none";
        if (shouldGateVideoUntilBackground) {
          bgFailureCooldownUntilRef.current = 0;
          holdLocalVideoUntilBackgroundRef.current = true;
          refreshParticipants();
        }

        const cameraEnabled = await enableCameraWithRecovery(room, preferredDevicesRef.current.videoDeviceId);

        if (cameraEnabled) {
          refreshParticipants();
          // User-driven camera ON: allow background apply attempts again.
          skipAutoBackgroundRestoreRef.current = false;

          if (shouldGateVideoUntilBackground) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 280);
            }
          }
        } else if (shouldGateVideoUntilBackground) {
          holdLocalVideoUntilBackgroundRef.current = false;
          refreshParticipants();
        } else {
          setIsCamOn(false);
        }
      } else {
        // Optimistic UI: show cam off immediately
        setIsCamOn(false);

        // Keep processor warm (disabled mode) so repeated camera refreshes
        // don't constantly rebuild ML resources and freeze the tab.
        const processor = bgProcessorRef.current;
        const currentCamTrack = getLocalCameraTrack(room);
        if (currentCamTrack && bgAttachedTrackRef.current === currentCamTrack) {
          try {
            await withTimeout(Promise.resolve(currentCamTrack.stopProcessor?.()), 1000, "bg-stop-on-cam-off");
          } catch {}
        }

        bgAttachedTrackRef.current = null;
        bgLastAppliedEffectRef.current = "none";

        if (processor?.switchTo) {
          try {
            await withTimeout(Promise.resolve(processor.switchTo({ mode: "disabled" })), 1200, "bg-disable-on-cam-off");
          } catch {}
        }

        await room.localParticipant.setCameraEnabled(false);
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
  }, [refreshParticipants, hasActiveCameraPublication, enableCameraWithRecovery, getLocalCameraTrack, disposeBackgroundProcessor, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

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
    // Manual user action always re-enables background processing path.
    skipAutoBackgroundRestoreRef.current = false;

    const room = roomRef.current;
    if (!room) return;

    const hasCamera = hasActiveCameraPublication(room) || room.localParticipant.isCameraEnabled;
    if (!hasCamera && effect !== "none") return;

    if (effect === "none") {
      holdLocalVideoUntilBackgroundRef.current = false;
      refreshParticipants();
      await queueBackgroundEffectApply(effect);
      return;
    }

    const applied = await applyBackgroundBeforeLocalVideoVisible(room);
    if (!applied) {
      scheduleDeferredBackgroundReapply(room, 240);
    }
  }, [queueBackgroundEffectApply, hasActiveCameraPublication, refreshParticipants, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearSyncInterval();
      clearBackgroundReapplyTimer();
      cleanupAudioResumeListeners();
      bgQueueInFlightRef.current = false;
      bgApplyQueueRef.current = Promise.resolve(true);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      try { ncProcessorRef.current?.destroy(); } catch {}
      void disposeBackgroundProcessor();
      roomRef.current?.disconnect(true);
    };
  }, [clearSyncInterval, clearBackgroundReapplyTimer, cleanupAudioResumeListeners, disposeBackgroundProcessor]);

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
    pendingVideoSwitchDeviceIdRef.current = deviceId;
    if (videoSwitchInFlightRef.current) return;

    videoSwitchInFlightRef.current = true;

    try {
      while (pendingVideoSwitchDeviceIdRef.current) {
        const nextDeviceId = pendingVideoSwitchDeviceIdRef.current;
        pendingVideoSwitchDeviceIdRef.current = null;

        const room = roomRef.current;
        if (!room) break;

        const elapsedSinceLastSwitch = Date.now() - lastVideoSwitchAtRef.current;
        if (elapsedSinceLastSwitch < VIDEO_SWITCH_MIN_INTERVAL_MS) {
          await wait(VIDEO_SWITCH_MIN_INTERVAL_MS - elapsedSinceLastSwitch);
        }
        lastVideoSwitchAtRef.current = Date.now();

        preferredDevicesRef.current.videoDeviceId = nextDeviceId;
        const hasBackgroundEffect = backgroundEffectRef.current !== "none";

        try {
          // Stop processor on current track before replacing camera source
          // to avoid orphaned ML pipelines that can freeze camera refresh.
          const currentCamTrack = getLocalCameraTrack(room);
          if (currentCamTrack && bgAttachedTrackRef.current === currentCamTrack) {
            try {
              await withTimeout(Promise.resolve(currentCamTrack.stopProcessor?.()), 1200, "bg-stop-before-video-switch");
            } catch {}
          }

          // Keep processor instance alive and only disable its mode before re-attaching.
          // Re-creating the processor on every refresh spikes CPU/GPU and can hang the page.
          const processor = bgProcessorRef.current;
          if (processor?.switchTo) {
            try {
              await withTimeout(Promise.resolve(processor.switchTo({ mode: "disabled" })), 1200, "bg-disable-before-video-switch");
            } catch {}
          }

          bgAttachedTrackRef.current = null;
          bgLastAppliedEffectRef.current = "none";

          // Device switch is user-driven, so allow background application again.
          skipAutoBackgroundRestoreRef.current = false;

          if (hasBackgroundEffect) {
            bgFailureCooldownUntilRef.current = 0;
            holdLocalVideoUntilBackgroundRef.current = true;
            refreshParticipants();
          }

          // Try seamless device switch first; fallback to deterministic restart only if needed.
          try {
            await room.switchActiveDevice("videoinput", nextDeviceId);
          } catch {
            await room.localParticipant.setCameraEnabled(false);
            await wait(70);
            await room.localParticipant.setCameraEnabled(true, getVideoConstraint(nextDeviceId, hasBackgroundEffect));
          }

          const isReady = await waitForCameraPublication(room, [80, 150, 300]);
          if (isReady && hasBackgroundEffect) {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 260);
            }
          } else if (hasBackgroundEffect) {
            holdLocalVideoUntilBackgroundRef.current = false;
            refreshParticipants();
          }

          setIsCamOn(hasActiveCameraPublication(room));
          refreshParticipants();
        } catch (err) {
          console.error("[LiveKit] Video input switch error:", err);

          // Last-resort recovery: recycle processor only after a real switch failure.
          if (backgroundEffectRef.current !== "none") {
            await disposeBackgroundProcessor();
          }

          // Fallback: full camera recovery with profile-aware constraints.
          const cameraEnabled = await enableCameraWithRecovery(room, nextDeviceId);
          if (cameraEnabled && backgroundEffectRef.current !== "none") {
            const applied = await applyBackgroundBeforeLocalVideoVisible(room);
            if (!applied) {
              scheduleDeferredBackgroundReapply(room, 300);
            }
          } else if (backgroundEffectRef.current !== "none") {
            holdLocalVideoUntilBackgroundRef.current = false;
            refreshParticipants();
          }
          setIsCamOn(hasActiveCameraPublication(room));
          refreshParticipants();
        }
      }
    } finally {
      videoSwitchInFlightRef.current = false;
      pendingVideoSwitchDeviceIdRef.current = null;
    }
  }, [refreshParticipants, waitForCameraPublication, hasActiveCameraPublication, enableCameraWithRecovery, getLocalCameraTrack, disposeBackgroundProcessor, applyBackgroundBeforeLocalVideoVisible, scheduleDeferredBackgroundReapply]);

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
    isNoiseCancellationOn,
    toggleNoiseCancellation,
  };
}
