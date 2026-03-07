import { useState, useEffect, useMemo } from "react";
import { X, AlertTriangle, Info, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/hooks/useAnnouncements";

const PRIORITY_CLASSES: Record<string, string> = {
  high: "bg-destructive/10 border-destructive/30 text-destructive",
  normal: "bg-primary/10 border-primary/30 text-primary",
  low: "bg-muted border-border text-muted-foreground",
};

const PRIORITY_ICONS: Record<string, typeof Info> = {
  high: AlertTriangle,
  normal: Megaphone,
  low: Info,
};

interface Props {
  banners: Announcement[];
  onViewDetail: (announcement: Announcement) => void;
}

export default function AnnouncementBanner({ banners, onViewDetail }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Load dismissed from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("dismissed_banners");
      if (stored) setDismissed(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  const visible = useMemo(
    () => banners.filter((b) => !dismissed.has(b.id)),
    [banners, dismissed]
  );

  if (visible.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    sessionStorage.setItem("dismissed_banners", JSON.stringify([...next]));
  };

  return (
    <div className="space-y-2 px-6 pt-4">
      {visible.map((banner) => {
        const cls = PRIORITY_CLASSES[banner.priority] ?? PRIORITY_CLASSES.normal;
        const Icon = PRIORITY_ICONS[banner.priority] ?? Megaphone;
        return (
          <div key={banner.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${cls}`}>
            <Icon className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium flex-1 truncate">{banner.title}</p>
            {banner.message && (
              <p className="text-xs hidden sm:block truncate max-w-xs opacity-80">{banner.message}</p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs shrink-0 h-7"
              onClick={() => onViewDetail(banner)}
            >
              Ver más
            </Button>
            <button
              onClick={() => dismiss(banner.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
