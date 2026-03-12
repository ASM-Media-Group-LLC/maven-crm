import { useState, useEffect } from "react";
import { Link2, Grid3X3, LayoutGrid, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CallTopBarProps {
  roomName: string;
  participantCount: number;
  isEncrypted?: boolean;
  layout: "grid" | "spotlight";
  onToggleLayout: () => void;
  shareLink: string;
}

export default function CallTopBar({
  roomName, participantCount, isEncrypted, layout, onToggleLayout, shareLink,
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
    <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-[hsl(240_8%_10%)]">
      <div className="flex items-center gap-3">
        {/* Room name hidden by design */}
        <Badge variant="outline" className="text-[10px] border-[hsl(0_0%_96%/0.2)] text-[hsl(0_0%_96%/0.7)]">
          {formatTime(elapsed)}
        </Badge>
        {isEncrypted && (
          <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400 gap-1">
            <Shield className="h-3 w-3" /> E2E
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] border-[hsl(0_0%_96%/0.2)] text-[hsl(0_0%_96%/0.5)]">
          {participantCount} participante{participantCount !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-[hsl(0_0%_96%/0.7)] hover:text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.1)] gap-1.5 text-xs"
          onClick={copyLink}
        >
          <Link2 className="h-3.5 w-3.5" />
          Copiar enlace
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[hsl(0_0%_96%/0.7)] hover:text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.1)]"
          onClick={onToggleLayout}
        >
          {layout === "grid" ? <Grid3X3 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
