// Lo que pwa.ts necesita del mundo para el vigía de 'ui_build_minimo'
// (lib/versionDelBundle.ts → crearVigiaDelMinimo): leer el mínimo, dónde anotar
// que ya se forzó y cómo traer el bundle nuevo. Aparte de pwa.ts porque ese
// archivo importa el módulo virtual del plugin de PWA, que en los tests no existe.
import { supabase } from "@/integrations/supabase/client";
import type { AlmacenDeLaPestana } from "./versionDelBundle";
import { hayLlamadaActiva } from "./llamadaActiva";

/** app_flags.valor de 'ui_build_minimo': una fila por PK. Sin sesión no pregunta
 *  (la RLS de app_flags es para autenticados). Sin la fila, con valor null o con
 *  la columna todavía sin crear (base sin la migración 20261001200000), devuelve
 *  null y el vigía no hace nada. */
export async function leerUiBuildMinimo(): Promise<unknown> {
  const { data: sesion } = await supabase.auth.getSession();
  if (!sesion.session) return null;
  const { data, error } = await supabase
    .from("app_flags")
    .select("valor")
    .eq("key", "ui_build_minimo")
    .maybeSingle();
  if (error) return null;
  return data?.valor ?? null;
}

/** sessionStorage de la pestaña, o null si el navegador no lo deja tocar. */
export function almacenDeLaPestana(): AlmacenDeLaPestana | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // bloqueado: el vigía no fuerza nada (ver crearVigiaDelMinimo)
  }
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Trae el bundle nuevo sin preguntar: busca el SW nuevo y recarga. index.html va
 *  sin caché (nginx.conf) y no está en la precaché del SW, así que la recarga
 *  trae el último build aunque el SW nuevo todavía se esté instalando. Si quedó
 *  uno esperando, primero se le dice que tome el control (updateSW(true)).
 *
 *  `ocupado` se vuelve a mirar JUSTO antes de updateSW(true) y de recargar: entre
 *  la decisión del vigía y la recarga pasan hasta 6,5 s (update() hasta 5 s, el SW
 *  en espera 1,5 s), y en ese rato alguien puede entrar a una llamada (tocar el
 *  aviso de un llamado de Cowork enfoca la pestaña, despierta al vigía y la
 *  persona entra). Si está ocupado no se toca nada y devuelve false: el vigía
 *  borra su marca para volver a intentarlo en la próxima revisión. Devuelve true
 *  si recargó. */
export async function forzarActualizacion(
  registro: ServiceWorkerRegistration | undefined,
  updateSW: (recargar?: boolean) => Promise<void>,
  recargar: () => void = () => window.location.reload(),
  // Por defecto, la llamada de LiveKit de esta pestaña (conectada o entrando):
  // quien olvide pasarlo no corta una llamada.
  ocupado: () => boolean = hayLlamadaActiva,
): Promise<boolean> {
  try {
    if (registro) await Promise.race([registro.update(), esperar(5000)]);
  } catch {
    /* sin red o sin SW: la recarga igual trae el index nuevo si hay red */
  }
  if (registro?.waiting) {
    // updateSW(true) recarga por su cuenta cuando el SW nuevo toma el control:
    // después de esto ya no se puede frenar, así que se mira antes.
    if (ocupado()) return false;
    void updateSW(true).catch(() => {});
    await esperar(1500);
  }
  if (ocupado()) return false;
  recargar();
  return true;
}
