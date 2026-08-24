import { useState, useRef } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { dicebearUri } from "@/lib/avatar";

interface AvatarUploadProps {
  /** Current avatar URL */
  currentUrl?: string | null;
  /** avatar_seed elegido en Settings: si no hay foto subida, se dibuja el muñequito DiceBear
   *  (en vez de caer a iniciales), igual que <UserAvatar>. */
  seed?: string | null;
  /** Display name for initials fallback */
  displayName: string;
  /** Called with new URL after successful upload */
  onAvatarChanged: (url: string) => void;
  /** Size class */
  size?: "sm" | "md" | "lg";
  /** Whether the user can edit */
  editable?: boolean;
  /** For group avatars */
  isGroup?: boolean;
}

const sizeMap = {
  sm: "h-9 w-9",
  md: "h-14 w-14",
  lg: "h-20 w-20",
};

const iconSizeMap = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function AvatarUpload({
  currentUrl, seed, displayName, onAvatarChanged, size = "md", editable = true, isGroup = false,
}: AvatarUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB para la imagen de perfil");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `avatars/${user.id}/${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        toast.error("Error al subir imagen");
        return;
      }

      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
      onAvatarChanged(urlData.publicUrl);
      toast.success("Imagen actualizada");
    } catch {
      toast.error("Error inesperado");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="relative group inline-block">
      <Avatar className={cn(sizeMap[size], "ring-2 ring-border")}>
        {currentUrl && <AvatarImage src={currentUrl} alt={displayName} className="object-cover" />}
        {!currentUrl && seed ? (
          <AvatarFallback className="bg-secondary p-0">
            <img src={dicebearUri(seed)} alt={displayName} className="h-full w-full" draggable={false} />
          </AvatarFallback>
        ) : (
          <AvatarFallback className={cn(
            "font-semibold",
            isGroup ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary",
            size === "lg" ? "text-xl" : size === "md" ? "text-sm" : "text-xs"
          )}>
            {getInitials(displayName)}
          </AvatarFallback>
        )}
      </Avatar>

      {editable && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={cn(
              "absolute inset-0 rounded-full bg-black/40 flex items-center justify-center",
              "opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
              uploading && "opacity-100"
            )}
          >
            {uploading ? (
              <Loader2 className={cn(iconSizeMap[size], "text-white animate-spin")} />
            ) : (
              <Camera className={cn(iconSizeMap[size], "text-white")} />
            )}
          </button>
        </>
      )}
    </div>
  );
}
