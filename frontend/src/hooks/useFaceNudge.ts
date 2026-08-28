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
// Varias por caso y ROTAN: la misma frase repetida cada minuto y medio deja de
// escucharse a los dos ciclos — se vuelve un ruido de fondo que el oído filtra.
// Español neutro, sin voseo, como el resto de la interfaz.
const FRASES: Record<string, string[]> = {
  no_face: [
    "Por favor, acomódate frente a la cámara.",
    "No se te ve la cara. Colócate frente a la cámara, por favor.",
    "Por favor, vuelve a encuadrarte en la cámara.",
    "Recuerda mantenerte visible en la cámara.",
    "Sigues fuera de cuadro. Acomódate, por favor.",
  ],
  too_small: [
    "Por favor, acércate un poco a la cámara.",
    "Te ves muy lejos. Acércate un poco, por favor.",
    "Por favor, colócate más cerca de la cámara.",
    "Quedaste cortado en el borde. Acomódate al centro, por favor.",
  ],
  too_dark: [
    "Hay muy poca luz. Por favor, mejora la iluminación.",
    "No se te alcanza a ver. Enciende una luz, por favor.",
    "Está muy oscuro. Por favor, ajusta la iluminación.",
    "Por favor, mejora la luz de tu espacio para que se te vea.",
  ],
};

/** Siguiente frase del caso, sin repetir la anterior. */
function siguienteFrase(estado: string, indice: { current: number }): string {
  const lista = FRASES[estado] ?? FRASES.no_face;
  const frase = lista[indice.current % lista.length];
  indice.current += 1;
  return frase;
}

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
  // Avanza con cada frase dicha y NO se reinicia entre episodios: si volviera a
  // cero, alguien que se va de cuadro varias veces en el día escucharía siempre
  // la primera.
  const fraseIdx = useRef(0);

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
          description: "Acomódate frente a la cámara. Si necesitas salir, usa el botón de pausa.",
          duration: 10_000,
          id: "encuadre", // uno solo: no apilar avisos del mismo problema
        });
        // El primero es silencioso a proposito: un descuido de un minuto no
        // amerita un ruido. Si sigue, ya no es un descuido: suena y ademas se
        // lo dice en voz alta, que es lo que de verdad interrumpe a alguien que
        // esta mirando otra pantalla.
        if (conSonido) {
          playMessageNotification(0.5);
          hablar(siguienteFrase(watch.state, fraseIdx));
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
