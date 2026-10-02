import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { describeFunctionError } from "@/hooks/useMailConnection";
import {
  decodificarTexto, pareceBinario, TOPE_TEXTO, type DestinoDeOficina,
} from "@/lib/drive/tipoDeArchivo";

// El visor de archivos del Drive (pages/oficina/drive/VisorArchivo.tsx).
//
// Nada se baja «por si acaso»: la URL firmada se pide recién al mirar el
// archivo, porque pedirla anota «abierto por última vez» (Recientes y lo que
// se archiva dependen de eso). Por la misma razón no se adelanta el siguiente.

async function llamar<T>(fn: "drive" | "oficina-doc", body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(await describeFunctionError(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** El permiso del NAS dura 6 h (VENCE.bajar). Se reusa un poco menos. */
const VIGENCIA_URL = 5 * 3600_000;

/** La URL firmada del NAS para mirar el archivo (la misma que «Abrir»).
 *
 *  ⚠️ Sin `refetchOnWindowFocus`: una URL nueva le cambia el `src` al video, y
 *  volver de otra pestaña lo haría arrancar de cero. */
export function useUrlDelArchivo(id: string | null, habilitado: boolean) {
  return useQuery({
    queryKey: ["drive-visor-url", id],
    enabled: !!id && habilitado,
    staleTime: VIGENCIA_URL,
    gcTime: VIGENCIA_URL,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    queryFn: async () => (await llamar<{ url: string }>("drive", { action: "abrir", id, descargar: false })).url,
  });
}

export interface AperturaEnOffice {
  servidor: string;
  config: Record<string, unknown>;
}

/** La configuración FIRMADA para ver un Word/Excel/PowerPoint del Drive en
 *  ONLYOFFICE, en modo lectura. Se arma en la edge: lleva la URL del NAS y la
 *  firma del servidor de Oficina, que no pueden salir del navegador. */
export function useVistaEnOffice(id: string | null, tema: "dark" | "light", idioma: "es" | "en", habilitado: boolean) {
  return useQuery({
    queryKey: ["drive-visor-office", id, tema, idioma],
    enabled: !!id && habilitado,
    staleTime: VIGENCIA_URL,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    queryFn: () => llamar<AperturaEnOffice>("oficina-doc", { action: "ver_drive", id, tema, idioma }),
  });
}

export interface TextoDelArchivo {
  texto: string;
  /** Se mostró solo el principio (el archivo pasa de TOPE_TEXTO). */
  cortado: boolean;
  /** Tiene bytes nulos: no es texto aunque se llame .txt. */
  binario: boolean;
}

/** Lee el principio de un archivo de texto: hasta `tope` bytes, pedidos por
 *  Range (el NAS contesta 206). Si el servidor igual manda todo, se corta la
 *  lectura al llegar al tope en vez de bajar el archivo entero. */
export async function leerTexto(url: string, size: number | null, tope = TOPE_TEXTO): Promise<TextoDelArchivo> {
  // ⚠️ Un archivo vacío no se pide: el NAS contesta 416 a «bytes=0-…» sobre 0
  // bytes, y eso no es un error, es un texto vacío.
  if (size === 0) return { texto: "", cortado: false, binario: false };
  const r = await fetch(url, { headers: { Range: `bytes=0-${tope - 1}` } });
  if (r.status === 416) return { texto: "", cortado: false, binario: false };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { bytes, sobra } = await leerHasta(r, tope);
  const cortado = sobra || (size != null && size > bytes.length);
  if (pareceBinario(bytes)) return { texto: "", cortado, binario: true };
  return { texto: decodificarTexto(bytes), cortado, binario: false };
}

async function leerHasta(r: Response, tope: number): Promise<{ bytes: Uint8Array; sobra: boolean }> {
  const lector = r.body?.getReader?.();
  if (!lector) {
    const todo = new Uint8Array(await r.arrayBuffer());
    return { bytes: todo.slice(0, tope), sobra: todo.length > tope };
  }
  const partes: Uint8Array[] = [];
  let total = 0;
  let sobra = false;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value);
    total += value.length;
    if (total >= tope) {
      sobra = total > tope;
      await lector.cancel().catch(() => {});
      break;
    }
  }
  const bytes = new Uint8Array(Math.min(total, tope));
  let i = 0;
  for (const p of partes) {
    if (i >= bytes.length) break;
    const pedazo = p.subarray(0, bytes.length - i);
    bytes.set(pedazo, i);
    i += pedazo.length;
  }
  return { bytes, sobra };
}

export function useTextoDelArchivo(url: string | undefined, size: number | null) {
  return useQuery({
    queryKey: ["drive-visor-texto", url],
    enabled: !!url,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: () => leerTexto(url!, size),
  });
}

/** Un SVG se muestra con <img> desde un blob con el tipo correcto.
 *
 *  ⚠️ Nunca en el DOM de la página (un SVG puede traer scripts) y nunca con la
 *  URL del NAS directa: el NAS lo manda como descarga y el navegador no lo
 *  dibuja. Dentro de un <img> el SVG no ejecuta nada. */
export function useSvgComoImagen(url: string | undefined) {
  const [estado, setEstado] = useState<{ src: string | null; error: boolean }>({ src: null, error: false });
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    let creada: string | null = null;
    setEstado({ src: null, error: false });
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const blob = new Blob([await r.arrayBuffer()], { type: "image/svg+xml" });
        if (!vivo) return;
        creada = URL.createObjectURL(blob);
        setEstado({ src: creada, error: false });
      } catch {
        if (vivo) setEstado({ src: null, error: true });
      }
    })();
    return () => {
      vivo = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [url]);
  return estado;
}

/** «Editar en Documentos de Maven»: una copia editable en la Oficina. El
 *  original sigue en el Drive, como cuando Google abre un .docx con
 *  Documentos de Google. */
export function useEditarEnOficina() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      llamar<{ id: string; extension: DestinoDeOficina }>("oficina-doc", { action: "desde_drive", id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos"] }),
  });
}
