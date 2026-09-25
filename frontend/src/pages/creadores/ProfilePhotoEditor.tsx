import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — coincide con el límite del bucket
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  creatorId: string;
  photoUrl: string | null | undefined;
  initials: string;
  instagramHandle: string | null | undefined;
  /** Sólo el staff (no agentes) puede editar la foto. */
  canEdit: boolean;
}

const ProfilePhotoEditor = ({ creatorId, photoUrl, initials, instagramHandle, canEdit }: Props) => {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "upload" | "instagram">(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["creator", creatorId] });
    qc.invalidateQueries({ queryKey: ["creators"] });
  };

  // ── Subir foto MANUAL (hover sobre la foto → abre el selector de archivos) ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-seleccionar el mismo archivo
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      toast.error(t("creadores.photo.badFormat"), { description: t("creadores.photo.badFormatDesc") });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t("creadores.photo.tooBig"), { description: t("creadores.photo.tooBigDesc") });
      return;
    }

    setBusy("upload");
    try {
      const form = new FormData();
      form.append("creator_id", creatorId);
      form.append("file", file);
      const { data, error } = await supabase.functions.invoke("creator-avatar-fetch", { body: form });
      const res = data as { ok?: boolean; error?: string } | null;
      if (error) throw new Error(error.message);
      if (!res?.ok) throw new Error(res?.error || t("creadores.photo.uploadFailedDot"));
      refresh();
      toast.success(t("creadores.photo.updated"));
    } catch (err) {
      toast.error(t("creadores.photo.uploadFailed"), { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // ── Actualizar foto AUTOMÁTICA desde Instagram (Apify), botón debajo ────────
  const fetchFromInstagram = async () => {
    setBusy("instagram");
    try {
      const { data, error } = await supabase.functions.invoke("creator-avatar-fetch", {
        body: { creator_id: creatorId },
      });
      const res = data as { ok?: boolean; error?: string } | null;
      if (error) throw new Error(error.message);
      if (!res?.ok) throw new Error(res?.error || t("creadores.photo.igFailedDot"));
      refresh();
      toast.success(t("creadores.photo.igUpdated"));
    } catch (err) {
      toast.error(t("creadores.photo.igFailed"), { description: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const loading = busy !== null;

  const avatar = (
    <Avatar className="h-24 w-24 shrink-0">
      {photoUrl && <AvatarImage src={photoUrl} />}
      <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
    </Avatar>
  );

  if (!canEdit) return avatar;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* Foto: al pasar el cursor aparece el overlay para SUBIR MANUAL */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        aria-label={t("creadores.photo.uploadAria")}
        title={t("creadores.photo.uploadTitle")}
        className="group relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed"
      >
        {avatar}
        <span
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-black/55 transition-opacity ${
            loading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          ) : (
            <>
              <Camera className="h-5 w-5 text-white" />
              <span className="text-[10px] font-medium leading-none text-white">{t("creadores.photo.upload")}</span>
            </>
          )}
        </span>
      </button>

      {/* Botón debajo de la foto: ACTUALIZAR AUTOMÁTICO desde Instagram (Apify) */}
      {instagramHandle && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchFromInstagram}
          disabled={loading}
          title={t("creadores.photo.igTitle")}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          {busy === "instagram" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <InstagramIcon className="h-3.5 w-3.5" />
          )}
          {t("creadores.photo.refresh")}
        </Button>
      )}
    </div>
  );
};

export default ProfilePhotoEditor;
