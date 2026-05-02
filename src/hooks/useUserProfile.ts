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
        .select("id, full_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data as MyProfile | null) ?? null;
    },
  });

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
