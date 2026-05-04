import { useRef, useState, useEffect } from "react";
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Film, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskAttachments, type TaskAttachment } from "./useTaskAttachments";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  taskId: string;
}

const isImage = (type: string) => type.startsWith("image/");
const isVideo = (type: string) => type.startsWith("video/");

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TaskAttachmentsSection = ({ taskId }: Props) => {
  const { attachments, isLoading, uploadAttachment, deleteAttachment } = useTaskAttachments(taskId);
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Generate signed URLs for display
  useEffect(() => {
    const generateUrls = async () => {
      const urls: Record<string, string> = {};
      for (const att of attachments) {
        if (isImage(att.file_type) || isVideo(att.file_type)) {
          const { data } = await supabase.storage
            .from("task-files")
            .createSignedUrl(att.file_url, 3600);
          if (data?.signedUrl) urls[att.id] = data.signedUrl;
        }
      }
      setSignedUrls(urls);
    };
    if (attachments.length > 0) generateUrls();
  }, [attachments]);

  const handleDownload = async (att: TaskAttachment) => {
    const { data } = await supabase.storage
      .from("task-files")
      .createSignedUrl(att.file_url, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadAttachment.mutate(f));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Adjuntos ({attachments.length})
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadAttachment.isPending}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {uploadAttachment.isPending ? "Subiendo..." : "Subir archivo"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando adjuntos...</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin adjuntos aún.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative border rounded-lg overflow-hidden bg-muted/30 hover:border-primary/40 transition-colors"
            >
              {/* Thumbnail */}
              {isImage(att.file_type) && signedUrls[att.id] ? (
                <img
                  src={signedUrls[att.id]}
                  alt={att.file_name}
                  className="w-full h-24 object-cover cursor-pointer"
                  onClick={() => handleDownload(att)}
                />
              ) : isVideo(att.file_type) && signedUrls[att.id] ? (
                <video
                  src={signedUrls[att.id]}
                  className="w-full h-24 object-cover cursor-pointer"
                  onClick={() => handleDownload(att)}
                />
              ) : (
                <div
                  className="w-full h-24 flex items-center justify-center cursor-pointer"
                  onClick={() => handleDownload(att)}
                >
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Info bar */}
              <div className="px-2 py-1.5 flex items-center gap-1.5 min-w-0">
                {isImage(att.file_type) ? (
                  <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : isVideo(att.file_type) ? (
                  <Film className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="text-[11px] truncate flex-1">{att.file_name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(att.file_size)}</span>
              </div>

              {/* Actions overlay */}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleDownload(att)}
                  className="h-6 w-6 rounded bg-background/80 flex items-center justify-center hover:bg-background"
                >
                  <Download className="h-3 w-3" />
                </button>
                {(att.uploaded_by === user?.id) && (
                  <button
                    onClick={() => deleteAttachment.mutate(att)}
                    className="h-6 w-6 rounded bg-background/80 flex items-center justify-center hover:bg-destructive/20"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskAttachmentsSection;
