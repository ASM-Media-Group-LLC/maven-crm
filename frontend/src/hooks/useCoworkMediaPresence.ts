import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenShareOn: boolean;
  /** Epoch del último cambio de `screenShareOn`. Sin esto el supervisor sabe
   *  QUÉ pasa pero no DESDE CUÁNDO, y no se puede distinguir a quien acaba de
   *  cerrar una ventana de quien lleva media hora sin compartir. Es el mismo
   *  papel que cumple `faceSince` para el encuadre. */
  screenShareSince?: number | null;
  // Pausa (baño). `breakStartedAt` es epoch ms para que el coordinador calcule
  // cuánto lleva, y lo mantiene el cliente de quien está en pausa: si el
  // coordinador recarga el dashboard, el presence se re-sincroniza y el contador
  // sigue bien. NO se guarda en la base a propósito — no queremos un historial
  // de idas al baño por persona, solo el estado de ahora.
  onBreak?: boolean;
  breakStartedAt?: number | null;
  /** "bano" o "break": el supervisor necesita saber CUÁL, porque los topes son
   *  distintos y el de baño además es un presupuesto diario. Estaba viajando
   *  igual, pero fuera del tipo, así que cada lado lo leía con un cast. */
  breakKind?: "bano" | "break" | null;
  // Encuadre: lo reporta el navegador de cada persona sobre su PROPIO video
  // (ver hooks/useFaceWatch). `faceSince` es el epoch del último cambio, para
  // poder decir "sin rostro hace 2 min" en vez de alarmar al primer frame.
  faceState?: string | null;
  faceSince?: number | null;
  /** Segundos de baño que esta persona ya gastó HOY en pausas CERRADAS. Viaja
   *  por presence para que el supervisor vea exactamente el mismo contador que
   *  la persona: el presupuesto de baño es diario, no por pausa. */
  banoConsumidoSeg?: number | null;
  /** El reloj de Cowork (tiempo trabajado hoy), tal como lo dijo el servidor
   *  en el último latido de esta persona. Viaja por presencia para que el
   *  supervisor vea el MISMO número que la persona (ver lib/coworkReloj). */
  relojEstado?: string | null;
  relojSegundosHoy?: number | null;
  relojEn?: number | null;
}

