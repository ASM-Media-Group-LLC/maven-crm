// LA SEÑAL DEL SUPERVISOR EN EL HUB (Alvaro, 18/11/2026: «llego y no están, y
// nadie me dijo si es que no quieren o que falló el sistema»).
//
// Mientras el supervisor está en el Supervisor Hub, su app manda cada 30 s (y
// apenas algo cambia) qué tiene prendido y, si la pantalla no se comparte, POR
// QUÉ: la quitó él, llega en negro, el computador no da permiso o falló. Si
// cierra Maven, lo dice al irse. Con eso el vigía de la base
// (vigilar_supervisores_hub) le avisa al dueño a los 2 minutos con la causa, y
// el Hub del dueño lo muestra en vivo (hub_estado_supervisores).
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import type { FalloDePantalla } from "@/lib/fallosDePantalla";

export type PantallaDelHub = "compartiendo" | "apagada" | "negra" | "permiso" | "falla" | "sin_pedir";

export interface SenalDelHub {
  sessionId: string;
  enHub: boolean;
  camOn: boolean;
  pantalla: PantallaDelHub;
  conexion: ConexionSala | null;
  enPausa: boolean;
}

/** Qué pasa con la pantalla, de lo más concreto a lo más general. Negra gana a
 *  «compartiendo»: compartir negro es no compartir (Alvaro, 18/11/2026). */
export function estadoDePantallaDelHub(s: {
  compartiendo: boolean;
  negra: boolean;
  apagadaAMano: boolean;
  fallo: FalloDePantalla | null;
}): PantallaDelHub {
  if (s.compartiendo) return s.negra ? "negra" : "compartiendo";
  if (s.negra) return "negra";
  if (s.apagadaAMano) return "apagada";
  if (s.fallo === "permiso") return "permiso";
  if (s.fallo === "falla") return "falla";
  return "sin_pedir";
}

/** Lo que el supervisor quitó ÉL MISMO entre una señal y otra (Alvaro,
 *  19/11/2026): se le avisa con calma, en una esquina, que queda anotado en el
 *  historial del Hub. Solo lo que hizo él: una pantalla que falló, llega en
 *  negro o le falta el permiso no es «quitaste», y apagar la cámara al tomar
 *  una pausa tampoco. */
export type CambioAnotado = "pantalla" | "camara";

export function cambiosAnotados(
  antes: Pick<SenalDelHub, "camOn" | "pantalla"> | null,
  ahora: Pick<SenalDelHub, "camOn" | "pantalla" | "enPausa">,
): CambioAnotado[] {
  if (!antes) return [];
  const out: CambioAnotado[] = [];
  if (antes.pantalla !== "apagada" && ahora.pantalla === "apagada") out.push("pantalla");
  if (antes.camOn && !ahora.camOn && !ahora.enPausa) out.push("camara");
  return out;
}

/** Cuánto se ve el aviso discreto. */
export const AVISO_ANOTADO_MS = 6_000;

/** Cada cuánto se repite la señal aunque no cambie nada (el vigía la da por
 *  muerta a los 90 s). */
export const SENAL_CADA_MS = 30_000;

const sinTipar = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

function argumentos(s: SenalDelHub, salida: "cerro" | null) {
  return {
    _session_id: s.sessionId,
    _en_hub: s.enHub,
    _cam_on: s.camOn,
    _pantalla: s.pantalla,
    _conexion: s.conexion,
    _en_pausa: s.enPausa,
    _salida: salida,
  };
}

/** Manda la señal. Un fallo no rompe nada: la próxima la vuelve a mandar. */
export async function mandarSenalDelHub(s: SenalDelHub): Promise<void> {
  try {
    const { error } = await sinTipar.rpc("hub_reportar_senal", argumentos(s, null));
    if (error) console.warn("[hub] no pude mandar la señal:", error.message);
  } catch (e) {
    console.warn("[hub] no pude mandar la señal:", e);
  }
}

/** Al cerrar Maven (o salir del Hub): «me fui a propósito». Va con keepalive
 *  para que salga aunque la página se esté cerrando. */
export function despedirseDelHub(s: SenalDelHub, token: string | null): void {
  if (!token) return;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/hub_reportar_senal`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(argumentos({ ...s, enHub: false }, "cerro")),
    }).catch(() => {});
  } catch { /* se está cerrando: lo que salga, salió */ }
}
