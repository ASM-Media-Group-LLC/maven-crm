import { useState } from "react";
import { Upload, FileText, ImageIcon, X, Gift, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import FileUploadModal, { type UploadedFile } from "@/components/FileUploadModal";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";

export interface Step2Data {
  idDocuments: UploadedFile[];
  profilePhotos: UploadedFile[];
  dataConfirmed: boolean;
  wishlistUrl: string;
  instagramHandle: string;
  tiktokHandle: string;
  twitterHandle: string;
  onlyfansUrl: string;
  otrasPlataformas: string;
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

      {/* Wishlist */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Wishlist</Label>
        </div>
        <Input
          placeholder="https://amazon.com/hz/wishlist/ls/..."
          value={data.wishlistUrl}
          onChange={(e) => onChange("wishlistUrl", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Link de Wishlist de Amazon</p>
      </div>

      {/* Social Media Links */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Redes Sociales (Verificación de Identidad)</Label>
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
