// LeadScreenshots — capturas adjuntas a la nota de un lead del pipeline.
//
// Pedido de Álvaro (26/08): en Asignaciones, donde ponen las notas, poder pegar
// screenshots. Vive dentro del Popover de la columna "Notas" (InlineText en
// LeadTable), que mide 320px — por eso es compacto y no reusa EvidenceUploader,
// que está pensado para un modal ancho y devuelve File[] para que el caller
// decida cuándo subir. Acá no hay paso de "guardar": la captura se sube apenas
// se suelta, independiente del texto de la nota.
//
// Las URLs se firman al vuelo (1h) en vez de guardar una URL firmada a un año en
// la tabla, como hacen los uploaders de leadgen: con visibilidad por dueño del
// lead, una URL de larga duración es un token al portador que sobrevive a que le
// saquen el lead a alguien.
//
// El bucket closer-evidence es privado y sus políticas verifican propiedad del
// lead (ver migración 20260826120000_closer_lead_files.sql), así que un closer no
// puede leer ni subir capturas de un lead que no es suyo aunque conozca el path.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { SCREENSHOT_BUCKET as BUCKET, uploadLeadScreenshots } from "../leadScreenshots";

interface LeadFile {
  id: string;
  storage_path: string;
  file_name: string;
  created_at: string;
  vision_text: string | null;
}

// closer_lead_files es nueva y todavía no está en los tipos generados de Supabase.
// types.ts ya venía desactualizado para otras tablas (mail_folders, v_my_mailbox) y
// el archivo que genera el CLI viene en una sola línea de 560k chars contra las
// 18.065 líneas del comiteado, así que regenerarlo es una tarea aparte y no parte de
// esta feature. Mismo patrón que EvidenceViewer: se aísla el cast acá y el resto del
// componente trabaja contra LeadFile.
const TABLA = "closer_lead_files" as never;

const LeadScreenshots = ({ leadId }: { leadId: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dragOver, setDragOver] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filesQ = useQuery({
    queryKey: ["lead-screenshots", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLA)
        .select("id, storage_path, file_name, created_at, vision_text")
        .eq("creator_id" as never, leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LeadFile[];
    },
  });

  const rows = filesQ.data ?? [];

  // Firmamos en un solo round-trip y las refrescamos antes de que caduquen.
  const urlsQ = useQuery({
    queryKey: ["lead-screenshots-urls", leadId, rows.map((r) => r.id).join(",")],
    enabled: rows.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), 3600);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d, i) => {
        if (d.signedUrl) map[rows[i].storage_path] = d.signedUrl;
      });
      return map;
    },
  });

  const urls = urlsQ.data ?? {};

  const subir = useMutation({
    // Lógica compartida con el formulario de "registrar contacto" (SeguimientoCell):
    // valida, sube a closer-evidence, inserta en closer_lead_files y dispara el análisis.
    mutationFn: (files: File[]) => uploadLeadScreenshots(leadId, files),
    onSuccess: (_d, files) => {
      qc.invalidateQueries({ queryKey: ["lead-screenshots", leadId] });
      toast({ description: `${files.length} captura${files.length > 1 ? "s" : ""} adjunta${files.length > 1 ? "s" : ""}` });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "No se pudo adjuntar", description: e.message }),
  });

  const borrar = useMutation({
    mutationFn: async (f: LeadFile) => {
      const { error } = await supabase.from(TABLA).delete().eq("id" as never, f.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([f.storage_path]);
    },
    onSuccess: () => {
      setAbierta(null);
      qc.invalidateQueries({ queryKey: ["lead-screenshots", leadId] });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", title: "No se pudo borrar", description: e.message }),
  });

  const agregar = useCallback(
    (lista: FileList | File[] | null) => {
      const arr = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
      if (arr.length) subir.mutate(arr);
    },
    [subir],
  );

  // Ctrl/Cmd+V con una captura en el portapapeles. Solo mira items de imagen, así
  // que pegar texto dentro del textarea de la nota no dispara nada.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.items ?? [])
        .filter((i) => i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f);
      if (imgs.length) {
        e.preventDefault();
        agregar(imgs);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [agregar]);

  const activa = abierta !== null ? rows[abierta] : null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {rows.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setAbierta(i)}
            title={f.vision_text ? f.vision_text.slice(0, 200) : f.file_name}
            className="h-11 w-11 overflow-hidden rounded border border-border bg-muted transition-opacity hover:opacity-80"
          >
            {urls[f.storage_path] ? (
              <img src={urls[f.storage_path]} alt={f.file_name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); agregar(e.dataTransfer.files); }}
          disabled={subir.isPending}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded border border-dashed text-muted-foreground transition-colors",
            dragOver ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 hover:text-foreground",
            subir.isPending && "opacity-60",
          )}
          title="Adjuntar captura — click, arrastrar o Ctrl+V"
        >
          {subir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { agregar(e.target.files); e.target.value = ""; }}
        />
      </div>

      <p className="text-[10px] leading-tight text-muted-foreground">
        {rows.length === 0
          ? "Adjuntá capturas: click, arrastrá o pegá con ⌘/Ctrl+V"
          : `${rows.length} captura${rows.length > 1 ? "s" : ""} · solo vos y quien tenga este lead pueden verlas`}
      </p>

      <Dialog open={activa !== null} onOpenChange={(o) => !o && setAbierta(null)}>
        <DialogContent className="max-w-3xl p-2">
          {activa && (
            <div className="space-y-2">
              <img
                src={urls[activa.storage_path]}
                alt={activa.file_name}
                className="max-h-[70vh] w-full rounded object-contain"
              />
              {activa.vision_text && (
                <p className="max-h-24 overflow-y-auto rounded bg-muted/50 p-2 text-xs text-muted-foreground">
                  {activa.vision_text}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{activa.file_name}</span>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={borrar.isPending}
                    onClick={() => borrar.mutate(activa)}
                  >
                    <Trash2 className="h-3 w-3" /> Borrar
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAbierta(null)}>
                    <X className="h-3 w-3" /> Cerrar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadScreenshots;
