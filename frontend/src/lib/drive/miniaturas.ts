// Qué archivos tienen miniatura (la hace el NAS: infra/nas-drive/miniaturas.mjs).
//
// ⚠️ COPIA de EXTENSIONES_CON_MINIATURA, MINIATURA_POR_MIME y
// extensionParaMiniatura de supabase/functions/drive/logica.ts (el build del
// frontend no importa de supabase/). test/oficina/miniaturasDrive.test.tsx exige
// que sean iguales: la pantalla pide miniaturas solo de lo que la edge firma.

export const EXTENSIONES_CON_MINIATURA = [
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp",
  "mov", "mp4", "m4v",
  "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers",
] as const;

export const MINIATURA_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const CON_MINIATURA = new Set<string>(EXTENSIONES_CON_MINIATURA);

/** La extensión con la que el NAS hace la miniatura, o null si no tiene. */
export function extensionParaMiniatura(nombre: string, mime: string | null): string | null {
  const ext = nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (CON_MINIATURA.has(ext)) return ext;
  const porTipo = MINIATURA_POR_MIME[(mime ?? "").split(";")[0].trim().toLowerCase()];
  return porTipo ?? null;
}
