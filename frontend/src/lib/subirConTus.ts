import * as tus from "tus-js-client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

// Sube un File a Supabase Storage con TUS (chunks resumibles de 6 MB).
// Por qué TUS (Alvaro, 06/11): un video de 10 min son 100-300 MB; un PUT único
// desde Colombia con red flaky se corta y reiniciaba desde 0% (lo que Alemia,
// Bereena y Yoisnia estaban viendo). TUS parte el archivo en chunks, cada chunk
// es su propio POST; si un chunk falla, reintenta SÓLO ese pedazo. La barra ya
// no vuelve a 0%.
//
// Reanudación: tus-js-client guarda la URL del upload en localStorage con
// fingerprint (nombre + tamaño + lastModified del File). Si la creadora cierra
// el navegador y vuelve a elegir el MISMO archivo, continúa desde donde quedó.
//
// La policy de storage.objects permite INSERT/UPDATE a `anon` sólo en el bucket
// drive-aportes (no SELECT, no DELETE). La edge drive-aporte valida el token y
// entrega el path; sin "confirmar" no se registra el aporte y el rescatador
// barre los huérfanos.

export interface SubirConTusArgs {
  bucket: string;
  path: string;
  file: File;
  onPct: (p: number) => void;
}

export function subirConTus({ bucket, path, file, onPct }: SubirConTusArgs): Promise<void> {
  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      chunkSize: 6 * 1024 * 1024,
      headers: {
        authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "x-upsert": "true",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        onPct(bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0);
      },
      onSuccess: () => resolve(),
    });
    // Si ya había un upload previo del MISMO archivo (fingerprint por nombre +
    // tamaño + lastModified), reanuda desde donde quedó en vez de empezar de 0.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }).catch(() => upload.start());
  });
}
