// El lado del SUPERVISOR en el Supervisor Hub (Alvaro, 18/11/2026): vigila que su
// pantalla no llegue en negro y manda su señal (lib/senalDelHub.ts) para que el
// dueño se entere a los 2 minutos, con la causa, si se sale, apaga la cámara o
// deja de compartir. Lo usa LiveKitCallView solo en la llamada del Hub.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import type { FalloDePantalla } from "@/lib/fallosDePantalla";
import { vigilarPantallaNegra } from "@/lib/pantallaNegra";
import {
  AVISO_ANOTADO_MS, cambiosAnotados, despedirseDelHub, estadoDePantallaDelHub, mandarSenalDelHub, SENAL_CADA_MS,
  type CambioAnotado, type SenalDelHub,
} from "@/lib/senalDelHub";

const TEXTO_ANOTADO: Record<CambioAnotado | "salida", TranslationKey> = {
  pantalla: "cowork.hubAnotado.pantalla",
  camara: "cowork.hubAnotado.camara",
  salida: "cowork.hubAnotado.salida",
};

/** El aviso discreto: abajo a la derecha, sin sonido, se va solo a los 6 s. */
function avisarAnotado(texto: string, cual: CambioAnotado | "salida") {
  toast(texto, { id: `hub-anotado-${cual}`, duration: AVISO_ANOTADO_MS, position: "bottom-right" });
}

export interface EntradaHubDelSupervisor {
  /** null = no es el Hub de un supervisor vigilado: no hace nada. */
  sessionId: string | null;
  compartiendo: boolean;
  pantalla: MediaStreamTrack | null;
  camOn: boolean;
  conexion: ConexionSala | null;
  apagadaAMano: boolean;
  ultimoFallo: () => FalloDePantalla | null;
  enPausa: () => boolean;
  /** La pantalla quedó en negro: quien llama la corta y la vuelve a pedir. */
  alQuedarNegra?: () => void;
}

export function useHubDelSupervisor(e: EntradaHubDelSupervisor): { negra: boolean } {
  const activo = !!e.sessionId;
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const [negra, setNegra] = useState(false);
  const alQuedarNegraRef = useRef(e.alQuedarNegra);
  alQuedarNegraRef.current = e.alQuedarNegra;

  // 1) Pantalla en negro: se mira la propia cada 10 s.
  useEffect(() => {
    if (!activo || !e.pantalla) return;
    const dejar = vigilarPantallaNegra(e.pantalla, (n) => {
      setNegra(n);
      if (n) {
        console.warn("[hub] la pantalla compartida llega en negro: se vuelve a pedir");
        alQuedarNegraRef.current?.();
      }
    });
    return dejar;
  }, [activo, e.pantalla]);
  // La marca de «negra» se borra solo cuando el vigía ve imagen de verdad (lib/
  // pantallaNegra.ts, juezDePantallaNegra): volver a pedir una pantalla que
  // sigue negra no reinicia la cuenta de los 2 minutos del dueño.

  // 2) La señal: cada 30 s y apenas cambia algo.
  const senal: SenalDelHub | null = activo
    ? {
        sessionId: e.sessionId!,
        enHub: true,
        camOn: e.camOn,
        pantalla: estadoDePantallaDelHub({
          compartiendo: e.compartiendo,
          negra,
          apagadaAMano: e.apagadaAMano,
          fallo: e.compartiendo ? null : e.ultimoFallo(),
        }),
        conexion: e.conexion,
        enPausa: e.enPausa(),
      }
    : null;
  const senalRef = useRef(senal);
  senalRef.current = senal;
  const tokenRef = useRef<string | null>(null);
  const clave = senal ? `${senal.camOn}|${senal.pantalla}|${senal.conexion}|${senal.enPausa}` : "";

  // 2b) Lo que quitó él mismo: se le dice con calma que queda anotado, en el
  //     mismo momento en que la señal lo anota en la base.
  const antesRef = useRef<SenalDelHub | null>(null);
  useEffect(() => {
    if (!activo || !senal) { antesRef.current = null; return; }
    for (const c of cambiosAnotados(antesRef.current, { ...senal, enPausa: e.enPausa() })) avisarAnotado(tRef.current(TEXTO_ANOTADO[c]), c);
    antesRef.current = senal;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave]);

  useEffect(() => {
    if (!activo) return;
    const mandar = () => {
      const s = senalRef.current;
      if (!s) return;
      // La pausa y el último fallo se leen al momento de mandar.
      void mandarSenalDelHub({ ...s, enPausa: e.enPausa() });
      void supabase.auth.getSession().then(({ data }) => { tokenRef.current = data.session?.access_token ?? null; }).catch(() => {});
    };
    mandar();
    const id = window.setInterval(mandar, SENAL_CADA_MS);
    return () => window.clearInterval(id);
    // `clave` resume lo que importa: un cambio se manda en el acto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, clave]);

  // 3) Al cerrar Maven o salir del Hub: «me fui» (no fue una caída).
  useEffect(() => {
    if (!activo) return;
    const despedir = () => { const s = senalRef.current; if (s) despedirseDelHub(s, tokenRef.current); };
    window.addEventListener("pagehide", despedir);
    return () => {
      window.removeEventListener("pagehide", despedir);
      // Se desmonta la llamada del Hub (colgó o cambió de sesión): salió él.
      despedir();
      avisarAnotado(tRef.current(TEXTO_ANOTADO.salida), "salida");
    };
  }, [activo]);

  return { negra };
}