interface UseCoworkMediaPresenceResult {
  mediaStates: Record<string, MediaState>;
  trackMediaState: (state: MediaState) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// EL CANAL VIVE FUERA DE REACT, A PROPÓSITO.
//
// El bug que esto arregla: la llamada del chatter sobrevive a navegar (vive en
// el PersistentCallProvider, por encima del router), pero ESTE canal no. Al
// desmontarse la página de Cowork su `useEffect` hacía `removeChannel`, y
// Supabase emite un `leave` de presence al resto — así que el coordinador veía
// al chatter DESAPARECER de la sala mientras la persona seguía perfectamente
// dentro de la llamada, en la ventanita flotante. Supervisión mintiendo.
//
// Peor: con el canal muerto, `trackMediaState` no tenía a dónde escribir, así
// que aunque el chatter apagara el micro o se fuera de cuadro, el coordinador
// no se enteraba de nada más.
//
// La presencia tiene que durar lo que dura la LLAMADA, no lo que dura la
// página. Como la llamada ya no vive en React, el canal tampoco: se guarda acá
// y solo se cierra cuando alguien sale de verdad (`salirDePresencia`, que
// llama el botón de salir de la sala).
// ────────────────────────────────────────────────────────────────────────────

/** El canal de Supabase Realtime, tipado desde el propio cliente. */
type CanalRealtime = ReturnType<typeof supabase.channel>;

/** Lo que cada cliente publica sobre sí mismo en el presence. */
type PayloadPresencia = Partial<MediaState> & { user_id?: string };

interface CanalVivo {
  sessionId: string;
  userId: string;
  canal: CanalRealtime;
  /** Cuántos componentes montados lo están usando. Llega a 0 al navegar y el
   *  canal SIGUE VIVO — es justamente el punto. */
  usos: number;
  /** Lo avisan a quien esté escuchando cuando cambia el estado de la sala. */
  oyentes: Set<(estados: Record<string, MediaState>) => void>;
  /** Lo último que se publicó, para poder re-publicarlo si hiciera falta. */
  ultimoEstado: MediaState | null;
  /** Lo estamos cerrando NOSOTROS, a propósito (salir de Cowork, cambiar de
   *  sesión, rehacer el canal). Sirve para no gritar por algo que pedimos. */
  cerrando?: boolean;
}

let vivo: CanalVivo | null = null;

// Lo último que esta persona quiso publicar, se haya podido o no.
//
// EL HUECO QUE ESTO TAPA: la llamada avisa su estado de micro/cámara apenas
// monta, y eso puede pasar ANTES de que exista el canal (la sesión todavía se
// está cargando, o el usuario aún no resolvió). Ese primer aviso se perdía en
// silencio y NADA lo reintentaba: la persona quedaba dentro de la sala pero sin
// aparecer nunca en la presencia, así que el coordinador no recibía ni su
// estado de cámara ni sus alertas de encuadre.
//
// Peor: la llamada sobrevive a navegar, así que su efecto de "avisar estado" no
// se vuelve a disparar al volver. Sin esto, un solo aviso perdido dejaba a esa
// persona invisible para la supervisión por el resto del turno.
let ultimoEstadoPendiente: MediaState | null = null;

/** Con VARIAS conexiones bajo la misma clave (la persona tiene Cowork abierto
 *  en la PWA y en el navegador, o está reconectando y la conexión vieja
 *  todavía no murió), ¿cuál se muestra?
 *
 *  Antes se tomaba la PRIMERA (`[0]`), que es la más VIEJA: la pestaña que no
 *  sabe nada de la pausa, o el socket muerto. Por eso el contador de break/baño
 *  no aparecía en el tablero aunque la persona lo tuviera corriendo en pantalla.
 *  Regla: si alguna conexión dice "en pausa", esa manda (la pausa es una acción
 *  deliberada registrada en el servidor; la pestaña que la hizo es la que sabe).
 *  Si ninguna, la más NUEVA. Exportada para poder testearla. */
export function elegirPresencia<T extends { onBreak?: boolean; camOn?: boolean; screenShareOn?: boolean }>(presencias: T[] | undefined): T | undefined {
  if (!presencias?.length) return undefined;
  const enPausa = presencias.find((p) => p.onBreak);
  if (enPausa) return enPausa;
  // Con dos conexiones de la misma persona (07/09: Cowork en dos pestañas),
  // manda la que está TRABAJANDO —cámara y pantalla— y no la más nueva: la
  // pestaña de fondo, sin cámara, era la que hacía sonar "cámara apagada" al
  // supervisor mientras la persona estaba perfectamente en la otra. A igual
  // puntaje, la más nueva (la última), como antes.
  let mejor = presencias[presencias.length - 1];
  let puntaje = -1;
  for (const p of presencias) {
    const pts = (p.camOn ? 2 : 0) + (p.screenShareOn ? 1 : 0);
    if (pts >= puntaje) { puntaje = pts; mejor = p; }
  }
  return mejor;
}

function leerEstados(canal: CanalRealtime) {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, MediaState> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const ultima = elegirPresencia(presencias);
    if (!ultima) return;
    resultado[key] = {
      micOn: !!ultima.micOn,
      camOn: !!ultima.camOn,
      screenShareOn: !!ultima.screenShareOn,
      screenShareSince: ultima.screenShareSince ?? null,
      onBreak: !!ultima.onBreak,
      breakStartedAt: ultima.breakStartedAt ?? null,
      breakKind: ultima.breakKind ?? null,
      faceState: ultima.faceState ?? null,
      faceSince: ultima.faceSince ?? null,
      banoConsumidoSeg: ultima.banoConsumidoSeg ?? null,
      relojEstado: ultima.relojEstado ?? null,
      relojSegundosHoy: ultima.relojSegundosHoy ?? null,
      relojEn: ultima.relojEn ?? null,
    };
  });
  return resultado;
}

