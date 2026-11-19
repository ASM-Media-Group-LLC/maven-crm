// LOS AVISOS LE LLEGAN AL SUPERVISOR DENTRO DEL HUB (Alvaro, 18/11/2026: «no se
// enteran de los avisos»).
//
// Antes el aviso del botón «Avisar» solo se recibía con el tablero de Cowork
// abierto: si el supervisor navegaba a otra sección (el Hub sigue en la
// ventanita flotante) o tenía Maven detrás de otra app, no le llegaba nada, y el
// cartel se cerraba solo a los 15 s. Ahora vive DENTRO de la llamada del Hub
// (se ve también en la ventanita flotante), se queda hasta que toca
// «Entendido» y, en la app de computador, trae Maven al frente.
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import AvisoChatter from "./AvisoChatter";
import { useRecepcionAvisos } from "./useRecepcionAvisos";

const alFrente = () => { void escritorio()?.mostrarEstaVentana?.().catch?.(() => {}); };

export default function AvisosEnElHub({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const { aviso, cerrar } = useRecepcionAvisos(userId, { fijo: true, alLlegar: alFrente });
  if (!aviso) return null;
  return (
    <div className="relative h-0">
      <AvisoChatter nombreDe={aviso.nombreDe} etiqueta={aviso.etiqueta} onCerrar={cerrar} t={t} />
    </div>
  );
}
