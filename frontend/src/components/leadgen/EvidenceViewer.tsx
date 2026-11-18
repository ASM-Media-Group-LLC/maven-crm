// EvidenceViewer — bloque para MOSTRAR los screenshots de evidencia que
// se subieron via EvidenceUploader.
//
// Soporta dos sources, controlado por `entityType`:
//   · "lead"    → query a leadgen_evidence_files filtrando por entry_id
//   · "contact" → query a closers_contacts_evidence_files filtrando por contact_id
//
// Renderea thumbnails clickeables. Click abre overlay fullscreen con la
// imagen completa + nombre + fecha de upload + botón descargar.
//
// Si no hay archivos, muestra estado vacío.

import { formatUI } from "@/lib/formatoHora";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ImageIcon, Loader2, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";

interface EvidenceFile {
  id: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
}

interface Props {
  entityType: "lead" | "contact";
  entityId: string | null | undefined;
  /** Nombre de quien subió, opcional — si lo sabemos de afuera, lo
   *  mostramos sin un round-trip extra. */
  uploaderNameHint?: string;
}

const EvidenceViewer = ({ entityType, entityId, uploaderNameHint }: Props) => {
  const formato = useFormato();
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const tableName =
    entityType === "lead"
      ? "leadgen_evidence_files"
      : "closers_contacts_evidence_files";
  const fkColumn = entityType === "lead" ? "leadgen_entry_id" : "contact_id";

  const evidenceQ = useQuery({
    queryKey: ["evidence", entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<EvidenceFile[]> => {
      if (!entityId) return [];
      const { data, error } = await supabase
        .from(tableName as never)
        .select("id, file_url, file_type, uploaded_at, uploaded_by")
        .eq(fkColumn as never, entityId)
        .order("uploaded_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EvidenceFile[];
    },
  });

  const files = evidenceQ.data ?? [];
  const isLoading = evidenceQ.isLoading;

  if (!entityId) return null;

  // En inglés, mes antes que día ("Sep 5"); en español, como siempre ("5 sep").
  const enIngles = formato.idioma === "en";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          {t("leadgen.viewer.title")} {files.length > 0 ? `(${files.length})` : ""}
        </h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("leadgen.viewer.loading")}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground text-center">
          {entityType === "lead" ? t("leadgen.viewer.emptyLead") : t("leadgen.viewer.emptyContact")}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {files.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpenIndex(idx)}
              className="group relative aspect-square overflow-hidden rounded-md border bg-muted hover:ring-2 hover:ring-primary transition-all"
            >
              {f.file_type?.startsWith("image/") || !f.file_type ? (
                <img
                  src={f.file_url}
                  alt={t("leadgen.viewer.thumbAlt", { n: idx + 1 })}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-[10px]">{f.file_type}</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white">
                {formatUI(new Date(f.uploaded_at), enIngles ? "MMM d HH:mm" : "d MMM HH:mm", { locale: formato.fechas })}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen overlay con la imagen al clickear un thumbnail */}
      {openIndex !== null && files[openIndex] && (
        <Dialog open={openIndex !== null} onOpenChange={(o) => !o && setOpenIndex(null)}>
          <DialogContent className="max-w-5xl p-2 sm:p-4">
            <div className="space-y-3">
              <div className="flex h-[70vh] items-center justify-center overflow-hidden rounded-md bg-black/80">
                <img
                  src={files[openIndex].file_url}
                  alt={t("leadgen.viewer.imageAlt")}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t("leadgen.viewer.imageOf", { index: openIndex + 1, total: files.length })}
                  {" · "}
                  {t("leadgen.viewer.uploaded", {
                    date: formatUI(new Date(files[openIndex].uploaded_at), enIngles ? "MMM d, yyyy HH:mm" : "d MMM yyyy HH:mm", {
                      locale: formato.fechas,
                    }),
                  })}
                  {uploaderNameHint && t("leadgen.viewer.by", { name: uploaderNameHint })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenIndex(openIndex === 0 ? files.length - 1 : openIndex - 1)}
                    disabled={files.length <= 1}
                  >
                    ← {t("common.previous")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenIndex(openIndex === files.length - 1 ? 0 : openIndex + 1)}
                    disabled={files.length <= 1}
                  >
                    {t("common.next")} →
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={files[openIndex].file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {t("common.download")}
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default EvidenceViewer;