// Desde cuándo está (o no está) compartiendo pantalla.
//
// Vive FUERA del canal a propósito. Si viviera en la entrada del canal, cada
// reconexión —que rehace el canal— reiniciaría el contador, y alguien que lleva
// cinco minutos sin compartir volvería a cero cada vez que le parpadea el wifi.
// Justo la persona a la que hay que avisarle sería la que nunca dispara el
// aviso.
let selloPantalla: { compartiendo: boolean; desde: number } | null = null;

function selloDePantalla(compartiendo: boolean): number {
  if (!selloPantalla || selloPantalla.compartiendo !== compartiendo) {
    selloPantalla = { compartiendo, desde: Date.now() };
  }
  return selloPantalla.desde;
}

// ────────────────────────────────────────────────────────────────────────────
// EL FRENO DE PUBLICACIÓN. Sin esto, Cowork se queda ciego.
//
// Supabase corta al cliente que manda demasiados mensajes de presencia
// (`ClientPresenceRateLimitReached`) y NO corta solo el canal culpable: corta
// el SOCKET ENTERO de esa persona. Por ese socket viaja también el resto de
// Realtime, así que quien lo pierde deja de publicar su estado Y deja de
// recibir los cambios en vivo — por eso una sala nueva no aparecía hasta
// refrescar la página.
//
// Y el aviso no llega nunca al navegador: para el cliente todo parece bien.
//
// EL PROBLEMA ESTABA AL ENTRAR A UNA SALA. Ahí se juntan, en menos de un
// segundo, media docena de motivos para publicar: LiveKit avisa el micro, la
// cámara y la pantalla de a uno; el detector de encuadre arranca y pasa de
// `cam_off` a lo que sea; el canal se suscribe y reanuncia lo pendiente. Cada
// uno hacía su propio `track()`. Con eso alcanzaba para pasarse del tope, y a
// partir de ahí esa persona quedaba muda para la supervisión POR EL RESTO DEL
// TURNO — sin un error a la vista.
//
// Medido en producción el 30/08/2026: diez cortes en dos horas y el canal de
// la sesión con CERO presencias, con once personas trabajando adentro.
//
// La solución es juntar las publicaciones en vez de mandarlas de a una. Manda
// la primera al toque (que es la que importa: "acabo de entrar") y agrupa todo
// lo que llegue en los próximos segundos en un solo mensaje con el ÚLTIMO
// estado. Nadie nota dos segundos de atraso; todos notan un turno entero de
// silencio.
// ────────────────────────────────────────────────────────────────────────────

const MIN_ENTRE_PUBLICACIONES_MS = 2_000;
let ultimaPublicacion = 0;
let pendienteDePublicar: { entrada: CanalVivo; state: MediaState } | null = null;
let temporizadorPendiente: number | null = null;

function publicar(entrada: CanalVivo, state: MediaState) {
  // El estado se re-publica cada diez segundos aunque no cambie nada, así que
  // el sello se ARRASTRA: solo se renueva cuando de verdad cambió el compartir.
  const screenShareSince = selloDePantalla(state.screenShareOn);
  // Se anota YA, aunque el envío se demore: es lo que se reanuncia al
  // re-suscribirse, y no queremos que ahí salga un estado viejo.
  entrada.ultimoEstado = { ...state, screenShareSince };

  const ahora = Date.now();
  const falta = MIN_ENTRE_PUBLICACIONES_MS - (ahora - ultimaPublicacion);
  if (falta <= 0) { enviar(entrada, entrada.ultimoEstado, screenShareSince); return; }

  // Gana el último: si en la ventana llegan cinco cambios, sale uno solo y con
  // el estado más nuevo. Publicar los cinco es justamente lo que nos cortaba.
  pendienteDePublicar = { entrada, state: entrada.ultimoEstado };
  if (temporizadorPendiente === null) {
    temporizadorPendiente = window.setTimeout(() => {
      temporizadorPendiente = null;
      const p = pendienteDePublicar;
      pendienteDePublicar = null;
      if (p) enviar(p.entrada, p.state, selloDePantalla(p.state.screenShareOn));
    }, falta);
  }
}

/** Olvida lo que estuviera esperando para salir. Al cerrar la presencia no
 *  queremos que un envío atrasado reviva un canal que ya no existe. */
