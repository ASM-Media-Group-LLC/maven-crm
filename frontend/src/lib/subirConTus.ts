import * as tus from "tus-js-client";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { rutaDeUrlTus, sePuedeRetomar } from "@/lib/aportar/subidaLarga";

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
  /** Bytes subidos y total, para la velocidad y el "faltan ~N min". */
  onBytes?: (subidos: number, total: number) => void;
  /** Solo se retoma una subida guardada cuya ruta empiece así (el token del
   *  link). Sin esto se retoma cualquiera del mismo archivo y bucket. */
  prefijoReanudable?: string;
}

export interface ResultadoTus {
  /** Dónde quedó DE VERDAD el archivo. Si se retomó una subida anterior, es la
   *  ruta de ESA subida, no la que se pidió ahora (11/11/2026: el aporte se
   *  registraba con la ruta nueva y vacía, y el video quedaba en la vieja). */
  path: string;
  retomada: boolean;
}

// Chunks de 2 MB: en redes colombianas flakys un chunk de 6 MB completo era muy
// difícil de que llegue (Alvaro, 06/11, 3 videos de creadoras en falla). Con 2
// MB cada PATCH es mucho más probable que complete. Más chunks = más overhead,
// pero mejor "lento y seguro" que "rápido y nunca".
const CHUNK_SIZE = 2 * 1024 * 1024;

// Escalera de retries ancha: 0s, 3s, 10s, 30s, 60s, 120s, 300s. Para un chunk
// que falla por red, intentamos durante casi 9 minutos antes de rendirnos.
// tus-js-client hace resume desde el offset exacto que el servidor confirmó,
// así que no se repiten bytes ya subidos.
const RETRY_DELAYS = [0, 3_000, 10_000, 30_000, 60_000, 120_000, 300_000];

export function subirConTus({ bucket, path, file, onPct, onBytes, prefijoReanudable }: SubirConTusArgs): Promise<ResultadoTus> {
  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;
  return new Promise((resolve, reject) => {
    let retomadaDe: string | null = null;
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: RETRY_DELAYS,
      chunkSize: CHUNK_SIZE,
      headers: {
        authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        // Sin x-upsert: el path trae un UUID random (edge drive-aporte),
        // así que nunca hay colisión. Con x-upsert el servidor exige permiso
        // UPDATE y eso lo rechaza la publishable key → 403 RLS.
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
        onBytes?.(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        // La URL de TUS dice dónde quedó el objeto (si la subida vieja venció,
        // tus-js-client abre una nueva con la ruta pedida AHORA).
        const real = rutaDeUrlTus(upload.url, bucket) ?? retomadaDe ?? path;
        resolve({ path: real, retomada: real !== path });
      },
    });
    // Si ya había un upload previo del MISMO archivo (fingerprint por nombre +
    // tamaño + lastModified), reanuda desde donde quedó en vez de empezar de 0.
    upload.findPreviousUploads().then((prev) => {
      const previa = prev.find((p) => sePuedeRetomar(p.metadata, bucket, prefijoReanudable ?? ""));
      if (previa) {
        retomadaDe = previa.metadata.objectName ?? null;
        upload.resumeFromPreviousUpload(previa);
      }
      upload.start();
    }).catch(() => upload.start());
  });
}
