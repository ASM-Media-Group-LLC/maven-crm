// Helper para descargar imágenes de Instagram CDN y persistirlas en
// Supabase Storage. Las URLs de IG son firmadas y expiran en ~24-48h —
// si guardamos la URL directa, todas las fotos del scouter se rompen
// al día siguiente. Acá la bajamos una vez y guardamos NUESTRA URL
// (bucket público scouter-avatars) que no expira nunca.

import { sb } from "./db.ts";

const BUCKET = "scouter-avatars";

// Cap defensivo — perfiles IG raramente exceden 500KB. Si por alguna
// razón el HD es enorme, mejor saltearlo que llenar el bucket.
const MAX_BYTES = 500_000;

const VALID_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Descarga la imagen en `igUrl` (URL firmada de IG CDN) y la sube a
 * scouter-avatars/<keyHint>-<timestamp>.<ext>. Devuelve la URL pública
 * de Supabase. Si algo falla, devuelve la URL original como fallback
 * — mejor URL que va a expirar que ninguna foto.
 *
 * `keyHint` se usa como prefijo del nombre del archivo (ej. el
 * instagram_handle del lead). Útil para inspección manual del bucket.
 */
export async function persistIgPhoto(
  igUrl: string | null | undefined,
  keyHint: string,
): Promise<string | null> {
  if (!igUrl) return null;

  // Si ya está en nuestro storage, no re-uploadear (idempotente para
  // re-runs del discovery sobre el mismo handle).
  if (igUrl.includes(`/storage/v1/object/public/${BUCKET}/`)) {
    return igUrl;
  }

  // Solo procesamos URLs de IG/FB CDN — si viene cualquier otra cosa,
  // pasamos through sin tocar.
  if (!/(cdninstagram\.com|fbcdn\.net|instagram\.f)/.test(igUrl)) {
    return igUrl;
  }

  try {
    const res = await fetch(igUrl);
    if (!res.ok) {
      console.warn(`persistIgPhoto fetch ${res.status} for ${keyHint}`);
      return igUrl;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const ext = VALID_EXT_BY_MIME[contentType] ?? "jpg";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      console.warn(`persistIgPhoto too big (${buf.byteLength}B) for ${keyHint}`);
      return igUrl;
    }
    const path = `${keyHint}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) {
      console.warn(`persistIgPhoto upload failed for ${keyHint}: ${upErr.message}`);
      return igUrl;
    }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch (e) {
    console.warn(`persistIgPhoto error for ${keyHint}:`, (e as Error).message);
    return igUrl;
  }
}
