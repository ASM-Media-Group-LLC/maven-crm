import { useState } from "react";
import { Upload, FileText, ImageIcon, X, Gift, Globe, Info, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import FileUploadModal, { type UploadedFile } from "@/components/FileUploadModal";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";

export interface Step2Data {
  idDocumentFront: UploadedFile[];
  idDocumentBack: UploadedFile[];
  selfieDocument: UploadedFile[];
  profilePhotos: UploadedFile[];
  dataConfirmed: boolean;
  wishlistUrl: string;
  instagramHandle: string;
  tiktokHandle: string;
  twitterHandle: string;
  onlyfansUrl: string;
  otrasPlataformas: string;
  linkOtrasPlataformas: string;
}

export interface Step2Errors {
  dataConfirmed?: string;
}

export function validateStep2(data: Step2Data): Step2Errors {
  const errors: Step2Errors = {};
  if (!data.dataConfirmed) errors.dataConfirmed = "Debe confirmar los datos";
  return errors;
}

type UploadTarget = "id-front" | "id-back" | "selfie" | "extras";

interface Props {
  data: Step2Data;
  errors: Step2Errors;
  tempId: string;
  onChange: <K extends keyof Step2Data>(field: K, value: Step2Data[K]) => void;
}

function DocUploader({
  label,
  icon: Icon,
  files = [],
  fieldKey,
  optional,
  onClickUpload,
  onRemove,
}: {
  label: string;
  icon: React.ElementType;
  files: UploadedFile[];
  fieldKey: string;
  optional?: boolean;
  onClickUpload: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {optional && <span className="text-muted-foreground ml-1 text-xs">(Opcional)</span>}
      </Label>
      <div
        className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={onClickUpload}
      >
        <Icon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Clic para subir</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Step2Documentation({ data, errors, tempId, onChange }: Props) {
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);

  const targetFieldMap: Record<Exclude<UploadTarget, "extras">, keyof Step2Data> = {
    "id-front": "idDocumentFront",
    "id-back": "idDocumentBack",
    "selfie": "selfieDocument",
  };

  const handleFilesUploaded = (files: UploadedFile[]) => {
    if (!uploadTarget) return;
    if (uploadTarget === "extras") {
      onChange("profilePhotos", [...data.profilePhotos, ...files]);
    } else {
      const field = targetFieldMap[uploadTarget];
      onChange(field, [...(data[field] as UploadedFile[]), ...files]);
    }
  };

  const removeFile = (field: keyof Step2Data, index: number) => {
    onChange(field, (data[field] as UploadedFile[]).filter((_, i) => i !== index));
  };

  const modalCategory = uploadTarget && uploadTarget !== "extras" ? "contracts" : "extras";

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ID Document Uploaders — 3 separate */}
        <div className="space-y-4">
          <Label className="text-sm font-semibold">Documento de Identidad</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DocUploader
              label="Frente"
              icon={Upload}
              files={data.idDocumentFront}
              fieldKey="idDocumentFront"
              onClickUpload={() => setUploadTarget("id-front")}
              onRemove={(i) => removeFile("idDocumentFront", i)}
            />
            <DocUploader
              label="Reverso"
              icon={Upload}
              files={data.idDocumentBack}
              fieldKey="idDocumentBack"
              onClickUpload={() => setUploadTarget("id-back")}
              onRemove={(i) => removeFile("idDocumentBack", i)}
            />
            <DocUploader
              label="Selfie con Documento"
              icon={Camera}
              files={data.selfieDocument}
              fieldKey="selfieDocument"
              optional
              onClickUpload={() => setUploadTarget("selfie")}
              onRemove={(i) => removeFile("selfieDocument", i)}
            />
          </div>
        </div>

        {/* Profile Photo Upload */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Foto de Perfil</Label>
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setUploadTarget("extras")}
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

        {/* Wishlist with tooltip */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">Wishlist</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Facilita que tus fans te envíen regalos. Es una de las formas más efectivas de generar ingresos extra sin esfuerzo.
              </TooltipContent>
            </Tooltip>
          </div>
          <Input
            placeholder="https://amazon.com/hz/wishlist/ls/..."
            value={data.wishlistUrl}
            onChange={(e) => onChange("wishlistUrl", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Link de Wishlist de Amazon</p>
        </div>

        {/* Social Media Links with tooltip */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium">Redes Sociales (Verificación de Identidad)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Nos ayudan a estudiar tu estilo de comunicación actual para replicar tu voz con precisión en el chat.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-xs text-muted-foreground">Estos links nos ayudan a verificar tu identidad</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <InstagramIcon className="h-3.5 w-3.5" /> Instagram
              </Label>
              <Input
                placeholder="@usuario"
                value={data.instagramHandle}
                onChange={(e) => onChange("instagramHandle", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <TikTokIcon className="h-3.5 w-3.5" /> TikTok
              </Label>
              <Input
                placeholder="@usuario"
                value={data.tiktokHandle}
                onChange={(e) => onChange("tiktokHandle", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <XIcon className="h-3.5 w-3.5" /> Twitter / X
              </Label>
              <Input
                placeholder="@usuario"
                value={data.twitterHandle}
                onChange={(e) => onChange("twitterHandle", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">OnlyFans URL</Label>
              <Input
                placeholder="https://onlyfans.com/usuario"
                value={data.onlyfansUrl}
                onChange={(e) => onChange("onlyfansUrl", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Otras plataformas donde vendes contenido</Label>
            <Textarea
              placeholder="Fansly, Chaturbate, etc."
              value={data.otrasPlataformas}
              onChange={(e) => onChange("otrasPlataformas", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">URLs exactas de otras plataformas</Label>
            <Input
              type="url"
              placeholder="https://fansly.com/usuario, https://chaturbate.com/usuario"
              value={data.linkOtrasPlataformas}
              onChange={(e) => onChange("linkOtrasPlataformas", e.target.value)}
            />
          </div>
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

        {uploadTarget && (
          <FileUploadModal
            open={!!uploadTarget}
            onClose={() => setUploadTarget(null)}
            category={modalCategory as any}
            tempId={tempId}
            onFilesUploaded={handleFilesUploaded}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
