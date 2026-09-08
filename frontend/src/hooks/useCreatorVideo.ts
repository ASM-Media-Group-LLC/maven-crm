import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Video de onboarding de la creadora. El archivo vive en Cloudflare R2; la
// edge `creator-video` solo firma URLs que vencen.
//
// ⚠️ EL ARCHIVO NO PASA POR LA EDGE. El navegador hace el PUT directo a R2 con
// una URL firmada: una edge function tiene 256 MB de memoria y un onboarding
// pesa cientos de MB, así que mandarlo por ahí reventaría justo con los que
// importan. Por eso la subida es en tres tiempos: pedir firma → PUT a R2 →
// confirmar.

export const TIPOS_VIDEO = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const TOPE_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

async function llamar(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/creator-video`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "No se pudo completar la operación");
  return json as Record<string, unknown>;
}

/** PUT a R2 con barra de progreso. Se usa XHR y no fetch porque fetch no
 *  informa el progreso de SUBIDA, y sin barra un archivo de 800 MB parece
 *  colgado: la gente recarga la página a la mitad y vuelve a empezar. */
function subirConProgreso(url: string, file: File, onProgreso: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error(`R2 respondió ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Se cortó la conexión durante la subida"));
    xhr.onabort = () => reject(new Error("Subida cancelada"));
    xhr.send(file);
  });
}

export function useCreatorVideo(creatorId: string) {
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  const subir = useCallback(async (file: File) => {
    if (!(TIPOS_VIDEO as readonly string[]).includes(file.type)) {
      throw new Error("Formato no admitido: sube un MP4, MOV o WEBM");
    }
    if (file.size > TOPE_VIDEO_BYTES) {
      throw new Error("El video supera el límite de 2 GB");
    }
    setSubiendo(true);
    setProgreso(0);
    try {
      const firma = await llamar("upload_url", {
        creator_id: creatorId,
        content_type: file.type,
        size_bytes: file.size,
      });
      await subirConProgreso(firma.url as string, file, setProgreso);
      // Se confirma DESPUÉS del PUT: si la subida falla, la ficha sigue
      // apuntando al video anterior en vez de a un objeto a medio escribir.
      await llamar("confirm", { creator_id: creatorId, key: firma.key, size_bytes: file.size });
    } finally {
      setSubiendo(false);
    }
  }, [creatorId]);

  const urlParaVer = useCallback(async () => {
    const r = await llamar("view_url", { creator_id: creatorId });
    return r.url as string;
  }, [creatorId]);

  const quitar = useCallback(async () => {
    await llamar("delete", { creator_id: creatorId });
  }, [creatorId]);

  return { subir, urlParaVer, quitar, subiendo, progreso };
}
