import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Monitor as MonitorIcon, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Room, Track } from "livekit-client";
import type { LKParticipant } from "@/hooks/useLiveKit";
import { useLanguage } from "@/hooks/useLanguage";

interface MetricsDialogProps {
  open: boolean;
  onClose: () => void;
  room?: Room | null;
  participants?: LKParticipant[];
}

interface ParticipantStats {
  identity: string; name: string; isLocal: boolean;
  videoResolution: string; fps: string; videoCodec: string; audioCodec: string;
  packetLoss: string; jitter: string;
}

export default function MetricsDialog({ open, onClose, room, participants }: MetricsDialogProps) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<ParticipantStats[]>([]);

  const collectStats = useCallback(async () => {
    if (!room) return;
    const result: ParticipantStats[] = [];

    const local = room.localParticipant;
    let localVideoRes = "—", localVideoCodec = "—", localAudioCodec = "—", localFps = "—";
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
    result.push({ identity: local.identity, name: local.name || local.identity, isLocal: true, videoResolution: localVideoRes, fps: localFps, videoCodec: localVideoCodec, audioCodec: localAudioCodec, packetLoss: "—", jitter: "—" });

    for (const rp of room.remoteParticipants.values()) {
      let videoRes = "—", videoCodec = "—", audioCodec = "—", fps = "—";
      for (const pub of rp.videoTrackPublications.values()) {
        if (pub.source === Track.Source.Camera && pub.track) {
          const dimensions = (pub.track as any).dimensions;
          if (dimensions) videoRes = `${dimensions.width}x${dimensions.height}`;
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
      result.push({ identity: rp.identity, name: rp.name || rp.identity, isLocal: false, videoResolution: videoRes, fps, videoCodec, audioCodec, packetLoss: "—", jitter: "—" });
    }
    setStats(result);
  }, [room]);

  useEffect(() => {
    if (!open) return;
    collectStats();
    const interval = setInterval(collectStats, 2000);
    return () => clearInterval(interval);
  }, [open, collectStats]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background border-secondary text-foreground max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-medium text-white">{t("messenger.call.metricas")}</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {!room ? (
            <p className="text-xs text-muted-foreground">{t("messenger.metrics.noConectado")}</p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-foreground">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs font-medium">{t("messenger.metrics.enTiempoReal")}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{t("messenger.metrics.nParticipantes", { n: participants?.length || stats.length })}</span>
              </div>
              {stats.map((s) => (
                <div key={s.identity} className="rounded-lg bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{s.isLocal ? t("messenger.preview.tu") : s.name}</span>
                    {s.isLocal && <span className="text-[8px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Local</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <MetricRow icon={<MonitorIcon className="h-3 w-3" />} label={t("messenger.metrics.resolucion")} value={s.videoResolution} />
                    <MetricRow icon={<Wifi className="h-3 w-3" />} label="FPS" value={s.fps} />
                    <MetricRow label="Video codec" value={s.videoCodec} />
                    <MetricRow label="Audio codec" value={s.audioCodec} />
                    <MetricRow label="Packet loss" value={s.packetLoss} />
                    <MetricRow label="Jitter" value={s.jitter} />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className={cn("text-[10px] font-mono ml-auto", value === "—" ? "text-muted-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}
