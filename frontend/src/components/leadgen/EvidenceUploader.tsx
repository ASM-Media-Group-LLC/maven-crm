// EvidenceUploader — bloque reusable para subir screenshots de evidencia.
//
// Usado en AddLeadModal (min 0, max 4) y en AddContactoModal (min 4, max 8).
// Soporta tres formas de cargar:
//   1. Click en el botón → file picker tradicional
//   2. Drag & drop sobre la zona
//   3. Ctrl+V / Cmd+V con una imagen en el clipboard (pegada de screenshot,
//      navegador, etc.)
//
// El paste handler escucha el evento 'paste' a nivel document mientras
// el componente está montado y el modal está abierto. Filtra solo items
// de tipo imagen; texto pegado al input de notas no triggea esto.
//
// Renderea thumbnails con preview (URL.createObjectURL) — limpia las URLs
// al desmontar para evitar memory leaks.

import { useEffect, useRef, useState, useCallback } from "react";
import { Upload, X, Image as ImageIcon, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  files: File[];
  onFilesChange: (files: File[]) => void;
  /** Mínimo requerido. Si > 0, el componente muestra warning hasta cumplir. */
  minFiles?: number;
  /** Tope superior. Default 8. */
  maxFiles?: number;
  /** Label opcional sobre el bloque (e.g. "Evidencia del primer contacto").
   *  Sin label dice "Evidencia" en el idioma de la interfaz; "" lo esconde. */
  label?: string;
  /** Descripción opcional debajo del label. */
  description?: string;
  /** Si paste handler está activo. Default true. Apagar si hay conflicto con otro listener. */
  enablePaste?: boolean;
  /** Tipos de archivo aceptados. Default "image/*". */
  accept?: string;
}

const EvidenceUploader = ({
  files,
  onFilesChange,
  minFiles = 0,
  maxFiles = 8,
  label: labelProp,
  description,
  enablePaste = true,
  accept = "image/*",
}: Props) => {
  const { t } = useLanguage();
  const label = labelProp ?? t("leadgen.uploader.defaultLabel");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Map<File, string>>(new Map());
  const [recentPaste, setRecentPaste] = useState(false);

  // Generar/limpiar object URLs cuando files cambia. Cada File obtiene
  // su URL una sola vez — re-renderear no debería re-crear blobs.
  useEffect(() => {
    const newMap = new Map<File, string>();
    files.forEach((f) => {
      const existing = previewUrls.get(f);
      if (existing) {
        newMap.set(f, existing);
      } else {
        newMap.set(f, URL.createObjectURL(f));
      }
    });
    // Revoca URLs de archivos que se quitaron.
    previewUrls.forEach((url, file) => {
      if (!newMap.has(file)) URL.revokeObjectURL(url);
    });
    setPreviewUrls(newMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      const merged = [...files, ...newFiles].slice(0, maxFiles);
      onFilesChange(merged);
    },
    [files, maxFiles, onFilesChange],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected) return;
    addFiles(Array.from(selected));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  // ─── Paste handler ────────────────────────────────────────────────────
  // Escucha paste a nivel document. Filtra solo items de imagen para no
  // interferir con paste de texto en inputs. Si el componente no está
  // habilitado o ya llegamos al max, ignora.
  useEffect(() => {
    if (!enablePaste) return;

    const handler = (e: ClipboardEvent) => {
      // Si están pegando texto en un input/textarea, no interceptamos.
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        // Pero SÍ procesamos si el clipboard tiene imágenes — el user
        // pegó una captura con foco en otro campo, lo agregamos igual.
        // Para no romper el paste del texto, solo prevenimos default si
        // encontramos imágenes válidas.
      }
      if (!e.clipboardData) return;

      const items = Array.from(e.clipboardData.items);
      const imageFiles = items
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => {
          const f = item.getAsFile();
          if (!f) return null;
          // Renombrar pasted images con timestamp para que tengan algo más
          // legible que "image.png". El nombre termina en la ruta del bucket
          // (es dato): "pegado-" no cambia con el idioma.
          const ext = f.type.split("/")[1] ?? "png";
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          return new File([f], `pegado-${ts}.${ext}`, { type: f.type });
        })
        .filter((f): f is File => !!f);

      if (imageFiles.length === 0) return;

      e.preventDefault();
      if (files.length >= maxFiles) return;
      addFiles(imageFiles);
      setRecentPaste(true);
      setTimeout(() => setRecentPaste(false), 1500);
    };

    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [enablePaste, files.length, maxFiles, addFiles]);

  // ─── Drag & drop handlers ─────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (dropped.length === 0) return;
    addFiles(dropped);
  };

  // ─── UI state ─────────────────────────────────────────────────────────
  const remaining = Math.max(0, minFiles - files.length);
  const isFull = files.length >= maxFiles;
  const minNotMet = files.length < minFiles;

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            {label}
            {minFiles > 0 && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <span
            className={cn(
              "text-xs tabular-nums",
              minNotMet ? "text-destructive font-medium" : "text-muted-foreground",
            )}
          >
            {files.length}/{maxFiles}
            {minFiles > 0 && minNotMet && t("leadgen.uploader.missing", { count: remaining })}
          </span>
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drop zone + botón. Cuando hay archivos, la zona se contrae a un
          botón pequeño arriba de los thumbnails. */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : minNotMet
              ? "border-destructive/50"
              : "border-border",
          recentPaste && "ring-2 ring-primary/40",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          className="w-full h-auto flex flex-col items-center gap-1.5 py-4"
          disabled={isFull}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex items-center gap-2 text-sm">
            <Upload className="h-4 w-4" />
            <span>{isFull ? t("leadgen.uploader.full") : t("leadgen.uploader.uploadOrPaste")}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              {t("leadgen.uploader.clickToChoose")}
            </span>
            <span>·</span>
            <span>{t("leadgen.uploader.dragAndDrop")}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <ClipboardPaste className="h-3 w-3" />
              Cmd/Ctrl+V
            </span>
          </div>
        </Button>
      </div>

      {/* Thumbnails grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {files.map((file, i) => {
            const url = previewUrls.get(file);
            return (
              <div
                key={`${file.name}-${i}`}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                {url ? (
                  <img
                    src={url}
                    alt={file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                  title={t("leadgen.uploader.remove")}
                  aria-label={t("leadgen.uploader.remove")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                  {file.name}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {minNotMet && (
        <p className="text-xs text-destructive">
          {t(minFiles === 1 ? "leadgen.uploader.needAtLeast.one" : "leadgen.uploader.needAtLeast.other", { count: minFiles })}
        </p>
      )}
    </div>
  );
};

export default EvidenceUploader;
