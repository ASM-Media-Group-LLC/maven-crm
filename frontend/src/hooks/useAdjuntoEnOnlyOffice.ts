import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { base64ABytes } from "@/lib/base64Blob";

/** Los que ONLYOFFICE abre de verdad. Es un SUBCONJUNTO de lo que sabe
 *  convertir LibreOffice, a propósito: un `.doc` o un `.odt` viejos se ven
 *  mejor convertidos, y un `.rtf` no es trabajo para el editor de Office.
 *
 *  Tiene que coincidir con `ONLYOFFICE_ABRE` de la edge `document-convert`: si
 *  acá sobra algo, la persona espera y termina en error. */
const ABRE_ONLYOFFICE = new Set(["docx", "xlsx", "pptx"]);

export function extensionDe(filename: string): string {
  return filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function seAbreEnOnlyOffice(filename: string): boolean {
  return ABRE_ONLYOFFICE.has(extensionDe(filename));
}

/** SHA-256 del archivo en hexadecimal. La misma llave que usa la conversión:
 *  el mismo adjunto es el mismo objeto en R2, lo abra quien lo abra. */
async function huellaDe(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function llamar<T>(fn: string, cuerpo: Record<string, unknown>): Promise<T> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Sin sesión");
  const { data, error } = await supabase.functions.invoke(fn, {
    body: cuerpo, headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    const payload = (data ?? {}) as { error?: string };
    throw new Error(payload.error || error.message);
  }
  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

export interface AperturaDeAdjunto {
  servidor: string;
  config: Record<string, unknown>;
}

/**
 * Deja listo un adjunto de Office para abrirlo en ONLYOFFICE.
 *
 * Dos pasos, igual que la conversión a PDF: primero se pregunta por la huella
 * —barato— y solo si el original no está en R2 se suben los bytes. Un adjunto
 * de 20 MB son ~27 MB en base64; subirlos cada vez que alguien abre la misma
 * hoja de vida sería regalar tiempo y ancho de banda.
 */
export function useAdjuntoEnOnlyOffice(args: {
  filename: string;
  contentBase64: string | undefined;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["adjunto-onlyoffice", args.filename, args.contentBase64?.length ?? 0],
    enabled: args.enabled && !!args.contentBase64 && seAbreEnOnlyOffice(args.filename),
    // Ni el archivo ni su URL firmada cambian mientras la pestaña vive.
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<AperturaDeAdjunto> => {
      const bytes = base64ABytes(args.contentBase64!);
      const hash = await huellaDe(bytes);
      const extension = extensionDe(args.filename);

      let r = await llamar<{ listo: boolean; url: string | null }>("document-convert", {
        action: "check_original", hash, filename: args.filename,
      });
      if (!r.listo || !r.url) {
        r = await llamar<{ listo: boolean; url: string | null }>("document-convert", {
          action: "guardar_original", hash, filename: args.filename,
          contentBase64: args.contentBase64,
        });
      }
      if (!r.url) throw new Error("No se pudo preparar el adjunto");

      // La config se arma y se FIRMA en la edge: el secreto de ONLYOFFICE no
      // puede pasar por el navegador.
      return await llamar<AperturaDeAdjunto>("oficina-doc", {
        action: "adjunto", url: r.url, nombre: args.filename, hash, extension,
      });
    },
  });
}
