import { useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { Paperclip, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Announcement } from "@/hooks/useAnnouncements";

interface Props {
  announcement: Announcement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: (id: string) => void;
}

export default function AnnouncementPublicDetail({ announcement, open, onOpenChange, onOpened }: Props) {
  const f = useFormato();
  useEffect(() => {
    if (open && announcement) {
      onOpened(announcement.id);
    }
  }, [open, announcement?.id]);

  if (!announcement) return null;

  const content = announcement.content_html || announcement.message || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-lg">{announcement.title}</DialogTitle>
            {announcement.priority === "high" && (
              <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(announcement.starts_at), f.idioma === "en" ? "MMMM d, yyyy, HH:mm" : "d 'de' MMMM yyyy, HH:mm", { locale: f.fechas })}
          </p>
        </DialogHeader>

        {announcement.image_url && (
          <img src={announcement.image_url} alt="" className="w-full rounded-lg object-cover max-h-60" />
        )}

        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {announcement.attachment_url && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1 truncate">{announcement.attachment_name || "Archivo adjunto"}</span>
            <Button variant="ghost" size="sm" asChild>
              <a href={announcement.attachment_url} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
