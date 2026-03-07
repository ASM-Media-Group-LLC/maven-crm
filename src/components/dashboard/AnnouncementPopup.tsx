import { useState, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Paperclip, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Announcement } from "@/hooks/useAnnouncements";
import { useViewedAnnouncements, useRecordAnnouncementOpen } from "@/hooks/useAnnouncements";

interface Props {
  popups: Announcement[];
}

export default function AnnouncementPopup({ popups }: Props) {
  const popupIds = useMemo(() => popups.map((p) => p.id), [popups]);
  const { data: viewedSet } = useViewedAnnouncements(popupIds);
  const recordOpen = useRecordAnnouncementOpen();

  const unseen = useMemo(() => {
    if (!viewedSet) return [];
    return popups.filter((p) => !viewedSet.has(p.id));
  }, [popups, viewedSet]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (unseen.length > 0 && !open) {
      setCurrentIndex(0);
      setOpen(true);
    }
  }, [unseen.length]);

  const current = unseen[currentIndex];

  const handleAck = async () => {
    if (current) {
      await recordOpen(current.id);
    }
    if (currentIndex < unseen.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setOpen(false);
    }
  };

  if (!current) return null;

  const content = current.content_html || current.message || "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-lg">{current.title}</DialogTitle>
            {current.priority === "high" && (
              <Badge variant="destructive" className="text-[10px]">Urgente</Badge>
            )}
          </div>
        </DialogHeader>

        {current.image_url && (
          <img src={current.image_url} alt="" className="w-full rounded-lg object-cover max-h-60" />
        )}

        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {current.attachment_url && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm flex-1 truncate">{current.attachment_name || "Archivo adjunto"}</span>
            <Button variant="ghost" size="sm" asChild>
              <a href={current.attachment_url} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}

        <DialogFooter>
          {unseen.length > 1 && (
            <p className="text-xs text-muted-foreground mr-auto">
              {currentIndex + 1} de {unseen.length}
            </p>
          )}
          <Button onClick={handleAck}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
