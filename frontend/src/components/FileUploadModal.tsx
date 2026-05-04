import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, ImageIcon, Film } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type UploadCategory = "contracts" | "piclink" | "extras";

export interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
  category: UploadCategory;
}

interface FileUploadModalProps {
  open: boolean;
  onClose: () => void;
  category: UploadCategory;
  tempId: string;
  onFilesUploaded: (files: UploadedFile[]) => void;
}

const CATEGORY_CONFIG: Record<UploadCategory, { title: string; accept: string; formats: string; maxSize: number }> = {
  contracts: {
    title: "Contrato Firmado & Documentos",
    accept: ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp",
    formats: "PDF, Word (.doc, .docx) e Imágenes (JPG, PNG, GIF)",
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  piclink: {
    title: "Fotos de PickLink (Comprobante)",
    accept: ".jpg,.jpeg,.png,.gif,.webp",
    formats: "Imágenes (JPG, PNG, GIF, WebP)",
    maxSize: 10 * 1024 * 1024,
  },
  extras: {
    title: "Fotos y Videos Extras",
    accept: ".jpg,.jpeg,.png,.gif,.webp,.mp4,.mov",
    formats: "Imágenes (JPG, PNG, GIF) y Videos (MP4, MOV)",
    maxSize: 20 * 1024 * 1024, // 20MB
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-primary" />;
  if (type.startsWith("video/")) return <Film className="h-4 w-4 text-primary" />;
  return <FileText className="h-4 w-4 text-primary" />;
}

export default function FileUploadModal({ open, onClose, category, tempId, onFilesUploaded }: FileUploadModalProps) {
  const config = CATEGORY_CONFIG[category];
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid: File[] = [];
    for (const f of arr) {
      if (f.size > config.maxSize) {
        toast({ title: "Archivo muy grande", description: `${f.name} excede ${formatSize(config.maxSize)}`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setSelectedFiles((prev) => [...prev, ...valid]);
  }, [config.maxSize]);

  const removeFile = (index: number) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    if (!selectedFiles.length) return;
    setUploading(true);
    setProgress(0);

    const uploaded: UploadedFile[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const ts = Date.now();
      const path = `${tempId}/${category}/${ts}_${file.name}`;

      const { error } = await supabase.storage.from("creator-files").upload(path, file);
      if (error) {
        toast({ title: "Error al subir", description: `${file.name}: ${error.message}`, variant: "destructive" });
        continue;
      }

      // Store path, generate signed URL for immediate use
      const { data: signedData } = await supabase.storage.from("creator-files").createSignedUrl(path, 3600);
      const fileUrl = signedData?.signedUrl || path;
      uploaded.push({
        name: file.name,
        url: fileUrl,
        type: file.type,
        size: file.size,
        category,
      });

      setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
    }

    if (uploaded.length) {
      onFilesUploaded(uploaded);
      toast({ title: `${uploaded.length} archivo(s) subido(s) exitosamente` });
    }

    setSelectedFiles([]);
    setUploading(false);
    setProgress(0);
    onClose();
  };

  const handleClose = () => {
    if (!uploading) {
      setSelectedFiles([]);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> {config.title}
          </DialogTitle>
          <DialogDescription>Selecciona o arrastra archivos para subir</DialogDescription>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Arrastra archivos aquí o</p>
          <Button variant="outline" size="sm" className="mt-2" type="button"
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            Seleccionar archivos
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Formatos: {config.formats}</p>
          <p className="text-xs text-muted-foreground">Máximo {formatSize(config.maxSize)} por archivo</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={config.accept}
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2 max-h-40 overflow-auto">
            <p className="text-sm font-medium">Archivos seleccionados ({selectedFiles.length})</p>
            {selectedFiles.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  {getFileIcon(f.type)}
                  <span className="truncate">{f.name}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{formatSize(f.size)}</span>
                </div>
                <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive ml-2" disabled={uploading}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">Subiendo... {progress}%</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={uploading || !selectedFiles.length}>
            <Upload className="mr-2 h-4 w-4" /> {uploading ? "Subiendo…" : "Subir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
