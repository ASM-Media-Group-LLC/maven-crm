import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { faceStateLabel, type FaceWatch } from "@/hooks/useFaceWatch";
import { playMessageNotification } from "@/lib/notificationSound";

// Avisarle a la PROPIA PERSONA que no se le ve la cara.
//
// El detector ya sabía distinguir "no hay rostro", "estás lejos" y "no hay luz",
// pero ese dato solo viajaba al dashboard del coordinador: quien estaba fuera de
// cuadro no se enteraba, y se quedaba así hasta que alguien lo interrumpía. La
// mayoría de las veces es un descuido de treinta segundos que la persona corrige
// sola apenas lo sabe.
//
// LA ESCALERA, y por qué en ese orden:
//   1) A los 90s, un aviso en su pantalla. Silencioso: alcanza para el descuido.
//   2) A los 3 min, se repite con sonido — ya no es un descuido.
//   3) Recién después, el coordinador. Interrumpir a alguien es caro y es él
//      quien decide si vale la pena; el sistema no debería hacerlo por él.
//
// NO CORRE EN PAUSA. Quien apretó "Baño" o "Break" avisó que se iba: seguir
// reclamándole encuadre sería castigarlo por haber usado bien el botón.

const PRIMER_AVISO_MS = 90_000;
const REPETIR_CADA_MS = 90_000;

// "Maven supervisor": la voz que le pide a la persona que se acomode.
//
// Habla desde SU PROPIA maquina (Web Speech), no como un participante mas de la
// sala. Es lo mismo desde donde se escucha —cada sala de Cowork tiene una sola
// persona— pero sin montar un bot que se conecte a N salas, sin gastar ancho de
// banda y sin que la voz quede grabada en la sesion. Si el navegador no tiene
// sintesis de voz, la escalera sigue funcionando con el aviso escrito.
const FRASES: Record<string, string> = {
  no_face: "Por favor, acomodate frente a la cámara.",
  too_small: "Por favor, acercate un poco a la cámara.",
  too_dark: "Hay muy poca luz. Por favor, mejorá la iluminación.",
};

function hablar(texto: string) {
  try {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return;
    // Si ya venia hablando, se corta: mejor una frase clara que dos encimadas.
    sintesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-419";
    u.rate = 0.95;
    u.volume = 0.9;
    const voz = sintesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("es"));
    if (voz) u.voice = voz;
    sintesis.speak(u);
  } catch { /* sin voz, queda el aviso escrito */ }
}
/** Tras cuánto tiempo fuera de cuadro se considera que hay que avisarle a alguien más. */
export const AVISAR_COORDINADOR_MS = 180_000;

export function useFaceNudge(
  watch: FaceWatch | null,
  enPausa: boolean,
  onPasaAlCoordinador?: (segundosFuera: number) => void,
) {
  const ultimoAviso = useRef(0);
  const avisadoCoordinador = useRef(false);

  useEffect(() => {
    if (!watch) return;

    const esProblema =
      watch.state === "no_face" || watch.state === "too_small" || watch.state === "too_dark";

    // Volvió a cuadro (o se fue a pausa): se limpia todo para que la próxima
    // vez la escalera arranque de cero y no herede avisos viejos.
    if (!esProblema || enPausa) {
      ultimoAviso.current = 0;
      avisadoCoordinador.current = false;
      return;
    }

    const tick = () => {
      const fuera = Date.now() - watch.since;
      if (fuera < PRIMER_AVISO_MS) return;

      const ahora = Date.now();
      if (ahora - ultimoAviso.current >= REPETIR_CADA_MS) {
        const conSonido = fuera >= AVISAR_COORDINADOR_MS;
        toast.warning(faceStateLabel(watch.state) ?? "No se te ve la cara", {
          description: "Acomodate frente a la cámara. Si necesitás salir, usá el botón de pausa.",
          duration: 10_000,
          id: "encuadre", // uno solo: no apilar avisos del mismo problema
        });
        // El primero es silencioso a proposito: un descuido de un minuto no
        // amerita un ruido. Si sigue, ya no es un descuido: suena y ademas se
        // lo dice en voz alta, que es lo que de verdad interrumpe a alguien que
        // esta mirando otra pantalla.
        if (conSonido) {
          playMessageNotification(0.5);
          hablar(FRASES[watch.state] ?? "Por favor, acomodate frente a la cámara.");
        }
        ultimoAviso.current = ahora;
      }

      if (fuera >= AVISAR_COORDINADOR_MS && !avisadoCoordinador.current) {
        avisadoCoordinador.current = true;
        onPasaAlCoordinador?.(Math.floor(fuera / 1000));
      }
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [watch, enPausa, onPasaAlCoordinador]);
}
