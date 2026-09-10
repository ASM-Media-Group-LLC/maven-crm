import { useRef, useState } from "react";
import { ImagePlus, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUploadScreenshot } from "@/hooks/useSpammerTasks";

// ─── Props ────────────────────────────────────────────────────────────────

interface ScreenshotUploadProps {
  taskId: string;
  assignmentId: string;
  leadId: string;
  fromAccountId: string;
  assignmentDate: string; // "YYYY-MM-DD"
  onUploaded: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export const ScreenshotUpload = ({
  taskId,
  assignmentId,
  leadId,
  fromAccountId,
  assignmentDate,
  onUploaded,
}: ScreenshotUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const uploadMut = useUploadScreenshot();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    // Generate preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    await uploadMut.mutateAsync({
      file: selectedFile,
      taskId,
      assignmentId,
      leadId,
      fromAccountId,
      date: assignmentDate,
    });
    // Clean up preview blob URL
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedFile(null);
    onUploaded();
  };

  const isUploading = uploadMut.isPending;
  const isSuccess = uploadMut.isSuccess;

  // ── Success state ──
  if (isSuccess) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">Screenshot subido</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* ── File picker trigger ── */}
      {!selectedFile && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <ImagePlus className="h-4 w-4 shrink-0" />
          <span>Adjuntar screenshot del comentario</span>
        </button>
      )}

      {/* ── Preview + upload row ── */}
      {selectedFile && !isUploading && (
        <div className="flex items-center gap-2">
          {/* Thumbnail */}
          {preview && (
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
              <img src={preview} alt="preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={handleClearFile}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Quitar imagen"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <span className="truncate text-xs text-muted-foreground">{selectedFile.name}</span>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={handleUpload}>
              Subir screenshot
            </Button>
          </div>
        </div>
      )}

      {/* ── Uploading state ── */}
      {isUploading && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>Subiendo...</span>
        </div>
      )}

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
};
