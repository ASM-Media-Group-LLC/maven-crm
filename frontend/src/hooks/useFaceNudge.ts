import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FaceWatch } from "@/hooks/useFaceWatch";
import { useAuth } from "@/hooks/useAuth";
import { playMessageNotification } from "@/lib/notificationSound";
import { anunciar } from "@/lib/anunciarVoz";
import { estaEnPausa } from "@/lib/coworkPausa";
import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";
import { reglasActuales, reglaDeEstado } from "@/lib/coworkReglas";
import { traducir, type TranslationKey } from "@/lib/i18n";
import { VOZ_ARGOS, tipoDeEncuadre, registrarNudge, cerrarNudge } from "@/lib/argosNudge";

// Mensaje LEGIBLE que queda en el expediente por cada tipo (distinto de la frase
// hablada, que rota). Es lo que el dueño ve: "Argos le dijo: …".
const MENSAJE_PERFIL: Record<string, string> = {
  camara_apagada: "Tenía la cámara apagada",
  fuera_cuadro: "Estaba fuera de cuadro",
  sin_pantalla: "No compartía la pantalla",
};

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
// LA ESCALERA, y por qué en ese orden (los tiempos son los del ESTÁNDAR; cada
// sesión puede moverlos desde sus reglas, ver `lib/coworkReglas`):
//   1) A los 90s, un aviso en su pantalla. Silencioso: alcanza para el descuido.
//   2) A los 3 min, se repite con sonido — ya no es un descuido.
//   3) Recién después, el coordinador. Interrumpir a alguien es caro y es él
//      quien decide si vale la pena; el sistema no debería hacerlo por él.
//
// NO CORRE EN PAUSA. Quien apretó "Baño" o "Break" avisó que se iba: seguir
// reclamándole sería castigarlo por haber usado bien el botón.
//
// LAS REGLAS SE LEEN EN CADA TIC, no al montar. Las fija la página de Cowork
// —que puede no estar montada mientras esto corre— y el supervisor puede
// cambiarlas en vivo: capturadas una sola vez, el cambio llegaría recién al
// remontar la llamada. Una alerta apagada en la sesión es como si no hubiera
// problema: ni aviso, ni coordinador. Y `supervisorSeg` en null quiere decir
// "a la persona sí, al coordinador nunca".

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
//
// ⚠️ LAS FRASES HABLADAS SE QUEDAN EN ESPAÑOL, aunque la interfaz esté en inglés:
// la voz de lib/voz.ts es española (`u.lang = "es-419"` y elige una voz "es"), y
// una frase en inglés leída con esa voz no se entiende. El aviso ESCRITO (el
// toast de abajo) sí va en el idioma de la interfaz. Si algún día la voz sigue
// al idioma, estas frases pasan al diccionario.
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

// El aviso escrito, en el idioma de la interfaz (traducir() en el momento del
// aviso: se arma y se muestra). Los tres primeros títulos dicen lo mismo que
// `faceStateLabel()` de useFaceWatch; antes se leían de ahí.
const TITULOS: Record<string, TranslationKey> = {
  no_face: "int.face.noFace",
  too_small: "int.face.tooSmall",
  too_dark: "int.face.tooDark",
  cam_off: "int.face.camOff",
};

const DESCRIPCIONES: Record<string, TranslationKey> = {
  cam_off: "int.face.camOffDesc",
};

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

