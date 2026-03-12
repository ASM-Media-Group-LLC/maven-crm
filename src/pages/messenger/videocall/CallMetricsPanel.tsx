import { useState, useEffect, useCallback } from "react";
import { X, BarChart3, Wifi, Monitor as MonitorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [totalStats, setTotalStats] = useState({
    totalBitrate: "—",
    totalPacketLoss: "—",
    serverLatency: "—",
  });

  const collectStats = useCallback(async () => {
    if (!room) return;

    const participantStats: ParticipantStats[] = [];
    let totalBitrateNum = 0;

    // Local participant
    const local = room.localParticipant;
    let localVideoRes = "—";
    let localVideoBitrate = 0;
    let localAudioBitrate = 0;
    let localVideoCodec = "—";
    let localAudioCodec = "—";
    let localFps = "—";

    for (const pub of local.videoTrackPublications.values()) {
      if (pub.source === Track.Source.Camera && pub.track) {
        const trackStats = (pub.track as any).getStats?.();
        if (trackStats && Array.isArray(trackStats)) {
          for (const s of trackStats) {
            if ((s as any).frameWidth && (s as any).frameHeight) {
              localVideoRes = `${(s as any).frameWidth}x${(s as any).frameHeight}`;
            }
            if ((s as any).framesPerSecond) {
              localFps = `${Math.round((s as any).framesPerSecond)}`;
            }
            if ((s as any).bytesSent !== undefined) {
              // Approximate from bytes delta – simplified
            }
          }
        }
        // Get media stream track settings
        const mediaTrack = pub.track.mediaStreamTrack;
        if (mediaTrack) {
          const settings = mediaTrack.getSettings?.();
          if (settings?.width && settings?.height) {
            localVideoRes = `${settings.width}x${settings.height}`;
          }
          if (settings?.frameRate) {
            localFps = `${Math.round(settings.frameRate)}`;
          }
        }
        localVideoCodec = (pub as any).codec || "VP8";
      }
    }

    for (const pub of local.audioTrackPublications.values()) {
      if (pub.source === Track.Source.Microphone && pub.track) {
        localAudioCodec = (pub as any).codec || "Opus";
      }
    }

    participantStats.push({
      identity: local.identity,
      name: local.name || local.identity,
      isLocal: true,
      videoResolution: localVideoRes,
      videoBitrate: formatBitrate(localVideoBitrate),
      audioBitrate: formatBitrate(localAudioBitrate),
      videoCodec: localVideoCodec,
      audioCodec: localAudioCodec,
      packetLoss: "—",
      jitter: "—",
      latency: "—",
      fps: localFps,
    });

    // Remote participants
    for (const rp of room.remoteParticipants.values()) {
      let videoRes = "—";
      let videoBitrate = 0;
      let audioBitrate = 0;
      let videoCodec = "—";
      let audioCodec = "—";
      let packetLoss = "—";
      let jitter = "—";
      let fps = "—";

      for (const pub of rp.videoTrackPublications.values()) {
        if (pub.source === Track.Source.Camera && pub.track) {
          const dimensions = (pub.track as any).dimensions;
          if (dimensions) {
            videoRes = `${dimensions.width}x${dimensions.height}`;
          } else {
            const mediaTrack = pub.track.mediaStreamTrack;
            if (mediaTrack) {
              const settings = mediaTrack.getSettings?.();
              if (settings?.width && settings?.height) {
                videoRes = `${settings.width}x${settings.height}`;
              }
              if (settings?.frameRate) {
                fps = `${Math.round(settings.frameRate)}`;
              }
            }
          }
          videoCodec = (pub as any).codec || "VP8";
        }
      }

      for (const pub of rp.audioTrackPublications.values()) {
        if (pub.source === Track.Source.Microphone && pub.track) {
          audioCodec = (pub as any).codec || "Opus";
        }
      }

      totalBitrateNum += videoBitrate + audioBitrate;

      participantStats.push({
        identity: rp.identity,
        name: rp.name || rp.identity,
        isLocal: false,
        videoResolution: videoRes,
        videoBitrate: formatBitrate(videoBitrate),
        audioBitrate: formatBitrate(audioBitrate),
        videoCodec,
        audioCodec,
        packetLoss,
        jitter,
        fps,
        latency: "—",
      });
    }

    setStats(participantStats);
    setTotalStats({
      totalBitrate: formatBitrate(totalBitrateNum),
      totalPacketLoss: "—",
      serverLatency: "—",
    });
  }, [room]);

  useEffect(() => {
    collectStats();
    const interval = setInterval(collectStats, 2000);
    return () => clearInterval(interval);
  }, [collectStats]);

  return (
    <div className="w-80 flex flex-col bg-[hsl(240_8%_10%)] border-l border-[hsl(0_0%_100%/0.1)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(0_0%_100%/0.1)]">
        <h3 className="text-sm font-semibold text-[hsl(0_0%_96%)] flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Métricas en tiempo real
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-[hsl(0_0%_96%/0.7)]" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary */}
      <div className="px-4 py-3 border-b border-[hsl(0_0%_100%/0.06)] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[hsl(0_0%_96%/0.5)]">Participantes</span>
          <Badge variant="outline" className="text-[10px] border-[hsl(0_0%_96%/0.2)] text-[hsl(0_0%_96%/0.7)]">
            {participants.length}
          </Badge>
        </div>
      </div>

      {/* Per-participant stats */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {stats.map((s) => (
            <div
              key={s.identity}
              className="rounded-lg bg-[hsl(0_0%_100%/0.04)] p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[hsl(0_0%_96%)]">
                  {s.isLocal ? "Tú" : s.name}
                </span>
                {s.isLocal && (
                  <Badge variant="secondary" className="text-[8px] h-3.5">Local</Badge>
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
      {icon && <span className="text-[hsl(0_0%_96%/0.4)]">{icon}</span>}
      <span className="text-[9px] text-[hsl(0_0%_96%/0.4)]">{label}</span>
      <span className={cn("text-[10px] font-mono ml-auto", value === "—" ? "text-[hsl(0_0%_96%/0.3)]" : "text-[hsl(0_0%_96%/0.8)]")}>
        {value}
      </span>
    </div>
  );
}
