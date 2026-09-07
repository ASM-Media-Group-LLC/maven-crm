import { useCallback, useEffect, useRef, useState } from "react";
import { tomarCandado, type Candado } from "@/lib/pestanaCowork";

/** ¿Esta pestaña es LA pestaña de Cowork de esta persona para esta sesión?
 *  `null` mientras se resuelve (milisegundos). Ver lib/pestanaCowork. */
export function usePestanaPrincipal(sessionId: string | undefined) {
  const [principal, setPrincipal] = useState<boolean | null>(sessionId ? null : true);
  const candadoRef = useRef<Candado | null>(null);

  const instalar = useCallback((c: Candado) => {
    candadoRef.current?.soltar();
    candadoRef.current = c;
    setPrincipal(c.estado !== "ocupada");
    c.alPerder(() => {
      if (candadoRef.current === c) candadoRef.current = null;
      setPrincipal(false);
    });
  }, []);

  useEffect(() => {
    if (!sessionId) { setPrincipal(true); return; }
    let vivo = true;
    setPrincipal(null);
    void tomarCandado(sessionId).then((c) => {
      if (!vivo) { c.soltar(); return; }
      instalar(c);
    });
    return () => {
      vivo = false;
      candadoRef.current?.soltar();
      candadoRef.current = null;
    };
  }, [sessionId, instalar]);

  /** "Usar esta pestaña": le quita Cowork a la otra, que se retira sola. */
  const tomarEstaPestana = useCallback(async () => {
    if (!sessionId) return;
    instalar(await tomarCandado(sessionId, { robar: true }));
  }, [sessionId, instalar]);

  return { principal, tomarEstaPestana };
}
