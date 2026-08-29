import { useEffect, useRef } from "react";

// Que la llamada salga SOLA a la ventana flotante cuando la persona se va a
// otro programa, y se guarde sola al volver.
//
// Vive acá y no dentro de un componente porque lo necesitan dos lugares muy
// distintos: el provider de Cowork (donde la llamada sobrevive a navegar) y las
// pantallas de Meet y videollamada (que viven en su propia pestaña). Tenerlo
// dos veces garantizaba que se fueran separando.
//
// ── POR QUÉ UNA ACCIÓN DE MEDIASESSION Y NO UN `visibilitychange` ───────────
//
// Abrir esa ventana EXIGE un gesto del usuario: `requestWindow()` se rechaza
// sin él. La única vía sin clic es la acción "enterpictureinpicture", que el
// navegador dispara justo cuando la persona cambia de pestaña o de app, y solo
// en ese momento habilita la apertura. Es la misma que usa Meet.
//
// Pide tres cosas:
//   1. Registrar este manejador.
//   2. Estar capturando cámara o micrófono. Con el micro solo alcanza — está
//      medido. Pero si la persona tiene la cámara apagada Y el micro
//      silenciado no hay captura y el navegador NO lo permite. Eso no se puede
//      rodear, y no habría que intentarlo: el único rodeo sería mantener el
//      micrófono capturando mientras la persona lo tiene silenciado.
//   3. Que el permiso de "picture-in-picture automático" esté activo. Viene así
//      por defecto en Chrome; Brave no lo trae, y ahí esto simplemente no pasa.
//
// Si el navegador no la soporta, no rompe nada: queda el camino manual.

export interface AutoFlotante {
  /** Hay algo que valga la pena sacar (una llamada en curso). */
  activa: boolean;
  /** La ventana flotante, si está abierta. */
  ventana: Window | null;
  abrir: () => void | Promise<unknown>;
  cerrar: () => void;
}

export function useAutoFlotante({ activa, ventana, abrir, cerrar }: AutoFlotante) {
  // ¿La sacó el navegador o la persona? De eso depende si se cierra sola.
  const laSacoElNavegador = useRef(false);
  const estaAfuera = useRef(false);
  estaAfuera.current = !!ventana;

  useEffect(() => {
    if (!activa) return;
    const ms = navigator.mediaSession as MediaSession | undefined;
    if (!ms?.setActionHandler) return;
    const accion = "enterpictureinpicture" as MediaSessionAction;
    try {
      ms.setActionHandler(accion, () => {
        if (estaAfuera.current) return;   // ya está afuera
        laSacoElNavegador.current = true;
        void abrir();
      });
    } catch { /* navegador sin esta acción */ }
    return () => { try { ms.setActionHandler(accion, null); } catch { /* noop */ } };
  }, [activa, abrir]);

  // Al volver se guarda sola — PERO SOLO si la sacó el navegador.
  //
  // Quien la sacó a mano seguramente la puso en otro monitor a propósito, y
  // cerrársela al volver le rompería justo lo que armó. Esa distinción es todo
  // el punto de la bandera.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      if (!laSacoElNavegador.current || !estaAfuera.current) return;
      laSacoElNavegador.current = false;
      cerrar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cerrar]);

  // Si se cerró por cualquier vía, la bandera deja de aplicar.
  useEffect(() => { if (!ventana) laSacoElNavegador.current = false; }, [ventana]);
}
