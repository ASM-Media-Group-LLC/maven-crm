import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts the storage path from a full public Supabase URL or returns the path as-is.
 */
function extractStoragePath(urlOrPath: string, bucket: string): string {
  // If it's a full URL, extract the path after /object/public/bucket/
  const publicMarker = `/object/public/${bucket}/`;
  const idx = urlOrPath.indexOf(publicMarker);
  if (idx !== -1) {
    return urlOrPath.substring(idx + publicMarker.length);
  }
  // Also handle signed URL pattern
  const signedMarker = `/object/sign/${bucket}/`;
  const signedIdx = urlOrPath.indexOf(signedMarker);
  if (signedIdx !== -1) {
    const pathWithQuery = urlOrPath.substring(signedIdx + signedMarker.length);
    return pathWithQuery.split("?")[0];
  }
  // Already a path
  return urlOrPath;
}

/**
 * Generate a signed URL for a file in creator-files bucket.
 * Falls back to the original URL if signing fails.
 */
export async function getSignedFileUrl(
  fileUrlOrPath: string,
  bucket = "creator-files",
  expiresIn = 3600
): Promise<string> {
  if (!fileUrlOrPath) return fileUrlOrPath;

  const path = extractStoragePath(fileUrlOrPath, bucket);

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    console.warn("Failed to create signed URL, falling back:", error?.message);
    return fileUrlOrPath;
  }

  return data.signedUrl;
}
