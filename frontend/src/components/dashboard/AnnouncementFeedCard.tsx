import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Megaphone, AlertTriangle, Info, RefreshCw } from "lucide-react";
import type { Announcement } from "@/hooks/useAnnouncements";

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-l-destructive",
  normal: "border-l-primary",
  low: "border-l-muted-foreground",
};

// La clave es el announcement_type guardado en la base (dato: no se traduce);
// `label` es la clave del diccionario de su etiqueta.
const TYPE_CONFIG: Record<string, { label: TranslationKey; icon: typeof Info }> = {
  informativo: { label: "shared.announcement.informativo", icon: Info },
  urgente: { label: "shared.announcement.urgente", icon: AlertTriangle },
  recordatorio: { label: "shared.announcement.recordatorio", icon: RefreshCw },
  actualizacion: { label: "shared.announcement.actualizacion", icon: Megaphone },
};

interface Props {
  announcement: Announcement;
  onOpen: (announcement: Announcement) => void;
  onVisible: (id: string) => void;
}

export default function AnnouncementFeedCard({ announcement, onOpen, onVisible }: Props) {
  const f = useFormato();
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);

  // IntersectionObserver - register view after 1 second visible
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            onVisible(announcement.id);
            observer.unobserve(el);
          }, 1000);
        } else {
          clearTimeout(timer);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [announcement.id, onVisible]);

  const typeConfig = TYPE_CONFIG[announcement.announcement_type] ?? TYPE_CONFIG.informativo;
  const TypeIcon = typeConfig.icon;
  const priorityBorder = PRIORITY_STYLES[announcement.priority] ?? PRIORITY_STYLES.normal;

  return (
    <div
      ref={ref}
      onClick={() => onOpen(announcement)}
      className={`flex items-start gap-3 rounded-lg border-l-[3px] bg-card p-3 cursor-pointer hover:bg-muted/50 transition-colors ${priorityBorder}`}
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <TypeIcon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{announcement.title}</p>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {t(typeConfig.label)}
          </Badge>
          {announcement.priority === "high" && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t("shared.announcement.urgente")}</Badge>
          )}
        </div>
        {announcement.message && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{announcement.message}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {format(new Date(announcement.starts_at), f.idioma === "en" ? "MMM d, yyyy" : "d MMM yyyy", { locale: f.fechas })}
        </p>
      </div>
      {announcement.image_url && (
        <img
          src={announcement.image_url}
          alt=""
          className="h-10 w-10 rounded object-cover shrink-0"
          loading="lazy"
        />
      )}
    </div>
  );
}
