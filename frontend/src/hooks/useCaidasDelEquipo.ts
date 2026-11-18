import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LEER_CAIDAS_CADA_MS, VENTANA_DEL_CHIP_MIN, caidasPorPersona, errorSinArreglo, tocaLeerCaidas, type CaidasPorPersona,
} from "@/lib/caidasSeguidas";

// Las caídas de llamada de la última hora de la gente que este supervisor puede
// ver, para el chip «Internet inestable · N caídas» del hub (lib/caidasSeguidas.ts).
//
// llamada_cortes no se lee directo (su RLS no tiene SELECT): la RPC
// cowork_caidas_recientes devuelve solo los conteos, con las MISMAS reglas que
// Argos (ve_argos + argos_vigilables). Sin permiso lanza error en vez de
// devolver vacío.
//
// Devuelve null mientras no sabe (cargando o falló): en ese caso no hay chip,
// nunca «0 caídas». Lee cada 2 minutos como mucho y solo con la pestaña a la
// vista. No manda avisos ni push: solo el chip.

// cowork_caidas_recientes es más nueva que los tipos generados de Supabase.
const sinTipar = supabase as unknown as {
  rpc: (f: "cowork_caidas_recientes", a: { _minutos: number }) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

export function useCaidasDelEquipo(activo = true): CaidasPorPersona | null {
  const [caidas, setCaidas] = useState<CaidasPorPersona | null>(null);

  useEffect(() => {
    if (!activo) { setCaidas(null); return; }
    let vivo = true;
    let parar = false;
    let ultimaLectura: number | null = null;
    const leer = async () => {
      if (parar || !tocaLeerCaidas(Date.now(), ultimaLectura, document.visibilityState === "visible")) return;
      ultimaLectura = Date.now();
      try {
        const { data, error } = await sinTipar.rpc("cowork_caidas_recientes", { _minutos: VENTANA_DEL_CHIP_MIN });
        if (!vivo) return;
        if (error) {
          console.warn("[cowork_caidas_recientes]", error.code ?? "", error.message);
          if (errorSinArreglo(error.code)) parar = true;
          setCaidas(null);
          return;
        }
        const mapa = caidasPorPersona(data);
        if (!mapa) console.warn("[cowork_caidas_recientes] unexpected response");
        setCaidas(mapa);
      } catch (e) {
        if (!vivo) return;
        console.warn("[cowork_caidas_recientes]", e);
        setCaidas(null);
      }
    };
    void leer();
    const id = window.setInterval(() => { void leer(); }, LEER_CAIDAS_CADA_MS);
    const alVolver = () => { if (document.visibilityState === "visible") void leer(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [activo]);

  return caidas;
}
