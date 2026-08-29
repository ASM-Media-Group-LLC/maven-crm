import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { faceStateLabel, type FaceWatch } from "@/hooks/useFaceWatch";
import { playMessageNotification } from "@/lib/notificationSound";
import { hablar } from "@/lib/voz";
import { estaEnPausa } from "@/lib/coworkPausa";

// Avisarle a la PROPIA PERSONA que no se le ve.
//
// El detector ya sabía distinguir "no hay rostro", "estás lejos", "no hay luz"
// y "cámara apagada", pero ese dato solo viajaba al dashboard del coordinador:
// quien estaba fuera de cuadro no se enteraba, y se quedaba así hasta que
// alguien lo interrumpía. La mayoría de las veces es un descuido de treinta
// segundos que la persona corrige sola apenas lo sabe.
//
// DÓNDE VIVE ESTO, Y POR QUÉ IMPORTA: se monta dentro de la llamada, no en la
// página de Cowork. La llamada sobrevive a navegar a otra sección de Maven (se
// va a la ventanita flotante); la página no. Cuando esto vivía en la página, el
// supervisor se apagaba justo cuando la persona se iba a mirar otra pantalla —
// o sea, justo cuando es más probable que se distraiga.
//
// LA ESCALERA, y por qué en ese orden:
//   1) A los 90s, un aviso en su pantalla. Silencioso: alcanza para el descuido.
//   2) A los 3 min, se repite con sonido — ya no es un descuido.
//   3) Recién después, el coordinador. Interrumpir a alguien es caro y es él
//      quien decide si vale la pena; el sistema no debería hacerlo por él.
//
// NO CORRE EN PAUSA. Quien apretó "Baño" o "Break" avisó que se iba: seguir
// reclamándole sería castigarlo por haber usado bien el botón.

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
  // Cámara apagada SIN pausa marcada. La frase siempre ofrece las DOS salidas:
  // prender la cámara o marcarse en pausa. Pedir solo lo primero le deja a
  // quien de verdad se tuvo que levantar la única opción de ignorar el aviso,
  // y un aviso que se aprende a ignorar deja de servir para todo lo demás.
  cam_off: [
    "Tienes la cámara apagada. Por favor, enciéndela o márcate como break o baño.",
    "Por favor, enciende tu cámara. Si necesitas salir, márcate como break o baño.",
    "No estás en cámara. Enciéndela, o avisa marcando break o baño.",
    "Recuerda mantener la cámara encendida. Si vas a ausentarte, márcalo en Cowork.",
    "Sigue apagada tu cámara. Por favor, enciéndela o registra tu pausa.",
    "Enciende la cámara, por favor. Y si estás en pausa, márcala para que quede registrada.",
  ],
};

const TITULOS: Record<string, string> = {
  cam_off: "Tienes la cámara apagada",
};

const DESCRIPCIONES: Record<string, string> = {
  cam_off: "Enciéndela, o márcate como Break o Baño para que quede registrado.",
};

const DESCRIPCION_POR_DEFECTO =
  "Acomódate frente a la cámara. Si necesitas salir, usa el botón de pausa.";

// El índice de rotación vive FUERA de React. Como `useRef` se reiniciaba cada
// vez que el componente se volvía a montar —y la llamada se remonta al recargar
// o al cambiar de sala—, en la práctica la persona escuchaba SIEMPRE la primera
// frase. Que es exactamente lo que rotar intenta evitar.
let fraseIdx = 0;

/** Siguiente frase del caso, sin repetir la anterior. */
function siguienteFrase(estado: string): string {
  const lista = FRASES[estado] ?? FRASES.no_face;
  const frase = lista[fraseIdx % lista.length];
  fraseIdx += 1;
  return frase;
}

/** Tras cuánto tiempo así se considera que hay que avisarle a alguien más. */
export const AVISAR_COORDINADOR_MS = 180_000;

/** ¿Este estado amerita avisarle a la persona? `unavailable` NO: significa que
 *  el detector no cargó en su equipo, y no es culpa suya — reclamarle encuadre
 *  por eso sería acusarlo de algo que no hizo. */
export function esProblemaDeEncuadre(estado: string | null | undefined): boolean {
  return estado === "no_face" || estado === "too_small" ||
         estado === "too_dark" || estado === "cam_off";
}

export function useFaceNudge(
  watch: FaceWatch | null,
  enPausaProp?: boolean,
  onPasaAlCoordinador?: (segundosFuera: number) => void,
) {
  const ultimoAviso = useRef(0);
  const avisadoCoordinador = useRef(false);
  const alCoordinadorRef = useRef(onPasaAlCoordinador);
  alCoordinadorRef.current = onPasaAlCoordinador;

  useEffect(() => {
    if (!watch) return;
    if (!esProblemaDeEncuadre(watch.state)) {
      ultimoAviso.current = 0;
      avisadoCoordinador.current = false;
      return;
    }

    const tick = () => {
      // La pausa se consulta EN CADA TIC, no al montar: se marca desde la
      // página de Cowork, que puede no estar montada cuando esto corre.
      if (enPausaProp || estaEnPausa()) {
        ultimoAviso.current = 0;
        avisadoCoordinador.current = false;
        return;
      }

      const fuera = Date.now() - watch.since;
      if (fuera < PRIMER_AVISO_MS) return;

      const ahora = Date.now();
      if (ahora - ultimoAviso.current >= REPETIR_CADA_MS) {
        const conSonido = fuera >= AVISAR_COORDINADOR_MS;
        toast.warning(
          TITULOS[watch.state] ?? faceStateLabel(watch.state) ?? "No se te ve la cara",
          {
            description: DESCRIPCIONES[watch.state] ?? DESCRIPCION_POR_DEFECTO,
            duration: 10_000,
            id: "encuadre", // uno solo: no apilar avisos del mismo problema
          },
        );
        // El primero es silencioso a proposito: un descuido de un minuto no
        // amerita un ruido. Si sigue, ya no es un descuido: suena y ademas se
        // lo dice en voz alta, que es lo que de verdad interrumpe a alguien que
        // esta mirando otra pantalla.
        if (conSonido) {
          playMessageNotification(0.5);
          hablar(siguienteFrase(watch.state));
        }
        ultimoAviso.current = ahora;
      }

      if (fuera >= AVISAR_COORDINADOR_MS && !avisadoCoordinador.current) {
        avisadoCoordinador.current = true;
        alCoordinadorRef.current?.(Math.floor(fuera / 1000));
      }
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [watch, enPausaProp]);
}