/** El ESTÁNDAR de cuánto lleva alguien así hasta avisarle a alguien más
 *  (`REGLAS_ESTANDAR.camara/encuadre.supervisorSeg`). Lo que rige en cada
 *  sesión sale de sus reglas, no de acá: esto sigue exportado como referencia
 *  del comportamiento por defecto para el dashboard y los tests. */
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
  const { user } = useAuth();
  const ultimoAviso = useRef(0);
  const avisadoCoordinador = useRef(false);
  const alCoordinadorRef = useRef(onPasaAlCoordinador);
  alCoordinadorRef.current = onPasaAlCoordinador;

  useEffect(() => {
    if (!watch) return;
    if (!esProblemaDeEncuadre(watch.state)) {
      ultimoAviso.current = 0;
      avisadoCoordinador.current = false;
      // Se corrigió: cerrar el episodio abierto en el expediente (si lo había).
      if (user) { void cerrarNudge(user.id, "camara_apagada"); void cerrarNudge(user.id, "fuera_cuadro"); }
      return;
    }

    const tick = () => {
      // La pausa se consulta EN CADA TIC, no al montar: se marca desde la
      // página de Cowork, que puede no estar montada cuando esto corre.
      // Y una llamada de Maven en curso (Messenger/Meet/1:1) silencia igual
      // que la pausa: la cámara está EN esa llamada, no ausente (Grace, 01/09).
      if (enPausaProp || estaEnPausa() || estaEnLlamadaDeMaven()) {
        ultimoAviso.current = 0;
        avisadoCoordinador.current = false;
        return;
      }

      // La regla de ESTA sesión para lo que vio el detector, leída acá y no
      // arriba: si el supervisor la apaga en vivo, este es el tic que se
      // entera. Apagada, se trata igual que si el problema no existiera.
      const regla = reglaDeEstado(reglasActuales(), watch.state);
      if (!regla || !regla.activa) {
        ultimoAviso.current = 0;
        avisadoCoordinador.current = false;
        return;
      }
      const supervisorMs = regla.supervisorSeg === null ? null : regla.supervisorSeg * 1000;

      const fuera = Date.now() - watch.since;
      if (fuera < regla.primerAvisoSeg * 1000) return;

      const ahora = Date.now();
      if (ahora - ultimoAviso.current >= regla.repetirSeg * 1000) {
        const conSonido = supervisorMs !== null && fuera >= supervisorMs;
        toast.warning(
          traducir(TITULOS[watch.state] ?? "int.face.noFace"),
          {
            description: traducir(DESCRIPCIONES[watch.state] ?? "int.face.defaultDesc"),
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
        // los 3 minutos en el estándar): interrumpir a quien mira nueve salas
        // sigue siendo caro, y la persona ya tuvo avisos hablados para
        // corregirlo sola.
        playMessageNotification(0.5);
        void anunciar(siguienteFrase(watch.state), { volumen: conSonido ? 0.9 : 0.7, voiceId: VOZ_ARGOS });
        ultimoAviso.current = ahora;
        // Registrar en el expediente que Argos le llamó la atención (una fila por
        // episodio; el índice parcial evita duplicar mientras no se corrija).
        const tipo = tipoDeEncuadre(watch.state);
        if (tipo && user) void registrarNudge(user.id, tipo, MENSAJE_PERFIL[tipo], null);
      }

      // Con `supervisorSeg` en null la sesión decidió que el coordinador no se
      // entera por esto, nunca: la escalera termina en la propia persona.
      if (supervisorMs !== null && fuera >= supervisorMs && !avisadoCoordinador.current) {
        avisadoCoordinador.current = true;
        alCoordinadorRef.current?.(Math.floor(fuera / 1000));
      }
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [watch, enPausaProp, user]);
}

// ── Compartir pantalla ──────────────────────────────────────────────────────
//
// En Cowork la pantalla compartida es la mitad del trabajo: sin ella el
// supervisor ve una cara pero no ve QUÉ está haciendo esa persona. Dejar de
// compartir es tan fácil como cerrar una ventana por accidente, y quien lo hace
// casi nunca se da cuenta — por eso el aviso, y por eso hablado.
//
// Dos minutos de gracia (en el estándar): cambiar de pantalla, reiniciar el
// compartir o abrir algo a pantalla completa corta el stream unos segundos, y
// reclamar por eso sería puro ruido.
//
// Y hay sesiones donde esto directamente NO EXISTE: a las managers no se les
// pide pantalla. Por eso el tic mira `reglasActuales().pantalla.activa` antes
// que nada, y apagada se comporta como si la persona estuviera compartiendo.

/** El ESTÁNDAR de cuánto tiene que llevar alguien sin compartir para que se le
 *  avise al SUPERVISOR (`REGLAS_ESTANDAR.pantalla.supervisorSeg`). Cinco
 *  minutos, no dos: a los dos minutos la persona recién recibe su primer aviso,
 *  y a los cuatro el segundo. Avisarle al supervisor antes de eso es
 *  interrumpirlo por algo que la persona todavía no tuvo chance de corregir —
 *  y un supervisor que mira nueve salas aprende rápido a ignorar los avisos
 *  que llegan demasiado pronto. Lo vigente en cada sesión sale de sus reglas;
 *  esto queda como referencia del comportamiento por defecto. */
export const AVISAR_SUPERVISOR_SIN_PANTALLA_MS = 300_000;

/** ¿Hay que avisarle al SUPERVISOR de que esta persona no comparte pantalla?
 *
 *  Vive acá y no dentro del dashboard para que sea una sola regla y se pueda
 *  testear: la de encuadre ya vivía repartida y costó darse cuenta de que en
 *  pausa no debía avisar.
 *
 *  `umbralMs` es el de la sesión que mira el dashboard; sin él se asume el
 *  estándar. `null` es "en esta sesión el supervisor nunca se entera por
 *  pantalla", y entonces la respuesta es no, lleve lo que lleve. */
export function debeAvisarSinPantalla(
  ms: { screenShareOn?: boolean; onBreak?: boolean; screenShareSince?: number | null } | undefined,
  ahora: number,
  umbralMs: number | null = AVISAR_SUPERVISOR_SIN_PANTALLA_MS,
): boolean {
  if (umbralMs === null) return false;
  if (!ms || ms.screenShareOn) return false;
  // Marcó pausa: avisó que se iba, y reclamarle sería castigarla por haber
  // usado bien el botón. Misma regla que el encuadre.
  if (ms.onBreak) return false;
  // Sin sello no se puede afirmar nada. Antes de tenerlo, "no comparte" y
  // "acabo de entrar" se ven exactamente igual, y acusar por eso sería
  // inventar un dato que no tenemos.
  if (!ms.screenShareSince) return false;
  return ahora - ms.screenShareSince >= umbralMs;
}

// Las frases ROTAN, pero todas dicen lo mismo: que se comparta AHORA. Compartir
// pantalla es norma de la empresa durante el turno, no un favor — así que
// ninguna puede sonar a sugerencia. "Hazlo cuando puedas" decía exactamente lo
// contrario de la norma y le daba permiso a cualquiera para dejarlo para nunca.
// Educado sí; opcional no.
// Son habladas: se quedan en español por lo mismo que FRASES (la voz es española).
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
  const { user } = useAuth();
  const ultimo = useRef(0);
  const desde = useRef<number | null>(null);

  useEffect(() => {
    if (!activo || compartiendo) {
      desde.current = null; ultimo.current = 0;
      // Volvió a compartir: cerrar el episodio en el expediente (si lo había).
      if (compartiendo && user) void cerrarNudge(user.id, "sin_pantalla");
      return;
    }
    if (desde.current === null) desde.current = Date.now();

    const tick = () => {
      // La pausa se consulta en cada tic, igual que en el encuadre: quien
      // avisó que se iba no tiene por qué estar compartiendo nada. Y en una
      // llamada de Maven tampoco se reclama pantalla: la misma regla que arriba.
      if (estaEnPausa() || estaEnLlamadaDeMaven()) { desde.current = null; ultimo.current = 0; return; }
      // La regla de la sesión, en cada tic. Apagada = acá no se pide pantalla:
      // se olvida el reloj para que, si la vuelven a encender, cuente desde ahí
      // y no desde que la persona entró.
      const regla = reglasActuales().pantalla;
      if (!regla.activa) { desde.current = null; ultimo.current = 0; return; }
      if (desde.current === null) desde.current = Date.now();
      if (Date.now() - desde.current < regla.primerAvisoSeg * 1000) return;
      const ahora = Date.now();
      if (ahora - ultimo.current < regla.repetirSeg * 1000) return;
      ultimo.current = ahora;
      playMessageNotification(0.5);
      void anunciar(FRASES_SIN_PANTALLA[idxSinPantalla++ % FRASES_SIN_PANTALLA.length], { voiceId: VOZ_ARGOS });
      toast.warning(traducir("int.face.noScreen"), {
        description: traducir("int.face.noScreenDesc"),
        duration: 10_000,
        id: "sin-pantalla",
      });
      if (user) void registrarNudge(user.id, "sin_pantalla", MENSAJE_PERFIL.sin_pantalla, null);
    };

    tick();
    const id = window.setInterval(tick, 5_000);
    return () => window.clearInterval(id);
  }, [compartiendo, activo, user]);
}
