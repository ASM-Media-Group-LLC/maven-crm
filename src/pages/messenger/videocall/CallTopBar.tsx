import { useState, useEffect } from "react";
import { Link2, LayoutGrid, Shield, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CallTopBarProps {
  roomName: string;
  participantCount: number;
  isEncrypted?: boolean;
  onOpenAdjustView: () => void;
  shareLink: string;
  hideShareLink?: boolean;
  compact?: boolean;
}

export default function CallTopBar({
  roomName, participantCount, isEncrypted, onOpenAdjustView, shareLink, hideShareLink, compact,
}: CallTopBarProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    toast.success("Enlace copiado");
  };

  return (
    <div className={cn("shrink-0 flex items-center justify-between bg-[hsl(220_3%_14%)]", compact ? "px-2 py-1" : "px-4 py-2")}>
      <div className={cn("flex items-center", compact ? "gap-2" : "gap-3")}>
        <span className={cn("font-medium text-[hsl(220_3%_80%)]", compact ? "text-xs truncate max-w-[120px]" : "text-sm")}>{roomName}</span>
        {!compact && (
          <>
            <div className="h-4 w-px bg-[hsl(220_3%_28%)]" />
            <div className="flex items-center gap-1.5 text-[hsl(220_3%_55%)]">
              <Clock className="h-3 w-3" />
              <span className="text-xs tabular-nums">{formatTime(elapsed)}</span>
            </div>
          </>
        )}
        {isEncrypted && (
          <div className="flex items-center gap-1 text-[hsl(145_63%_49%)]">
            <Shield className="h-3 w-3" />
            <span className="text-[10px] font-medium">E2E</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className={cn("text-[hsl(220_3%_55%)] mr-1", compact ? "text-[10px]" : "text-xs mr-2")}>
          {participantCount} participante{participantCount !== 1 ? "s" : ""}
        </span>
        {!hideShareLink && !compact && (
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_22%)] transition-colors"
          >
            <Link2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Copiar enlace</span>
          </button>
        )}
        {!compact && (
          <button
            onClick={onOpenAdjustView}
            title="Ajustar vista"
            className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_22%)] transition-colors"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Ajustar vista</span>
          </button>
        )}
      </div>
    </div>
  );
}
