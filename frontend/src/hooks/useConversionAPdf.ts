import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { base64ABytes } from "@/lib/base64Blob";

/** Lo que LibreOffice sabe abrir y el navegador no. Tiene que coincidir con la
 *  lista de la edge `document-convert`; si acá sobra algo, el usuario ve una
 *  espera que termina en error. */
const CONVERTIBLES = new Set([
  "doc", "docx", "odt", "rtf",
  "xls", "xlsx", "ods",
  "ppt", "pptx", "odp",
]);

export function sePuedeConvertir(filename: string): boolean {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return CONVERTIBLES.has(ext);
}

/** SHA-256 del archivo, en hexadecimal. Es la llave de la caché: el mismo
 *  archivo da el mismo PDF, lo abra quien lo abra y venga de donde venga. */
async function huellaDe(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Respuesta {
  listo?: boolean;
  url?: string | null;
  error?: string;
  reintentar?: boolean;
}

async function llamar(cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Sin sesión");
  const { data, error } = await supabase.functions.invoke("document-convert", {
    body: cuerpo,
    headers: { Authorization: `Bearer ${token}` },
  });
  // El 429 del tope de conversiones llega acá como error de función; el cuerpo
  // trae `reintentar`, que es lo que distingue "esperá" de "falló".
  if (error) {
    const payload = (data ?? {}) as Respuesta;
    throw Object.assign(new Error(payload.error || error.message), {
      reintentar: payload.reintentar === true,
    });
  }
  const payload = data as Respuesta;
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

const ESPERA_MS = 2500;

/** Convierte a PDF un archivo que el navegador no sabe dibujar, y devuelve una
 *  URL firmada para verlo.
 *
 *  Dos pasos a propósito: primero se pregunta por la huella —que es barato— y
 *  solo si no está se suben los bytes. Un adjunto de 20 MB son ~27 MB en base64
 *  y subirlos cada vez que alguien abre la misma hoja de vida sería regalar
 *  tiempo y ancho de banda. */
export function useConversionAPdf(args: {
  filename: string;
  contentBase64: string | undefined;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["convertir-pdf", args.filename, args.contentBase64?.length ?? 0],
    enabled: args.enabled && !!args.contentBase64 && sePuedeConvertir(args.filename),
    // Convertir es caro y el resultado no cambia: una vez hecho, no se repite.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    // Reintentos solo por el tope de conversiones simultáneas: si falló por otra
    // cosa, insistir solo gasta CPU de todos.
    retry: (intentos, e) => intentos < 5 && (e as { reintentar?: boolean })?.reintentar === true,
    retryDelay: ESPERA_MS,
    queryFn: async (): Promise<string> => {
      const bytes = base64ABytes(args.contentBase64!);
      const hash = await huellaDe(bytes);

      const yaEsta = await llamar({ action: "check", hash });
      if (yaEsta.listo && yaEsta.url) return yaEsta.url;

      const hecho = await llamar({
        action: "convert",
        hash,
        filename: args.filename,
        contentBase64: args.contentBase64,
      });
      if (!hecho.url) throw new Error("La conversión no devolvió el documento");
      return hecho.url;
    },
  });
}