function olvidarPendiente() {
  if (temporizadorPendiente !== null) { window.clearTimeout(temporizadorPendiente); temporizadorPendiente = null; }
  pendienteDePublicar = null;
}

function enviar(entrada: CanalVivo, state: MediaState, screenShareSince: number) {
  ultimaPublicacion = Date.now();
  const envio = entrada.canal.track({
    user_id: entrada.userId,
    micOn: state.micOn,
    camOn: state.camOn,
    screenShareOn: state.screenShareOn,
    screenShareSince,
    onBreak: !!state.onBreak,
    breakStartedAt: state.onBreak ? (state.breakStartedAt ?? Date.now()) : null,
    breakKind: state.breakKind ?? null,
    faceState: state.faceState ?? null,
    faceSince: state.faceSince ?? null,
    banoConsumidoSeg: state.banoConsumidoSeg ?? null,
    relojEstado: state.relojEstado ?? null,
    relojSegundosHoy: state.relojSegundosHoy ?? null,
    relojEn: state.relojEn ?? null,
  });
  // `track()` devuelve una promesa y hasta ahora nadie la miraba. Cuando el
  // servidor rechaza la publicación —justamente el caso del corte por límite—
  // el fallo era MUDO: la persona creía estar anunciándose y no la veía nadie.
  void Promise.resolve(envio)
    .then((r) => {
      if (r === "ok") return;
      console.warn("[Cowork] El servidor rechazó publicar tu estado:", r,
        "— el tablero del supervisor no te va a ver hasta que se reconecte el canal.");
      // Que el vigilante lo rearme: si el socket se cayó, reanunciarse no
      // alcanza y hay que rehacer el canal.
      noAparezco = REINTENTOS_ANTES_DE_REHACER;
    })
    .catch(() => { noAparezco = REINTENTOS_ANTES_DE_REHACER; });
}

/** Cierra el canal AVISANDO que el cierre es nuestro.
 *
 *  Sin esto, cada cierre deliberado —salir de Cowork, cambiar de sesión,
 *  rehacer el canal— disparaba el aviso de "el tablero no va a recibir estados
 *  de nadie", como si algo se hubiera roto. Y ese aviso es nuestro ÚNICO
 *  detector de la ceguera de verdad: si suena cada vez que alguien sale de la
 *  pantalla, en una semana nadie le cree. Una alarma que grita en falso es una
 *  alarma perdida. */
function cerrarCanal(entrada: CanalVivo): void {
  entrada.cerrando = true;
  supabase.removeChannel(entrada.canal);
}

function abrirCanal(sessionId: string, userId: string): CanalVivo {
  const canal = supabase.channel(`cowork-media-${sessionId}`, {
    config: { presence: { key: userId } },
  });
  const entrada: CanalVivo = { sessionId, userId, canal, usos: 0, oyentes: new Set(), ultimoEstado: null };

  const avisar = () => {
    const estados = leerEstados(canal);
    entrada.oyentes.forEach((f) => f(estados));
  };

  canal
    .on("presence", { event: "sync" }, avisar)
    .on("presence", { event: "join" }, avisar)
    .on("presence", { event: "leave" }, avisar)
    .subscribe((estado) => {
      // ESTA ES LA CLAVE, y costó tres teorías descartadas encontrarla.
      //
      // `track()` publica la presencia SOBRE LA CONEXIÓN ACTUAL. Si el socket
      // se cae y vuelve —cosa que pasa sola al navegar por Maven, porque cada
      // sección abre y cierra sus propios canales— el canal se re-suscribe pero
      // la presencia NO se reenvía. El chatter desaparece del tablero del
      // coordinador aunque siga perfectamente dentro de la llamada, y no vuelve
      // hasta que algo dispare otro `track()`.
      //
      // Por eso Jhon veía que "apagar y prender la cámara" lo hacía reaparecer:
      // ese era el único gesto que volvía a publicar. Y por eso refrescar el
      // tablero a veces parecía arreglarlo y a veces no.
      //
      // Al re-suscribirse, se vuelve a anunciar lo último que se sabía.
      const aPublicar = entrada.ultimoEstado ?? ultimoEstadoPendiente;
      if (estado === "SUBSCRIBED") {
        if (aPublicar) publicar(entrada, aPublicar);
        return;
      }
      // Cualquier otro estado significa que este canal NO entrega nada, y hasta
      // ahora eso no dejaba rastro: el tablero del supervisor se quedaba vacío
      // en silencio y parecía que todos estaban bien. Es el mismo fallo mudo
      // que tenía el timbre de llamadas, y costó una noche encontrarlo ahí.
      // Si el cierre lo pedimos nosotros, no hay nada que avisar.
      if (entrada.cerrando) return;
      console.warn(
        "[Cowork] El canal de presencia está en:", estado,
        "— el tablero del supervisor no va a recibir estados de nadie.",
      );
    });

  return entrada;
}

