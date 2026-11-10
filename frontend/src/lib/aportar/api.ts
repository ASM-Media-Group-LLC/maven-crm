import { supabaseAnon } from "@/integrations/supabase/client";

// LA CARPETA DE LA CREADORA POR LINK (Alvaro, 10/11/2026: dejar Dropbox).
// Todo lo que la página pública /aportar/<token> le pide a la edge drive-aporte.
// Sin sesión: el token es la llave y la edge decide qué deja hacer cada tipo de
// link (ver supabase/functions/drive-aporte/logica.ts → permisosDe).

export type TipoDeLink = "subir" | "personal" | "invitado" | "ver";

export interface Permisos { subir: boolean; ver: boolean; compartir: boolean }

export interface InfoDelLink {
  existe: boolean;
  activo?: boolean;
  tipo?: TipoDeLink;
  permisos?: Permisos;
  carpeta?: string | null;
  carpeta_id?: string | null;
  etiqueta?: string | null;
  creadora?: string | null;
  del_equipo_id?: string | null;
}

export interface HijoDeCarpeta {
  id: string;
  nombre: string;
  tipo: "carpeta" | "archivo";
  mime: string | null;
  size: number | null;
  estado: string;
  created_at: string;
  hijos: number | null;
  del_equipo: boolean;
}

export interface Listado {
  carpeta: { id: string; nombre: string };
  ruta: { id: string; nombre: string }[];
  hijos: HijoDeCarpeta[];
}

export interface LinkCompartido {
  token: string;
  tipo: "invitado" | "ver";
  nombre: string | null;
  carpeta: string | null;
  created_at: string;
  usado_at: string | null;
}

/** Llama a la edge. Un error de la edge sale con su mensaje. */
export async function invocarAporte<T = Record<string, unknown>>(token: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabaseAnon.functions.invoke("drive-aporte", { body: { action, token, ...extra } });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const cuerpo = await ctx.clone().json() as { error?: string };
        if (cuerpo?.error) throw new Error(cuerpo.error);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

const ES_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Para pintar una carpeta del día: «hoy», «ayer» o la fecha corta. `null` si
 *  la carpeta no es de un día (lo que venía de antes). `hoy` = «2026-11-10». */
export function queDiaEs(nombre: string, hoy: string): "hoy" | "ayer" | Date | null {
  const m = ES_DIA.exec(nombre.trim());
  if (!m) return null;
  if (nombre.trim() === hoy) return "hoy";
  const h = ES_DIA.exec(hoy);
  if (h) {
    const ayer = new Date(Date.UTC(Number(h[1]), Number(h[2]) - 1, Number(h[3]) - 1)).toISOString().slice(0, 10);
    if (nombre.trim() === ayer) return "ayer";
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

/** Hoy en Colombia, como la edge nombra la carpeta del día. */
export const hoyEnColombia = (ahora: Date = new Date()) => ahora.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

export const esVideo = (h: Pick<HijoDeCarpeta, "mime" | "nombre">) =>
  (h.mime ?? "").startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(h.nombre);
export const esImagen = (h: Pick<HijoDeCarpeta, "mime" | "nombre">) =>
  (h.mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(h.nombre);

/** Cuántas cosas del equipo llegaron después de la última vez que la creadora
 *  miró «Del equipo» (se guarda en su navegador). La primera vez, todo es nuevo. */
export function nuevosDesde(hijos: Pick<HijoDeCarpeta, "created_at">[], visto: string | null): number {
  if (!visto) return hijos.length;
  return hijos.filter((h) => h.created_at > visto).length;
}

const claveVisto = (token: string) => `aportar:equipo-visto:${token}`;
export function leerVisto(token: string): string | null {
  try { return localStorage.getItem(claveVisto(token)); } catch { return null; }
}
export function marcarVisto(token: string, cuando = new Date().toISOString()): void {
  try { localStorage.setItem(claveVisto(token), cuando); } catch { /* sin almacenamiento: no pasa nada */ }
}
