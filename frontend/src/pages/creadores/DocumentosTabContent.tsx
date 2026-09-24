import { useState, useEffect, useCallback } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import FileUploadModal, { type UploadedFile } from "@/components/FileUploadModal";
import { useUserRole } from "@/hooks/useUserRole";
import { getSignedFileUrl } from "@/lib/storageHelpers";

const IDENTITY_DOC_TERMS = ["cedula", "cédula", "selfie", "identidad", "dni", "pasaporte", "documento de identidad"];

interface Props {
  creatorId: string;
}

function fileTypeLabel(type: string): string {
  if (type.includes("pdf")) return "PDF";
  if (type.startsWith("image/")) return "IMG";
  if (type.includes("word") || type.includes("doc")) return "DOC";
  if (type.startsWith("video/")) return "VID";
  return "FILE";
}

export default function DocumentosTabContent({ creatorId }: Props) {
  const formatoUi = useFormato();
  const qc = useQueryClient();
  const { isAgent } = useUserRole();
  const [showUpload, setShowUpload] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["creator_documents", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_documents")
        .select("id, file_name, file_type, file_url, uploaded_at")
        .eq("creator_id", creatorId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleFilesUploaded = async (files: UploadedFile[]) => {
    let successCount = 0;
    let errorCount = 0;
    for (const f of files) {
      const { error } = await supabase.from("creator_documents").insert({
        creator_id: creatorId,
        file_name: f.name,
        file_type: f.type,
        file_url: f.url,
      });
      if (error) {
        errorCount++;
        toast({ title: "Error al registrar documento", description: error.message, variant: "destructive" });
      } else {
        successCount++;
      }
    }
    if (successCount > 0) {
      toast({
        title: "Documento(s) registrado(s)",
        description: `${successCount} archivo(s) registrado(s) correctamente.`,
      });
    }
    qc.invalidateQueries({ queryKey: ["creator_documents", creatorId] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg font-semibold">Documentos</CardTitle>
          {!isAgent && (
            <Button size="sm" onClick={() => setShowUpload(true)}>
              <Upload className="mr-2 h-4 w-4" /> Subir Archivo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {(() => {
            const filteredDocs = isAgent
              ? (docs ?? []).filter(d => !IDENTITY_DOC_TERMS.some(term => d.file_name.toLowerCase().includes(term)))
              : docs ?? [];
            return filteredDocs.length > 0 ? (
            <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{d.file_name}</span>
                    </TableCell>
                    <TableCell>{fileTypeLabel(d.file_type)}</TableCell>
                    <TableCell>
                      {d.uploaded_at ? format(new Date(d.uploaded_at), "dd MMM yyyy", { locale: formatoUi.fechas }) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const url = await getSignedFileUrl(d.file_url);
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <EmptyState seed="creador-documentos" title="No hay documentos" />
          );
          })()}
        </CardContent>
      </Card>

      <FileUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        category="contracts"
        tempId={creatorId}
        onFilesUploaded={handleFilesUploaded}
      />
    </>
  );
}
