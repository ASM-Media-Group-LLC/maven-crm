import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff,
  ChevronDown, Monitor, Volume2, Loader2,
} from "lucide-react";
import { createLocalTracks, LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { BackgroundProcessor, supportsBackgroundProcessors } from "@livekit/track-processors";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import BackgroundSelector, { BackgroundEffect, BACKGROUND_TEMPLATES } from "./BackgroundSelector";

interface PreJoinLobbyProps {
  roomName: string;
  displayName: string;
  callDisplayName?: string;
  onJoin: (opts: { micOn: boolean; camOn: boolean; audioDeviceId?: string; videoDeviceId?: string; audioOutputDeviceId?: string; backgroundEffect?: BackgroundEffect }) => void;
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

export default function PreJoinLobby({ roomName, displayName, callDisplayName, onJoin }: PreJoinLobbyProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewTracksRef = useRef<{ video: LocalVideoTrack | null; audio: LocalAudioTrack | null }>({
    video: null,
    audio: null,
  });
  const previewBgProcessorRef = useRef<any>(null);
  const previewSessionRef = useRef(0);
  const bgEffectRef = useRef<BackgroundEffect>("none");

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [joining, setJoining] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>("none");
  const [backgroundPreviewUnsupported, setBackgroundPreviewUnsupported] = useState(false);

  // Device lists
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");
  const [selectedVideoInput, setSelectedVideoInput] = useState<string>("");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>("");

  // Device selector dropdowns
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ai = devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 5)}` }));
      const vi = devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 5)}` }));
      const ao = devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Altavoz ${d.deviceId.slice(0, 5)}` }));
      setAudioInputs(ai);
      setVideoInputs(vi);
      setAudioOutputs(ao);
      if (ai.length && !selectedAudioInput) setSelectedAudioInput(ai[0].deviceId);
      if (vi.length && !selectedVideoInput) setSelectedVideoInput(vi[0].deviceId);
      if (ao.length && !selectedAudioOutput) setSelectedAudioOutput(ao[0].deviceId);
    } catch {}
  }, [selectedAudioInput, selectedVideoInput, selectedAudioOutput]);

  const stopPreview = useCallback(async () => {
    const { video, audio } = previewTracksRef.current;
    if (video) {
      try {
        video.detach();
        video.stop();
      } catch {}
    }
    if (audio) {
      try {
        audio.stop();
      } catch {}
    }
    previewTracksRef.current = { video: null, audio: null };

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const applyPreviewBackground = useCallback(async (videoTrack: LocalVideoTrack | null, effect: BackgroundEffect) => {
    if (!videoTrack) return;

    if (effect !== "none" && !supportsBackgroundProcessors()) {
      setBackgroundPreviewUnsupported(true);
      return;
    }

    setBackgroundPreviewUnsupported(false);

    if (!previewBgProcessorRef.current) {
      previewBgProcessorRef.current = BackgroundProcessor({ mode: "disabled" });
    }

    const processor = previewBgProcessorRef.current;
    await videoTrack.setProcessor(processor, true);

    if (effect === "none") {
      await processor.switchTo({ mode: "disabled" });
    } else if (effect === "soft-blur") {
      await processor.switchTo({ mode: "background-blur", blurRadius: 10 });
    } else if (effect === "hard-blur") {
      await processor.switchTo({ mode: "background-blur", blurRadius: 25 });
    } else {
      const selectedTemplate = BACKGROUND_TEMPLATES.find((tpl) => tpl.id === effect);
      if (selectedTemplate) {
        await processor.switchTo({
          mode: "virtual-background",
          imagePath: `${window.location.origin}${selectedTemplate.src}`,
        });
      }
    }
  }, []);

  // Start camera/mic preview
  const startPreview = useCallback(async () => {
    const previewSession = ++previewSessionRef.current;
    await stopPreview();

    if (!camOn && !micOn) return;

    try {
      const tracks = await createLocalTracks({
        video: camOn
          ? (selectedVideoInput ? { deviceId: { exact: selectedVideoInput } } : true)
          : false,
        audio: micOn
          ? (selectedAudioInput ? { deviceId: { exact: selectedAudioInput } } : true)
          : false,
      });

      if (previewSession !== previewSessionRef.current) {
        tracks.forEach((track) => track.stop());
        return;
      }

      const videoTrack = tracks.find((track): track is LocalVideoTrack => track.kind === "video") || null;
      const audioTrack = tracks.find((track): track is LocalAudioTrack => track.kind === "audio") || null;

      previewTracksRef.current = { video: videoTrack, audio: audioTrack };
      setPermissionError(null);

      if (videoRef.current && videoTrack) {
        videoTrack.attach(videoRef.current);
        await applyPreviewBackground(videoTrack, bgEffectRef.current);
      }

      await enumerateDevices();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setPermissionError("Permiso de cámara/micrófono denegado. Habilítalo en la configuración del navegador.");
      } else {
        setPermissionError("No se pudo acceder a los dispositivos.");
      }
    }
  }, [camOn, micOn, selectedVideoInput, selectedAudioInput, enumerateDevices, stopPreview, applyPreviewBackground]);

  useEffect(() => {
    bgEffectRef.current = bgEffect;
    const currentVideoTrack = previewTracksRef.current.video;
    if (currentVideoTrack) {
      applyPreviewBackground(currentVideoTrack, bgEffect).catch(() => {});
    }
  }, [bgEffect, applyPreviewBackground]);

  useEffect(() => {
    startPreview();

    return () => {
      previewSessionRef.current += 1;
      stopPreview();
    };
  }, [startPreview, stopPreview]);

  useEffect(() => {
    return () => {
      const processor = previewBgProcessorRef.current;
      previewBgProcessorRef.current = null;
      if (processor?.destroy) {
        processor.destroy().catch(() => {});
      }
    };
  }, []);

  // Toggle mic in preview
  const handleToggleMic = () => {
    setMicOn((v) => !v);
  };

  // Toggle cam in preview
  const handleToggleCam = () => {
    setCamOn((v) => !v);
  };

  const handleJoin = async () => {
    setJoining(true);
    await stopPreview();
    onJoin({
      micOn,
      camOn,
      audioDeviceId: selectedAudioInput || undefined,
      videoDeviceId: selectedVideoInput || undefined,
      audioOutputDeviceId: selectedAudioOutput || undefined,
      backgroundEffect: bgEffect,
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!openDropdown) return;
    const handler = () => setOpenDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openDropdown]);

  const truncateLabel = (label: string, max = 18) =>
    label.length > max ? label.slice(0, max) + "…" : label;

  const selectedBackgroundLabel =
    bgEffect === "none"
      ? "Sin fondo virtual"
      : bgEffect === "soft-blur"
        ? "Difuminado leve"
        : bgEffect === "hard-blur"
          ? "Difuminado fuerte"
          : BACKGROUND_TEMPLATES.find((tpl) => tpl.id === bgEffect)?.label || "Fondo virtual";

  const selectedBackgroundTemplate = BACKGROUND_TEMPLATES.find((tpl) => tpl.id === bgEffect) || null;

  return (
    <div className="h-screen w-screen bg-[hsl(220_13%_95%)] dark:bg-[hsl(240_10%_6%)] flex items-center justify-center p-4">
      <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 max-w-5xl w-full">
        {/* Left: Camera preview */}
        <div className="flex flex-col items-center gap-4 flex-1 w-full max-w-[640px]">
          {/* Video preview */}
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-[hsl(240_6%_15%)] shadow-xl">
            {selectedBackgroundTemplate && (
              <img
                src={selectedBackgroundTemplate.src}
                alt={`Vista previa del fondo ${selectedBackgroundTemplate.label}`}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            )}

            {camOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[hsl(240_8%_12%/0.78)]">
                <Avatar className="h-24 w-24 border-2 border-[hsl(0_0%_100%/0.1)]">
                  <AvatarFallback className="text-3xl bg-primary/20 text-primary font-semibold">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}

            {/* Name overlay */}
            <div className="absolute bottom-3 left-3 bg-[hsl(0_0%_0%/0.6)] backdrop-blur-sm rounded-md px-3 py-1.5 z-10">
              <span className="text-sm font-medium text-white">{displayName}</span>
            </div>

            {/* Controls over video */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
              <button
                onClick={handleToggleMic}
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center transition-all shadow-lg",
                  micOn
                    ? "bg-[hsl(0_0%_20%/0.7)] hover:bg-[hsl(0_0%_20%/0.9)] text-white"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                )}
                title={micOn ? "Desactivar micrófono" : "Activar micrófono"}
              >
                {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              <button
                onClick={handleToggleCam}
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center transition-all shadow-lg",
                  camOn
                    ? "bg-[hsl(0_0%_20%/0.7)] hover:bg-[hsl(0_0%_20%/0.9)] text-white"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                )}
                title={camOn ? "Desactivar cámara" : "Activar cámara"}
              >
                {camOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>
            </div>

            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-[hsl(240_8%_12%/0.95)] z-20 px-6">
                <p className="text-sm text-destructive text-center">{permissionError}</p>
              </div>
            )}
          </div>

          {/* Device selectors row */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Mic selector */}
            <DeviceDropdown
              icon={<Mic className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(audioInputs.find((d) => d.deviceId === selectedAudioInput)?.label || "Micrófono")}
              devices={audioInputs}
              selectedId={selectedAudioInput}
              onSelect={(id) => setSelectedAudioInput(id)}
              isOpen={openDropdown === "mic"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "mic" ? null : "mic"); }}
            />
            {/* Speaker selector */}
            <DeviceDropdown
              icon={<Volume2 className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(audioOutputs.find((d) => d.deviceId === selectedAudioOutput)?.label || "Altavoces")}
              devices={audioOutputs}
              selectedId={selectedAudioOutput}
              onSelect={(id) => setSelectedAudioOutput(id)}
              isOpen={openDropdown === "speaker"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "speaker" ? null : "speaker"); }}
            />
            {/* Camera selector */}
            <DeviceDropdown
              icon={<Monitor className="h-3.5 w-3.5 shrink-0" />}
              label={truncateLabel(videoInputs.find((d) => d.deviceId === selectedVideoInput)?.label || "Cámara")}
              devices={videoInputs}
              selectedId={selectedVideoInput}
              onSelect={(id) => setSelectedVideoInput(id)}
              isOpen={openDropdown === "cam"}
              onToggle={(e) => { e.stopPropagation(); setOpenDropdown(openDropdown === "cam" ? null : "cam"); }}
            />
            <BackgroundSelector selected={bgEffect} onSelect={setBgEffect} />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Fondo seleccionado: <span className="font-medium text-foreground">{selectedBackgroundLabel}</span>
          </p>
        </div>

        {/* Right: Join panel */}
        <div className="flex flex-col items-center gap-4 text-center min-w-[280px]">
          <h1 className="text-2xl font-semibold text-foreground">
            ¿Listo para unirte?
          </h1>
          <p className="text-sm text-muted-foreground">
            {callDisplayName || roomName}
          </p>

          <button
            onClick={handleJoin}
            disabled={joining}
            className={cn(
              "mt-2 w-full max-w-[280px] h-12 rounded-full font-medium text-base transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg hover:shadow-xl",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "flex items-center justify-center gap-2"
            )}
          >
            {joining ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              "Unirse ahora"
            )}
          </button>

          <p className="text-xs text-muted-foreground mt-1">
            Tu micrófono y cámara se pueden cambiar durante la llamada
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Device dropdown selector ────────────────────────────────────
function DeviceDropdown({
  icon,
  label,
  devices,
  selectedId,
  onSelect,
  isOpen,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  devices: DeviceInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-full text-xs border transition-colors",
          "border-border bg-background text-foreground hover:bg-accent"
        )}
      >
        {icon}
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {isOpen && devices.length > 0 && (
        <div
          className="absolute bottom-full mb-1 left-0 z-50 min-w-[220px] max-w-[300px] rounded-lg border border-border bg-popover shadow-lg p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => { onSelect(d.deviceId); }}
              className={cn(
                "w-full text-left text-xs px-3 py-2 rounded-md transition-colors truncate",
                d.deviceId === selectedId
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
