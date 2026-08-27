import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export const MAX_FILES = 20;
export const MAX_FILE_SIZE_MB = 350;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export const EMOJIS = [
  "😀","😂","😍","🥰","😎","🤔","👍","👋","🎉","🔥",
  "❤️","💯","🚀","✅","⭐","💪","🙏","😊","🤩","👏",
  "😅","🫡","🤝","💀","🥲","😤","🤓","🫠","🙌","💜",
];

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface UploadCallbacks {
  onProgress: (percent: number) => void;
  onStatusText: (text: string) => void;
  abortRef: React.MutableRefObject<{ abort: () => void } | null>;
}

export async function uploadFileWithTUS(
  file: File,
  path: string,
  callbacks: UploadCallbacks
): Promise<{ error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  // Usamos la config del cliente (con fallback hardcodeado) en vez de import.meta.env.VITE_*
  // suelto: VITE_SUPABASE_PROJECT_ID no estaba definido en el runtime de prod (y VITE_
  // publishable podía quedar como placeholder __RUNTIME_*), así que el TUS fallaba antes de
  // subir → los archivos >5MB (p.ej. mp3 de canciones/grabaciones) "no se dejaban compartir".
  const apikey = SUPABASE_PUBLISHABLE_KEY;

  if (!token) return { error: "No auth session" };
  if (!apikey) return { error: "Missing Supabase publishable key" };

  const tusEndpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;
  const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  const uploadMetadata = [
    `bucketName ${b64("chat-files")}`,
    `objectName ${b64(path)}`,
    `contentType ${b64(file.type || "application/octet-stream")}`,
    `cacheControl ${b64("3600")}`,
  ].join(",");

  try {
    const createRes = await fetch(tusEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey,
        "x-upsert": "true",
        "Upload-Length": String(file.size),
        "Upload-Metadata": uploadMetadata,
        "Tus-Resumable": "1.0.0",
      },
    });

    if (!createRes.ok) {
      let detail = `HTTP ${createRes.status}`;
      try {
        const text = await createRes.text();
        try {
          const body = JSON.parse(text);
          detail = body.message || body.error || detail;
        } catch {
          detail = text.substring(0, 200) || detail;
        }
      } catch {}
      if (createRes.status === 413 || detail.toLowerCase().includes("maximum allowed size") || detail.toLowerCase().includes("payload too large")) {
        return {
          error: "El archivo excede el límite de Storage del proyecto. Ve a Supabase Dashboard > Storage > Settings y aumenta el 'Global file size limit'.",
        };
      }
      return { error: `Error al iniciar subida: ${detail}` };
    }

    const location = createRes.headers.get("Location");
    if (!location) return { error: "No upload location returned by server" };
    const uploadUrl = location.startsWith("http") ? location : new URL(location, tusEndpoint).toString();

    const MAX_RETRIES = 3;
    let offset = 0;
    const totalChunks = Math.ceil(file.size / TUS_CHUNK_SIZE_BYTES);
    let chunkIndex = 0;

    while (offset < file.size) {
      chunkIndex++;
      const chunkEnd = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
      const chunk = file.slice(offset, chunkEnd);
      const currentOffset = offset;
      let succeeded = false;
      let lastError: string | null = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          callbacks.onStatusText(`Reintentando chunk ${chunkIndex}/${totalChunks} (intento ${attempt})...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }

        const result = await new Promise<{ error: string | null; nextOffset: number }>((resolve) => {
          const xhr = new XMLHttpRequest();
          callbacks.abortRef.current = xhr;

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              callbacks.onProgress(Math.min(99, Math.round(((currentOffset + e.loaded) / file.size) * 100)));
            }
          };

          xhr.onload = () => {
            callbacks.abortRef.current = null;
            if (xhr.status >= 200 && xhr.status < 300) {
              const no = Number(xhr.getResponseHeader("Upload-Offset") ?? currentOffset + chunk.size);
              resolve({ error: null, nextOffset: Number.isFinite(no) ? no : currentOffset + chunk.size });
            } else {
              let detail = `HTTP ${xhr.status}`;
              try {
                const body = JSON.parse(xhr.responseText);
                detail = body.message || body.error || detail;
              } catch {
                detail = xhr.responseText?.substring(0, 200) || detail;
              }
              resolve({ error: detail, nextOffset: currentOffset });
            }
          };

          xhr.onerror = () => {
            callbacks.abortRef.current = null;
            resolve({ error: "Error de red — verifica tu conexión", nextOffset: currentOffset });
          };

          xhr.onabort = () => {
            callbacks.abortRef.current = null;
            resolve({ error: "cancelled", nextOffset: currentOffset });
          };

          xhr.timeout = 120000;
          xhr.ontimeout = () => {
            callbacks.abortRef.current = null;
            resolve({ error: "Timeout — conexión lenta", nextOffset: currentOffset });
          };

          xhr.open("PATCH", uploadUrl);
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.setRequestHeader("apikey", apikey);
          xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
          xhr.setRequestHeader("Upload-Offset", String(currentOffset));
          xhr.setRequestHeader("Tus-Resumable", "1.0.0");
          xhr.send(chunk);
        });

        if (result.error === "cancelled") return { error: "cancelled" };

        if (!result.error) {
          offset = result.nextOffset;
          callbacks.onProgress(Math.min(99, Math.round((offset / file.size) * 100)));
          succeeded = true;
          break;
        }

        lastError = result.error;
      }

      if (!succeeded) {
        return { error: `Error en chunk ${chunkIndex}/${totalChunks}: ${lastError}` };
      }
    }

    callbacks.onProgress(100);
    return { error: null };
  } catch (err: any) {
    return { error: err.message || "Error inesperado en la subida" };
  }
}