// ────────────────────────────────────────────────────────────────────────────
// AUTOCURACIÓN: el tablero no puede quedar mintiendo hasta que alguien recargue.
//
// Jhon lo pilló probando: un chatter desapareció de su tablero y solo volvió
// después de refrescar la página. O sea que el dato SÍ estaba del lado del
// servidor y lo que estaba viejo era la copia local del coordinador.
//
// No pude reproducir el evento exacto que se pierde (socket que se cae con la
// pestaña en segundo plano, un `sync` que no llega, un rejoin a medias), así
// que en vez de adivinar la causa se ataca la consecuencia: si el canal deja de
// estar unido, se rearma; y pase lo que pase se vuelve a leer el estado cada
// pocos segundos. Leer es gratis (es un objeto en memoria, no una consulta).
//
// La regla de fondo: un tablero de supervisión que se queda viejo en silencio
// es peor que uno que se cae, porque el coordinador le sigue creyendo.
// ────────────────────────────────────────────────────────────────────────────

const REVISION_MS = 4000;
let revisor: number | null = null;

function estadoDelCanal(canal: CanalRealtime): string | undefined {
  return (canal as unknown as { state?: string }).state;
}

// ── Por qué este vigilante lleva freno ──────────────────────────────────────
//
// La primera versión reintentaba en cada tic, cada cuatro segundos, sin
// límite. Parecía prudente —"reintentar es barato y quedarse mudo no"— y era
// exactamente al revés: si el canal no se recuperaba, rearmarlo cada cuatro
// segundos GENERABA el tráfico que impedía que se recuperara.
//
// Supabase lo corta con `ClientPresenceRateLimitReached`, y no corta solo el
// canal culpable: corta el SOCKET ENTERO del cliente. Por ese socket viajan
// también las llamadas entrantes y los mensajes en vivo, así que un vigilante
// de Cowork demasiado ansioso dejaba a la persona sin timbre de llamadas y sin
// Messenger en vivo, sin un solo error a la vista. Pasó en producción.
//
// Un reintento que no afloja no es persistencia: es la causa.

const ESPERA_BASE_MS = 8_000;
const ESPERA_MAX_MS = 60_000;
/** Mínimo entre dos reanuncios de MI estado. Reanunciarse es un mensaje de
 *  presencia más, así que hacerlo en cada tic es justo lo que dispara el
 *  límite. Veinte segundos alcanzan de sobra: el tablero del supervisor
 *  tolera esa demora, un socket caído no. */
const MIN_ENTRE_REPUBLICACIONES_MS = 20_000;

/** Cuánto se tolera un canal 'uniéndose' antes de darlo por colgado. Unirse
 *  sano tarda menos de un segundo. */
const MAX_UNIENDO_MS = 15_000;
let uniendoDesde: number | null = null;
/** Cuántas veces seguidas me reanuncié y SEGUÍ sin aparecer en la sala.
 *
 *  Reanunciarse no sirve de nada si lo que se rompió es el socket: el canal
 *  puede seguir diciendo 'joined' mientras el servidor ya nos cortó. Después de
 *  unos cuantos intentos en falso hay que rehacer el canal, que es lo único que
 *  vuelve a levantar la conexión. Antes no había salida: la persona se quedaba
 *  invisible hasta que recargaba la página, y nadie tenía motivo para hacerlo.*/
