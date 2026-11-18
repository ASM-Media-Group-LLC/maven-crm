// LA REGLA DE PANTALLA Y DE ARGOS DE QUIEN ESTÁ EN EL TABLERO DE COWORK
// (Alvaro, 18/11/2026). La decide la base (mi_regla_de_anfitrion y la tabla
// argos_reglas_persona):
//   · vigilado: Argos lo vigila (todos menos los admins libres; Grace,
//     Jackeline y Alvaro René son admins vigilados).
//   · pantallaObligatoria / camaraObligatoria: se comparten solas y se le
//     exigen. El grupo de Luis (Luis, Juan Pachas, Grace, Jackeline y Alvaro
//     René): vigilados, pero nada obligatorio (Alvaro, 18/11/2026).
// Mientras carga, nada (null): como antes, no se vigila a nadie a ciegas.
// Si la consulta FALLA no se concluye «libre»: se usa la regla de siempre (los
// admins libres, el resto vigilado y con pantalla obligatoria).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReglaDeAnfitrion {
  vigilado: boolean;
  pantallaObligatoria: boolean;
  camaraObligatoria: boolean;
}

// La RPC es nueva y todavía no está en los tipos generados.
const sinTipar = supabase as unknown as {
  rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Lo que devuelve la base, en la forma del tablero. null si no vino nada útil. */
export function leerRegla(data: unknown): ReglaDeAnfitrion | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  const f = fila as { vigilado?: unknown; pantalla_obligatoria?: unknown; camara_obligatoria?: unknown };
  if (typeof f.vigilado !== "boolean") return null;
  return {
    vigilado: f.vigilado,
    pantallaObligatoria: f.vigilado && f.pantalla_obligatoria !== false,
    camaraObligatoria: f.vigilado && f.camara_obligatoria !== false,
  };
}

/** La regla de siempre, para cuando la base no contesta. */
export function reglaPorRol(esAdmin: boolean): ReglaDeAnfitrion {
  return { vigilado: !esAdmin, pantallaObligatoria: !esAdmin, camaraObligatoria: !esAdmin };
}

export function useReglaDeAnfitrion(rolCargado: boolean, esAdmin: boolean): ReglaDeAnfitrion | null {
  const [regla, setRegla] = useState<ReglaDeAnfitrion | null>(null);
  useEffect(() => {
    if (!rolCargado) return;
    let vivo = true;
    let intento = 0;
    let reintento: number | null = null;
    const pedir = async () => {
      try {
        const { data, error } = await sinTipar.rpc("mi_regla_de_anfitrion");
        if (error) throw new Error(error.message);
        const leida = leerRegla(data);
        if (!leida) throw new Error("respuesta vacía");
        if (vivo) setRegla(leida);
      } catch (e) {
        console.warn("[cowork] no pude leer mi regla de anfitrión; uso la de mi rol", e);
        if (!vivo) return;
        setRegla((antes) => antes ?? reglaPorRol(esAdmin));
        // Se reintenta un par de veces: la regla buena puede ser otra (Grace).
        if (intento < 3) { intento += 1; reintento = window.setTimeout(() => { void pedir(); }, 5_000 * intento); }
      }
    };
    void pedir();
    return () => { vivo = false; if (reintento != null) window.clearTimeout(reintento); };
  }, [rolCargado, esAdmin]);
  return regla;
}

/** Quiénes ven, en el Hub, la pantalla de un anfitrión vigilado (los admins).
 *  Vacío mientras carga o si falla: nadie la ve, como antes. */
export function useVenPantallasDelHub(activo: boolean): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void (async () => {
      try {
        const { data, error } = await sinTipar.rpc("cowork_ven_pantallas_del_hub");
        if (error) throw new Error(error.message);
        if (vivo && Array.isArray(data)) setIds(data.filter((x): x is string => typeof x === "string"));
      } catch (e) {
        console.warn("[cowork] no pude leer quiénes ven las pantallas del Hub", e);
      }
    })();
    return () => { vivo = false; };
  }, [activo]);
  return ids;
}
