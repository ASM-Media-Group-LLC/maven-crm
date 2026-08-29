import { useEffect } from "react";

// Reanuda el video y el audio después de MUDAR la llamada de contenedor.
//
// Mover un nodo saca sus elementos del documento por un instante, y el
// navegador PAUSA todo <video>/<audio> que sale del documento — está en la
// spec. Al reinsertarlo no vuelve solo: queda negro y mudo.
//
// Vive acá y no dentro de un componente porque hay DOS lugares que hacen la
// misma mudanza: el provider de Cowork y el envoltorio de Meet/videollamada.
// El segundo se escribió copiando el movimiento y no la red, y esa divergencia
// —dos copias del mismo gesto, una con protección y otra sin— es justo la que
// se olvida de mantener.
//
// Nota honesta: los elementos que viajan llevan `autoplay`, y con eso vuelven
// solos en Chrome. O sea que esto puede no hacer falta hoy. Se conserva igual
// porque es idempotente (solo toca lo que está pausado), cuesta nada, y cubre
// al elemento que mañana aterrice ahí sin `autoplay`.

export function useReanudarMedia(
  caja: HTMLElement,
  destino: HTMLElement | null | undefined,
  activo: boolean,
) {
  useEffect(() => {
    if (!destino || !activo) return;
    let intentos = 0;
    const reanudar = () => {
      caja.querySelectorAll("video, audio").forEach((el) => {
        const m = el as HTMLMediaElement;
        if (m.paused) m.play().catch(() => { /* sin gesto del usuario, se reintenta */ });
      });
      // Los tracks tardan en re-adjuntarse; unos pocos reintentos cubren el
      // hueco sin dejar un intervalo corriendo para siempre.
      if (++intentos < 6) window.setTimeout(reanudar, 250);
    };
    const id = window.setTimeout(reanudar, 60);
    return () => window.clearTimeout(id);
  }, [destino, activo, caja]);
}
