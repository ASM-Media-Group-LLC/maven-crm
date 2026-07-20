import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Helpers for the signed-in user's own profile row in `profiles`. The
// existing useAdminUsers hook covers admin-side fetching of every user;
// this is the lightweight self-only equivalent for /settings.

const sanitize = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `avatar-${Date.now()}`;

export interface MyProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_e164: string | null;
  whatsapp_push_name: string | null;
  whatsapp_verified_at: string | null;
}

export const useMyProfile = () =>
  useQuery({
    queryKey: ["my-profile"],
    queryFn: async (): Promise<MyProfile | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, phone_e164, whatsapp_push_name, whatsapp_verified_at")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data as MyProfile | null) ?? null;
    },
  });

// Pide un código de verificación NUEVO. Flujo iniciado por el usuario: la edge
// genera el código y lo devuelve (junto con el link wa.me al bot) — el USUARIO
// se lo manda al bot por WhatsApp y el ingest lo matchea. El bot ya NO manda
// DMs en frío (el 2026-07-20 un DM frío de verificación tumbó la línea).
// force=true regenera aunque ya esté verificado (útil si cambió el pushName).
export interface VerificationCode {
  code: string;
  bot_phone: string;
  wa_link: string;
}

export const useRequestWhatsappVerification = () =>
  useMutation({
    mutationFn: async (): Promise<VerificationCode> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData.user?.id;
      if (!uid) throw new Error("No autenticado");
      const { data, error } = await supabase.functions.invoke("whatsapp-send-verification-dm", {
        body: { user_id: uid, force: true },
      });
      if (error) throw new Error(error.message ?? "No se pudo generar el código");
      const resp = data as { ok: boolean; code?: string; bot_phone?: string; wa_link?: string; error?: string };
      if (!resp?.ok || !resp.code) throw new Error(resp?.error ?? "No se pudo generar el código");
      return { code: resp.code, bot_phone: resp.bot_phone ?? "", wa_link: resp.wa_link ?? "" };
    },
  });

// Update del propio profile.phone_e164. La policy "Users can update own
// profile" (auth.uid() = id) ya cubre el acceso, no hace falta nada
// custom server-side. El backend valida el formato via CHECK constraint
// — si el user mete algo inválido la mutation tira error y el caller
// muestra el toast con el mensaje.
//
// Pasamos null para BORRAR el número (el user puede querer desvincular).
export const useUpdateMyPhone = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phone_e164: string | null): Promise<void> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData.user?.id;
      if (!uid) throw new Error("No autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ phone_e164 })
        .eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });
};

// Upload to the existing public `creator-files` bucket under a
// `user-avatars/<uid>/` prefix. Then patch profiles.avatar_url so the
// new URL is what every other place in the app reads.
export const useUploadUserAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<{ url: string }> => {
      if (!file.type.startsWith("image/")) {
        throw new Error("El archivo debe ser una imagen.");
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const uid = userData.user?.id;
      if (!uid) throw new Error("No autenticado");

      const path = `user-avatars/${uid}/${Date.now()}-${sanitize(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from("creator-files")
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("creator-files").getPublicUrl(path);

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", uid);
      if (updErr) throw updErr;
      return { url: pub.publicUrl };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
};
