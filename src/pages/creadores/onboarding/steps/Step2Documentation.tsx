import { useState } from "react";
import { Upload, FileText, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import FileUploadModal, { type UploadedFile } from "@/components/FileUploadModal";

export interface Step2Data {
  idDocuments: UploadedFile[];
  profilePhotos: UploadedFile[];
  dataConfirmed: boolean;
}

export interface Step2Errors {
  dataConfirmed?: string;
}

export function validateStep2(data: Step2Data): Step2Errors {
  const errors: Step2Errors = {};
  if (!data.dataConfirmed) errors.dataConfirmed = "Debe confirmar los datos";
  return errors;
}

interface Props {
  data: Step2Data;
  errors: Step2Errors;
  tempId: string;
  onChange: <K extends keyof Step2Data>(field: K, value: Step2Data[K]) => void;
}

export default function Step2Documentation({ data, errors, tempId, onChange }: Props) {
  const [uploadCategory, setUploadCategory] = useState<"contracts" | "extras" | null>(null);

  const handleFilesUploaded = (files: UploadedFile[]) => {
    if (uploadCategory === "contracts") {
      onChange("idDocuments", [...data.idDocuments, ...files]);
    } else {
      onChange("profilePhotos", [...data.profilePhotos, ...files]);
    }
  };

  const removeFile = (category: "idDocuments" | "profilePhotos", index: number) => {
    onChange(category, data[category].filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* ID Document Upload */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Documento de Identidad</Label>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setUploadCategory("contracts")}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Clic para subir documento de identidad</p>
        </div>
        {data.idDocuments.length > 0 && (
          <div className="space-y-1">
            {data.idDocuments.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate flex-1">{f.name}</span>
                <button onClick={() => removeFile("idDocuments", i)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Photo Upload */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Foto de Perfil</Label>
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setUploadCategory("extras")}
        >
          <ImageIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Clic para subir foto de perfil</p>
        </div>
        {data.profilePhotos.length > 0 && (
          <div className="space-y-1">
            {data.profilePhotos.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate flex-1">{f.name}</span>
                <button onClick={() => removeFile("profilePhotos", i)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation */}
      <div className="flex items-center gap-3 pt-2">
        <Checkbox
          id="confirm-data"
          checked={data.dataConfirmed}
          onCheckedChange={(v) => onChange("dataConfirmed", !!v)}
        />
        <div>
          <Label htmlFor="confirm-data" className="cursor-pointer">Confirmo que los datos proporcionados son correctos</Label>
          {errors.dataConfirmed && <p className="text-xs text-destructive mt-1">{errors.dataConfirmed}</p>}
        </div>
      </div>

      {/* Verification Status */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Estado de verificación:</span>
        <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10">Pendiente</Badge>
      </div>

      {uploadCategory && (
        <FileUploadModal
          open={!!uploadCategory}
          onClose={() => setUploadCategory(null)}
          category={uploadCategory}
          tempId={tempId}
          onFilesUploaded={handleFilesUploaded}
        />
      )}
    </div>
  );
}