let noAparezco = 0;
const REINTENTOS_ANTES_DE_REHACER = 3;
let fallosSeguidos = 0;
let proximoIntento = 0;
let ultimaRepublicacion = 0;

/** Vuelve a cero el freno. Se llama cuando el canal está sano de verdad. */
export function reiniciarFrenoDePresencia() {
  fallosSeguidos = 0;
  proximoIntento = 0;
}

function revisarSalud() {
  const entrada = vivo;
  if (!entrada) return;
  const ahora = Date.now();

  const estado = estadoDelCanal(entrada.canal);

  // 'joining' se dejaba pasar por sano, y ahí estaba el agujero: un canal que
  // se queda uniéndose PARA SIEMPRE nunca se rearmaba, y el tablero quedaba
  // vacío sin que nada lo notara. Unirse tarda menos de un segundo cuando
  // funciona; si lleva más de quince, no está tardando: está colgado.
  if (estado === "joining") {
    if (uniendoDesde === null) uniendoDesde = ahora;
    if (ahora - uniendoDesde < MAX_UNIENDO_MS) return;
    // Lleva demasiado: se lo trata como caído y sigue por el camino de abajo.
  } else {
    uniendoDesde = null;
  }

  // 'joined' es lo sano. Si quedó 'closed', 'errored' o colgado uniéndose hay
  // que rearmar — pero CON ESPERA CRECIENTE. Sin ella, un canal que no vuelve
  // se convierte en un martillo de un mensaje cada cuatro segundos que tira el
  // socket entero.
  if (typeof estado === "string" && estado !== "joined") {
    if (ahora < proximoIntento) return;
    fallosSeguidos += 1;
    proximoIntento = ahora + Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** (fallosSeguidos - 1));

    const { sessionId, userId, oyentes, ultimoEstado, usos } = entrada;
    cerrarCanal(entrada);
    const nueva = abrirCanal(sessionId, userId);
    nueva.usos = usos;
    oyentes.forEach((f) => nueva.oyentes.add(f));
    nueva.ultimoEstado = ultimoEstado;
    vivo = nueva;
    // Si esta persona estaba publicando su estado, lo vuelve a publicar: si no,
    // reaparecería en el tablero de los demás pero sin cámara ni micro.
    if (ultimoEstado) { publicar(nueva, ultimoEstado); ultimaRepublicacion = ahora; }
    return;
  }

  // Llegó acá: el canal está sano. Se afloja el freno.
  fallosSeguidos = 0;
  proximoIntento = 0;

  // Aunque el canal esté sano, se relee: un `sync` perdido no deja rastro.
  // Esto NO manda nada, solo lee lo que ya está en memoria — es gratis.
  const estados = leerEstados(entrada.canal);
  entrada.oyentes.forEach((f) => f(estados));

  // Y el chequeo que de verdad importa para quien PUBLICA: "yo debería
  // aparecer en esta sala, ¿aparezco?". Si no, se reanuncia — pero con techo:
  // reanunciarse es un mensaje más, y hacerlo en cada tic era la otra mitad del
  // martillo. Si sigo sin aparecer, el próximo intento es en veinte segundos,
  // no en cuatro.
  const aPublicar = entrada.ultimoEstado ?? ultimoEstadoPendiente;
  if (!aPublicar) return;              // esta persona no publica (es el supervisor)
  if (estados[entrada.userId]) { noAparezco = 0; return; }   // aparezco: todo bien
  if (ahora - ultimaRepublicacion < MIN_ENTRE_REPUBLICACIONES_MS) return;
  ultimaRepublicacion = ahora;
  noAparezco += 1;

  // Me reanuncié varias veces y sigo sin figurar. El canal dice estar unido,
  // pero el servidor no me ve: es el cuadro que deja el corte por límite de
  // presencia. Reanunciarse otra vez es hablarle a un teléfono descolgado.
  if (noAparezco >= REINTENTOS_ANTES_DE_REHACER) {
    noAparezco = 0;
    console.warn(
      "[Cowork] Me reanuncié", REINTENTOS_ANTES_DE_REHACER,
      "veces y sigo sin aparecer en la sala — rehago el canal.",
    );
    const { sessionId, userId, oyentes, ultimoEstado, usos } = entrada;
    olvidarPendiente();
    cerrarCanal(entrada);
    const nueva = abrirCanal(sessionId, userId);
    nueva.usos = usos;
    oyentes.forEach((f) => nueva.oyentes.add(f));
    nueva.ultimoEstado = ultimoEstado;
    vivo = nueva;
    return;   // el `subscribe` del canal nuevo reanuncia solo
  }

  publicar(entrada, aPublicar);
}

