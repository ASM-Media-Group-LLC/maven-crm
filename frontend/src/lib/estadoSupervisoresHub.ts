// Lo que devuelve hub_estado_supervisores (supabase/migrations/
// 20261119010000_hub_supervisores_senal_y_avisos.sql), en la forma del chip.
import type { TranslationKey } from "@/lib/i18n";

export type ProblemaDelHub = "ok" | "fuera" | "camara" | "pantalla";

export const CAUSAS_DEL_HUB = [
  "salio", "app_caida", "conexion", "equipo_dormido", "sin_senal",
  "camara_apagada", "pantalla_apagada", "pantalla_negra", "permiso_pantalla",
  "pantalla_falla", "pantalla_sin_compartir",
] as const;
export type CausaDelHub = (typeof CAUSAS_DEL_HUB)[number];

export interface EstadoSupervisorHub {
  userId: string;
  nombre: string;
  problema: ProblemaDelHub;
  causa: CausaDelHub | null;
  /** ms desde la época; null si está bien. */
  desde: number | null;
  texto: string | null;
}

const PROBLEMAS = new Set<string>(["ok", "fuera", "camara", "pantalla"]);
const CAUSAS = new Set<string>(CAUSAS_DEL_HUB);

/** Filas válidas; lo que no se entiende se descarta (nunca se inventa «bien»). */
export function leerEstadoDelHub(data: unknown): EstadoSupervisorHub[] {
  if (!Array.isArray(data)) throw new Error("respuesta inesperada");
  const out: EstadoSupervisorHub[] = [];
  for (const f of data as Array<Record<string, unknown>>) {
    if (!f || typeof f.user_id !== "string" || typeof f.problema !== "string" || !PROBLEMAS.has(f.problema)) continue;
    const desde = typeof f.desde === "string" ? Date.parse(f.desde) : NaN;
    out.push({
      userId: f.user_id,
      nombre: typeof f.nombre === "string" && f.nombre.trim() ? f.nombre.trim().split(/\s+/).slice(0, 2).join(" ") : f.user_id.slice(0, 8),
      problema: f.problema as ProblemaDelHub,
      causa: typeof f.causa === "string" && CAUSAS.has(f.causa) ? (f.causa as CausaDelHub) : null,
      desde: Number.isFinite(desde) ? desde : null,
      texto: typeof f.texto === "string" ? f.texto : null,
    });
  }
  // Primero los que tienen problema, después los que están bien.
  return out.sort((a, b) => Number(a.problema === "ok") - Number(b.problema === "ok") || a.nombre.localeCompare(b.nombre));
}

/** La clave del texto corto del estado. */
export function claveDeEstadoDelHub(f: Pick<EstadoSupervisorHub, "problema" | "causa">): TranslationKey {
  if (f.problema === "ok") return "cowork.hubEstado.ok";
  if (f.problema === "pantalla" && f.causa === "pantalla_negra") return "cowork.hubEstado.pantallaNegra";
  return `cowork.hubEstado.${f.problema}` as TranslationKey;
}

/** La clave del texto corto de la causa. */
export function claveDeCausaDelHub(causa: CausaDelHub): TranslationKey {
  return `cowork.hubEstado.${causa}` as TranslationKey;
}
