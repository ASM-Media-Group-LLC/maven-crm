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
        // TODOS los avisos hablan, desde el primero.
        //
        // Antes el primero era mudo, con el argumento de que un descuido de un
        // minuto no amerita ruido. La practica dijo otra cosa: el aviso escrito
        // no sirve justo en los casos en que mas importa. Si estas sin luz, o
        // fuera de cuadro, o con la camara apagada, lo mas probable es que NO
        // estes mirando la pantalla — que es exactamente por eso que el detector
        // se quejo. Un cartel para alguien que no esta mirando la pantalla es
        // un cartel para nadie.
        //
        // Ademas dejaba una inconsistencia rara: el aviso de compartir pantalla
        // hablaba desde el primero y el de encuadre no. Dos avisos del mismo
        // sistema comportandose distinto sin una razon que la persona pueda
        // deducir.
        //
        // Lo que SI se conserva escalonado es el aviso al SUPERVISOR (abajo, a
        // los 3 minutos): interrumpir a quien mira nueve salas sigue siendo
        // caro, y la persona ya tuvo dos avisos hablados para corregirlo sola.
        playMessageNotification(0.5);
        hablar(siguienteFrase(watch.state), { volumen: conSonido ? 0.9 : 0.7 });
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

// ── Compartir pantalla ──────────────────────────────────────────────────────
//
// En Cowork la pantalla compartida es la mitad del trabajo: sin ella el
// supervisor ve una cara pero no ve QUÉ está haciendo esa persona. Dejar de
// compartir es tan fácil como cerrar una ventana por accidente, y quien lo hace
// casi nunca se da cuenta — por eso el aviso, y por eso hablado.
//
// Dos minutos de gracia: cambiar de pantalla, reiniciar el compartir o abrir
// algo a pantalla completa corta el stream unos segundos, y reclamar por eso
// sería puro ruido.

const SIN_PANTALLA_MS = 120_000;
const REPETIR_SIN_PANTALLA_MS = 120_000;

/** Cuánto tiene que llevar alguien sin compartir para que se le avise al
 *  SUPERVISOR. Cinco minutos, no dos: a los dos minutos la persona recién
 *  recibe su primer aviso, y a los cuatro el segundo. Avisarle al supervisor
 *  antes de eso es interrumpirlo por algo que la persona todavía no tuvo
 *  chance de corregir — y un supervisor que mira nueve salas aprende rápido a
 *  ignorar los avisos que llegan demasiado pronto. */
export const AVISAR_SUPERVISOR_SIN_PANTALLA_MS = 300_000;

/** ¿Hay que avisarle al SUPERVISOR de que esta persona no comparte pantalla?
 *
 *  Vive acá y no dentro del dashboard para que sea una sola regla y se pueda
 *  testear: la de encuadre ya vivía repartida y costó darse cuenta de que en
 *  pausa no debía avisar. */
export function debeAvisarSinPantalla(
  ms: { screenShareOn?: boolean; onBreak?: boolean; screenShareSince?: number | null } | undefined,
  ahora: number,
): boolean {
  if (!ms || ms.screenShareOn) return false;
  // Marcó pausa: avisó que se iba, y reclamarle sería castigarla por haber
  // usado bien el botón. Misma regla que el encuadre.
  if (ms.onBreak) return false;
  // Sin sello no se puede afirmar nada. Antes de tenerlo, "no comparte" y
  // "acabo de entrar" se ven exactamente igual, y acusar por eso sería
  // inventar un dato que no tenemos.
  if (!ms.screenShareSince) return false;
  return ahora - ms.screenShareSince >= AVISAR_SUPERVISOR_SIN_PANTALLA_MS;
}

// Las frases ROTAN, pero todas dicen lo mismo: que se comparta AHORA. Compartir
// pantalla es norma de la empresa durante el turno, no un favor — así que
// ninguna puede sonar a sugerencia. "Hazlo cuando puedas" decía exactamente lo
// contrario de la norma y le daba permiso a cualquiera para dejarlo para nunca.
// Educado sí; opcional no.
const FRASES_SIN_PANTALLA = [
  "No estás compartiendo pantalla. Por favor, actívala ahora.",
  "Recuerda que compartir pantalla es obligatorio durante tu turno.",
  "Tu pantalla dejó de compartirse. Vuelve a activarla, por favor.",
  "Por favor, comparte tu pantalla: sin ella no se ve en qué estás trabajando.",
  "Sigues sin compartir pantalla. Actívala, por favor.",
  "Falta que compartas tu pantalla. Actívala ahora, por favor.",
];

let idxSinPantalla = 0;

export function useScreenShareNudge(compartiendo: boolean, activo: boolean) {
  const ultimo = useRef(0);
  const desde = useRef<number | null>(null);

  useEffect(() => {
    if (!activo || compartiendo) { desde.current = null; ultimo.current = 0; return; }
    if (desde.current === null) desde.current = Date.now();

    const tick = () => {
      // La pausa se consulta en cada tic, igual que en el encuadre: quien
      // avisó que se iba no tiene por qué estar compartiendo nada.
      if (estaEnPausa()) { desde.current = null; ultimo.current = 0; return; }
      if (desde.current === null) desde.current = Date.now();
      if (Date.now() - desde.current < SIN_PANTALLA_MS) return;
      const ahora = Date.now();
      if (ahora - ultimo.current < REPETIR_SIN_PANTALLA_MS) return;
      ultimo.current = ahora;
      playMessageNotification(0.5);
      hablar(FRASES_SIN_PANTALLA[idxSinPantalla++ % FRASES_SIN_PANTALLA.length]);
      toast.warning("No estás compartiendo pantalla", {
        description: "Compartir pantalla es obligatorio durante tu turno.",
        duration: 10_000,
        id: "sin-pantalla",
      });
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [compartiendo, activo]);
}