function arrancarRevisor() {
  if (revisor !== null) return;
  revisor = window.setInterval(revisarSalud, REVISION_MS);
  // Volver a la pestaña es EL momento en que el coordinador vuelve a mirar:
  // ahí no se espera al próximo tic.
  document.addEventListener("visibilitychange", alVolverAMirar);
}

function alVolverAMirar() {
  if (document.visibilityState === "visible") revisarSalud();
}

/** Cierra la presencia de verdad. Solo al salir de la sala o cambiar de sesión:
 *  desde acá el resto ve el `leave`, que es lo correcto en ese caso. */
export function salirDePresencia() {
  ultimoEstadoPendiente = null;
  olvidarPendiente();
  ultimaPublicacion = 0;
  noAparezco = 0;
  // Se va de Cowork de verdad: el contador de "sin compartir" arranca de cero
  // la próxima vez. Arrastrarlo entre sesiones haría que alguien que vuelve
  // mañana entre ya con el aviso disparado.
  selloPantalla = null;
  fallosSeguidos = 0;
  proximoIntento = 0;
  ultimaRepublicacion = 0;
  uniendoDesde = null;
  if (!vivo) return;
  cerrarCanal(vivo);
  vivo = null;
}

export function useCoworkMediaPresence(
  sessionId: string | undefined,
  userId: string | undefined,
  // Solo el chatter: su presencia debe sobrevivir a que navegue a otra sección
  // de Maven, porque su llamada también sobrevive. El dashboard del coordinador
  // no lo necesita — cuando cierra el dashboard, deja de mirar y ya.
  opciones?: { persistente?: boolean },
): UseCoworkMediaPresenceResult {
  const [mediaStates, setMediaStates] = useState<Record<string, MediaState>>({});
  const persistente = !!opciones?.persistente;
  // En una ref para que cambiarla no re-suscriba el canal.
  const persistenteRef = useRef(persistente);
  persistenteRef.current = persistente;

  useEffect(() => {
    if (!sessionId || !userId) return;

    // Cambió la sesión (o el usuario): el canal viejo ya no sirve para nada.
    if (vivo && (vivo.sessionId !== sessionId || vivo.userId !== userId)) {
      cerrarCanal(vivo);
      vivo = null;
    }
    if (!vivo) vivo = abrirCanal(sessionId, userId);
    arrancarRevisor();

    const entrada = vivo;
    entrada.usos += 1;
    entrada.oyentes.add(setMediaStates);
    // Si el canal ya estaba abierto, arrancar con lo que ya sabe en vez de
    // esperar al próximo evento (si no, la lista aparece vacía un instante).
    setMediaStates(leerEstados(entrada.canal));

    return () => {
      entrada.oyentes.delete(setMediaStates);
      entrada.usos -= 1;
      // Acá está el arreglo: si nadie lo mira PERO la presencia es persistente,
      // el canal se queda abierto. Cerrarlo mandaría un `leave` y el
      // coordinador vería irse a alguien que sigue en la llamada.
      if (entrada.usos <= 0 && !persistenteRef.current && vivo === entrada) {
        cerrarCanal(entrada);
        vivo = null;
      }
    };
  }, [sessionId, userId]);

  const trackMediaState = useCallback(
    (state: MediaState) => {
      ultimoEstadoPendiente = state;
      const entrada = vivo;
      if (!entrada || entrada.userId !== userId) return;  // se publicará al abrir el canal
      publicar(entrada, state);
    },
    [userId],
  );

  return { mediaStates, trackMediaState };
}
