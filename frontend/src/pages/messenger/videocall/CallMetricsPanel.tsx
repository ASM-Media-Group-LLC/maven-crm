import { useState, useEffect, useCallback } from "react";
import { X, BarChart3, Wifi, Monitor as MonitorIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Room, Track } from "livekit-client";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";

interface CallMetricsPanelProps {
  room: Room | null;
  participants: LKParticipant[];
  onClose: () => void;
}

interface ParticipantStats {
  identity: string;
  name: string;
  isLocal: boolean;
  videoResolution: string;
  videoBitrate: string;
  audioBitrate: string;
  videoCodec: string;
  audioCodec: string;
  packetLoss: string;
  jitter: string;
  latency: string;
  fps: string;
}

function formatBitrate(bps: number): string {
  if (bps <= 0) return "—";
  if (bps < 1000) return `${bps} bps`;
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${(bps / 1_000_000).toFixed(1)} Mbps`;
}

export default function CallMetricsPanel({ room, participants, onClose }: CallMetricsPanelProps) {
  const [stats, setStats] = useState<ParticipantStats[]>([]);

  const collectStats = useCallback(async () => {
    if (!room) return;
    const participantStats: ParticipantStats[] = [];

    const local = room.localParticipant;
    let localVideoRes = "—";
    let localVideoCodec = "—";
    let localAudioCodec = "—";
    let localFps = "—";

    for (const pub of local.videoTrackPublications.values()) {
      if (pub.source === Track.Source.Camera && pub.track) {
        const mediaTrack = pub.track.mediaStreamTrack;
        if (mediaTrack) {
          const settings = mediaTrack.getSettings?.();
          if (settings?.width && settings?.height) localVideoRes = `${settings.width}x${settings.height}`;
          if (settings?.frameRate) localFps = `${Math.round(settings.frameRate)}`;
        }
        localVideoCodec = (pub as any).codec || "VP8";
      }
    }
    for (const pub of local.audioTrackPublications.values()) {
      if (pub.source === Track.Source.Microphone && pub.track) localAudioCodec = (pub as any).codec || "Opus";
    }

    participantStats.push({
      identity: local.identity, name: local.name || local.identity, isLocal: true,
      videoResolution: localVideoRes, videoBitrate: formatBitrate(0), audioBitrate: formatBitrate(0),
      videoCodec: localVideoCodec, audioCodec: localAudioCodec, packetLoss: "—", jitter: "—", latency: "—", fps: localFps,
    });

    for (const rp of room.remoteParticipants.values()) {
      let videoRes = "—", videoCodec = "—", audioCodec = "—", fps = "—";
      for (const pub of rp.videoTrackPublications.values()) {
        if (pub.source === Track.Source.Camera && pub.track) {
          const dimensions = (pub.track as any).dimensions;
          if (dimensions) { videoRes = `${dimensions.width}x${dimensions.height}`; }
          else {
            const mediaTrack = pub.track.mediaStreamTrack;
            if (mediaTrack) {
              const settings = mediaTrack.getSettings?.();
              if (settings?.width && settings?.height) videoRes = `${settings.width}x${settings.height}`;
              if (settings?.frameRate) fps = `${Math.round(settings.frameRate)}`;
            }
          }
          videoCodec = (pub as any).codec || "VP8";
        }
      }
      for (const pub of rp.audioTrackPublications.values()) {
        if (pub.source === Track.Source.Microphone && pub.track) audioCodec = (pub as any).codec || "Opus";
      }
      participantStats.push({
        identity: rp.identity, name: rp.name || rp.identity, isLocal: false,
        videoResolution: videoRes, videoBitrate: formatBitrate(0), audioBitrate: formatBitrate(0),
        videoCodec, audioCodec, packetLoss: "—", jitter: "—", fps, latency: "—",
      });
    }

    setStats(participantStats);
  }, [room]);

  useEffect(() => {
    collectStats();
    const interval = setInterval(collectStats, 2000);
    return () => clearInterval(interval);
  }, [collectStats]);

  return (
    <div className="w-80 flex flex-col bg-background border-l border-secondary rounded-l-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Métricas en tiempo real
        </h3>
        <button onClick={onClose} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-card">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Participantes</span>
          <span className="text-xs text-foreground">{participants.length}</span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {stats.map((s) => (
            <div key={s.identity} className="rounded-lg bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {s.isLocal ? "Tú" : s.name}
                </span>
                {s.isLocal && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Local</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <StatRow icon={<MonitorIcon className="h-3 w-3" />} label="Resolución" value={s.videoResolution} />
                <StatRow icon={<Wifi className="h-3 w-3" />} label="FPS" value={s.fps} />
                <StatRow label="Video codec" value={s.videoCodec} />
                <StatRow label="Audio codec" value={s.audioCodec} />
                <StatRow label="Packet loss" value={s.packetLoss} />
                <StatRow label="Jitter" value={s.jitter} />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn("text-[10px] font-mono ml-auto", value === "—" ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
