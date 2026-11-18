import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { esEstadoSupervisor, type EstadoSupervisor, leerDesdePausaSupervisor } from "@/lib/pausaSupervisor";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import { escritorio } from "@/lib/escritorio";
import { equipoDeTrabajo, type EquipoDeTrabajo } from "@/lib/coworkSoloApp";

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
  /** "bano", "break" o "almuerzo": el supervisor necesita saber CUÁL, porque los
   *  topes son distintos y el de baño además es un presupuesto diario. Estaba
   *  viajando igual, pero fuera del tipo, así que cada lado lo leía con un cast. */
  breakKind?: "bano" | "break" | "almuerzo" | null;
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
  /** Cómo está respecto de la sala de LiveKit, según SU navegador. Llega fresco
   *  aunque la página de Cowork esté desmontada (la llamada sigue en la
   *  ventanita), a diferencia del reloj. null en los bundles viejos. */
  conexionSala?: ConexionSala | null;
  /** ¿Trabaja en la app de Maven para computador? (18/11/2026: desde el viernes
   *  Cowork en el computador va solo en la app). Lo pone `enviar` solo, sin que
   *  nadie lo pase; null = un Maven de antes que no lo dice (lib/coworkSoloApp). */
  enApp?: boolean | null;
  /** Mac, Windows, celular…: la app o el navegador de quien publica. */
  equipo?: EquipoDeTrabajo | null;
}

interface UseCoworkMediaPresenceResult {
  mediaStates: Record<string, MediaState>;
  trackMediaState: (state: MediaState) => void;
  /** Disponibilidad de cada supervisor de la sesión (clave = su user_id). `null` = disponible. */
  supervisores: Record<string, EstadoSupervisor | null>;
  /** Desde cuándo está en pausa cada supervisor (epoch ms); `null` si está disponible o no lo dijo. */
  supervisoresDesde: Record<string, number | null>;
  /** El supervisor anuncia break / lunch / ausente, o `null` = disponible. */
  trackEstadoSupervisor: (estado: EstadoSupervisor | null) => void;
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
type PayloadPresencia = Partial<MediaState> & {
  user_id?: string;
  /** Un supervisor publicando su disponibilidad (break/almuerzo/ausente). Va
   *  por el MISMO canal pero se lee APARTE: si entrara a `mediaStates` con la
   *  cámara en false, el tablero le pondría alertas de "sin pantalla" al
   *  propio supervisor. */
  esSupervisor?: boolean;
  supervisorEstado?: EstadoSupervisor | null;
  /** Desde cuándo (epoch ms). Lo ven los otros supervisores; el chatter no. */
  supervisorDesde?: number | null;
};

interface CanalVivo {
  sessionId: string;
  userId: string;
  canal: CanalRealtime;
  /** Cuántos componentes montados lo están usando. Llega a 0 al navegar y el
   *  canal SIGUE VIVO — es justamente el punto. */
  usos: number;
  /** Lo avisan a quien esté escuchando cuando cambia el estado de la sala. */
  oyentes: Set<(estados: Record<string, MediaState>, supervisores: Record<string, EstadoSupervisor | null>, supervisoresDesde: Record<string, number | null>) => void>;
  /** Lo último que se publicó, para poder re-publicarlo si hiciera falta. */
  ultimoEstado: MediaState | null;
  /** Si este canal lo abrió un SUPERVISOR: su disponibilidad. `undefined` = no
   *  publica disponibilidad (es un chatter). `null` = disponible. */
  ultimoSupervisor?: EstadoSupervisor | null;
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
/** Lo mismo para la disponibilidad del supervisor, cuando el canal aún no está. */
let ultimoSupervisorPendiente: EstadoSupervisor | null | undefined = undefined;

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
export function elegirPresencia<T extends { onBreak?: boolean; camOn?: boolean; screenShareOn?: boolean; conexionSala?: string | null }>(presencias: T[] | undefined): T | undefined {
  if (!presencias?.length) return undefined;
  const enPausa = presencias.find((p) => p.onBreak);
  if (enPausa) return enPausa;
  // Con dos conexiones de la misma persona (07/09: Cowork en dos pestañas),
  // manda la que está TRABAJANDO —cámara y pantalla— y no la más nueva: la
  // pestaña de fondo, sin cámara, era la que hacía sonar "cámara apagada" al
  // supervisor mientras la persona estaba perfectamente en la otra. A igual
  // puntaje, la más nueva (la última), como antes.
  //
  // Y antes que eso, la que está EN LA SALA: con la laptop fuera de la sala y el
  // teléfono adentro, el tablero tiene que mostrar el teléfono aunque tenga la
  // cámara apagada (la laptop mostraría "sin conexión" de alguien que está).
  let mejor = presencias[presencias.length - 1];
  let puntaje = -1;
  for (const p of presencias) {
    const enSala = p.conexionSala === "conectada" || p.conexionSala === "reconectando";
    const pts = (enSala ? 4 : 0) + (p.camOn ? 2 : 0) + (p.screenShareOn ? 1 : 0);
    if (pts >= puntaje) { puntaje = pts; mejor = p; }
  }
  return mejor;
}

/** De las conexiones de una clave, cuáles son GENTE y cuál es la disponibilidad
 *  del supervisor (si alguna la trae). Puro, para probarlo. */
export function separarPresencias<T extends { esSupervisor?: boolean; supervisorEstado?: unknown; supervisorDesde?: unknown }>(
  presencias: T[] | undefined,
): { gente: T[]; supervisor: EstadoSupervisor | null | undefined; supervisorDesde: number | null } {
  const gente = (presencias ?? []).filter((p) => !p.esSupervisor);
  const deSupervisor = (presencias ?? []).filter((p) => p.esSupervisor);
  if (!deSupervisor.length) return { gente, supervisor: undefined, supervisorDesde: null };
  const ultima = deSupervisor[deSupervisor.length - 1];
  const supervisor = esEstadoSupervisor(ultima.supervisorEstado) ? ultima.supervisorEstado : null;
  return { gente, supervisor, supervisorDesde: supervisor && typeof ultima.supervisorDesde === "number" ? ultima.supervisorDesde : null };
}

function leerSupervisores(canal: CanalRealtime): Record<string, EstadoSupervisor | null> {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, EstadoSupervisor | null> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const { supervisor } = separarPresencias(presencias);
    if (supervisor !== undefined) resultado[key] = supervisor;
  });
  return resultado;
}

/** Desde cuándo está en pausa cada supervisor (clave = user_id); solo los que lo publicaron. */
function leerSupervisoresDesde(canal: CanalRealtime): Record<string, number | null> {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, number | null> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const { supervisor, supervisorDesde } = separarPresencias(presencias);
    if (supervisor !== undefined) resultado[key] = supervisorDesde;
  });
  return resultado;
}

function leerEstados(canal: CanalRealtime) {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, MediaState> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const ultima = elegirPresencia(separarPresencias(presencias).gente);
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
      conexionSala: ultima.conexionSala ?? null,
      ...leerEquipo(ultima),
    };
  });
  return resultado;
}

/** Lo que dijo de su equipo, sin confiar en la forma: un Maven viejo no manda
 *  nada y eso queda en null («sin dato»), nunca en «navegador». Exportada para probarla. */
export function leerEquipo(p: { enApp?: unknown; equipo?: unknown }): { enApp: boolean | null; equipo: EquipoDeTrabajo | null } {
  const equipos: readonly string[] = ["mac", "windows", "linux", "celular", "otro"];
  return {
    enApp: typeof p.enApp === "boolean" ? p.enApp : null,
    equipo: typeof p.equipo === "string" && equipos.includes(p.equipo) ? (p.equipo as EquipoDeTrabajo) : null,
  };
}

/** Lo que ESTE Maven dice de sí mismo. Se calcula al publicar: es barato. */
function miEquipo(): { enApp: boolean; equipo: EquipoDeTrabajo } {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  return equipoDeTrabajo({
    ua: nav?.userAgent || "",
    tactil: (nav?.maxTouchPoints ?? 0) > 1,
    plataformaApp: escritorio()?.plataforma ?? null,
  });
}

// Desde cuándo está (o no está) compartiendo pantalla.
//
// Vive FUERA del canal a propósito. Si viviera en la entrada del canal, cada
// reconexión —que rehace el canal— reiniciaría el contador, y alguien que lleva
// cinco minutos sin compartir volvería a cero cada vez que le parpadea el wifi.
// Justo la persona a la que hay que avisarle sería la que nunca dispara el
// aviso.
let selloPantalla: { compartiendo: boolean; desde: number } | null = null;
// Al volver de una caída de la sala, "sin compartir pantalla" cuenta de nuevo
// SI la pantalla se cortó por la caída. Sin esto, apenas reconectaba el tablero
// decía "lleva 7 minutos sin compartir pantalla" contando la caída, y afirmaba
// avisos que nunca le habían llegado. Si ya no compartía desde ANTES de la caída,
// el contador sigue: si no, cada caída corta la volvía invisible al supervisor.
let conexionAnterior: ConexionSala | null = null;
let caidaDesde: number | null = null;

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
  if (state.conexionSala === "desconectada" && conexionAnterior !== "desconectada") caidaDesde = Date.now();
  if (conexionAnterior === "desconectada" && state.conexionSala != null && state.conexionSala !== "desconectada") {
    // Margen de 5 s: la pantalla se corta un instante antes de que llegue el
    // aviso de la caída.
    if (selloPantalla && !selloPantalla.compartiendo && caidaDesde !== null && selloPantalla.desde >= caidaDesde - 5_000) {
      selloPantalla = null;
    }
    caidaDesde = null;
  }
  if (state.conexionSala != null) conexionAnterior = state.conexionSala;
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

/** El supervisor anuncia su disponibilidad. Sin cola ni coalescencia: cambia
 *  un par de veces al día, no diez por segundo. */
function enviarSupervisor(entrada: CanalVivo, estado: EstadoSupervisor | null) {
  entrada.ultimoSupervisor = estado;
  // `desde` sale del store (es quien sabe cuándo se tocó la tacita); así el
  // re-anuncio al re-suscribirse conserva el tiempo real y no lo reinicia.
  const envio = entrada.canal.track({ user_id: entrada.userId, esSupervisor: true, supervisorEstado: estado, supervisorDesde: estado ? leerDesdePausaSupervisor() : null });
  void Promise.resolve(envio).then((r) => {
    if (r !== "ok") console.warn("[cowork] la disponibilidad del supervisor no se pudo publicar:", r);
  }).catch((e) => console.warn("[cowork] la disponibilidad del supervisor no se pudo publicar:", e));
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
    conexionSala: state.conexionSala ?? null,
    // App o navegador: va en CADA publicación (presence reemplaza el payload
    // entero), así nadie que llame a trackMediaState tiene que acordarse.
    ...miEquipo(),
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
function cerrarCanal(entrada: CanalVivo): Promise<void> {
  entrada.cerrando = true;
  // ⚠️ Devuelve la promesa, y quien REHACE el canal tiene que esperarla.
  //
  // El cliente de Realtime borra los canales POR NOMBRE, y solo cuando llega
  // el acuse del `leave` (RealtimeClient._remove filtra por topic, y
  // supabase.channel() devuelve el canal existente si el nombre coincide).
  // Cerrar y abrir seguidos, sin esperar, hacía dos cosas: `channel()` te
  // devolvía el canal VIEJO (todavía saliendo) en vez de uno nuevo, y cuando
  // llegaba el acuse el cliente lo sacaba de la tabla de ruteo. El canal creía
  // estar unido y el socket recibía la presencia de todos, pero a él no le
  // llegaba nada. Así quedó el tablero de Jhon el 07/09: frames de presencia
  // entrando por el socket y cero personas en pantalla.
  return Promise.resolve(supabase.removeChannel(entrada.canal)).then(() => undefined, () => undefined);
}

/** Rehace el canal BIEN: primero espera a que el viejo termine de salir, y
 *  recién ahí abre el nuevo con los mismos oyentes. Mientras tanto `vivo` es
 *  null, así que lo que se quiera publicar queda pendiente y sale con el
 *  SUBSCRIBED del nuevo. */
async function rehacerCanal(entrada: CanalVivo): Promise<CanalVivo | null> {
  const { sessionId, userId, oyentes, ultimoEstado, ultimoSupervisor, usos } = entrada;
  if (vivo === entrada) vivo = null;
  olvidarPendiente();
  await cerrarCanal(entrada);
  // Si en el ínterin alguien abrió otro (cambio de sesión, remount), ese manda.
  if (vivo) return vivo;
  const nueva = abrirCanal(sessionId, userId);
  nueva.usos = usos;
  oyentes.forEach((f) => nueva.oyentes.add(f));
  nueva.ultimoEstado = ultimoEstado;
  nueva.ultimoSupervisor = ultimoSupervisor;
  vivo = nueva;
  return nueva;
}

function abrirCanal(sessionId: string, userId: string): CanalVivo {
  const canal = supabase.channel(`cowork-media-${sessionId}`, {
    config: { presence: { key: userId } },
  });
  const entrada: CanalVivo = { sessionId, userId, canal, usos: 0, oyentes: new Set(), ultimoEstado: null };

  const avisar = () => {
    const estados = leerEstados(canal);
    const supervisores = leerSupervisores(canal);
    entrada.oyentes.forEach((f) => f(estados, supervisores, leerSupervisoresDesde(canal)));
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
        const disponibilidad = entrada.ultimoSupervisor !== undefined ? entrada.ultimoSupervisor : ultimoSupervisorPendiente;
        if (disponibilidad !== undefined) { ultimoSupervisorPendiente = undefined; enviarSupervisor(entrada, disponibilidad); }
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

    // El SUBSCRIBED del canal nuevo reanuncia solo lo último que se sabía: si
    // esta persona publicaba, reaparece con cámara y micro como estaban.
    if (entrada.ultimoEstado) ultimaRepublicacion = ahora;
    void rehacerCanal(entrada);
    return;
  }

  // Llegó acá: el canal está sano. Se afloja el freno.
  fallosSeguidos = 0;
  proximoIntento = 0;

  // Aunque el canal esté sano, se relee: un `sync` perdido no deja rastro.
  // Esto NO manda nada, solo lee lo que ya está en memoria — es gratis.
  const estados = leerEstados(entrada.canal);
  entrada.oyentes.forEach((f) => f(estados, leerSupervisores(entrada.canal), leerSupervisoresDesde(entrada.canal)));

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
    void rehacerCanal(entrada);
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
  ultimoSupervisorPendiente = undefined;
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
  // Sin canal no hay nada que vigilar: el revisor se apaga y se vuelve a
  // armar con el próximo canal (también deja los timers limpios en los tests).
  if (revisor !== null) { window.clearInterval(revisor); revisor = null; }
  document.removeEventListener("visibilitychange", alVolverAMirar);
  if (!vivo) return;
  void cerrarCanal(vivo);
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
  /** Disponibilidad de cada supervisor de la sesión (clave = su user_id).
   *  Solo aparecen los que la publicaron alguna vez; `null` = disponible. */
  const [supervisores, setSupervisores] = useState<Record<string, EstadoSupervisor | null>>({});
  const [supervisoresDesde, setSupervisoresDesde] = useState<Record<string, number | null>>({});
  const persistente = !!opciones?.persistente;
  // En una ref para que cambiarla no re-suscriba el canal.
  const persistenteRef = useRef(persistente);
  persistenteRef.current = persistente;

  useEffect(() => {
    if (!sessionId || !userId) return;
    let cancelado = false;
    let entrada: CanalVivo | null = null;

    const oyente = (estados: Record<string, MediaState>, sups: Record<string, EstadoSupervisor | null>, desdes: Record<string, number | null>) => {
      setMediaStates(estados);
      setSupervisores(sups);
      setSupervisoresDesde(desdes);
    };
    const engancharse = (e: CanalVivo) => {
      entrada = e;
      e.usos += 1;
      e.oyentes.add(oyente);
      // Si el canal ya estaba abierto, arrancar con lo que ya sabe en vez de
      // esperar al próximo evento (si no, la lista aparece vacía un instante).
      setMediaStates(leerEstados(e.canal));
      setSupervisores(leerSupervisores(e.canal));
      setSupervisoresDesde(leerSupervisoresDesde(e.canal));
    };

    const preparar = async () => {
      // Cambió la sesión (o el usuario): el canal viejo ya no sirve. Se ESPERA
      // a que termine de salir antes de abrir el nuevo (ver cerrarCanal).
      if (vivo && (vivo.sessionId !== sessionId || vivo.userId !== userId)) {
        const viejo = vivo;
        vivo = null;
        await cerrarCanal(viejo);
        if (cancelado) return;
      }
      if (!vivo) vivo = abrirCanal(sessionId, userId);
      arrancarRevisor();
      engancharse(vivo);
    };
    void preparar();

    return () => {
      cancelado = true;
      const e = entrada;
      if (!e) return;
      e.oyentes.delete(oyente);
      e.usos -= 1;
      // Acá está el arreglo: si nadie lo mira PERO la presencia es persistente,
      // el canal se queda abierto. Cerrarlo mandaría un `leave` y el
      // coordinador vería irse a alguien que sigue en la llamada.
      if (e.usos <= 0 && !persistenteRef.current && vivo === e) {
        void cerrarCanal(e);
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

  /** El supervisor anuncia break / almuerzo / ausente (o `null` = disponible). */
  const trackEstadoSupervisor = useCallback(
    (estado: EstadoSupervisor | null) => {
      ultimoSupervisorPendiente = estado;
      const entrada = vivo;
      if (!entrada || entrada.userId !== userId) return;  // sale con el SUBSCRIBED
      ultimoSupervisorPendiente = undefined;
      enviarSupervisor(entrada, estado);
    },
    [userId],
  );

  return { mediaStates, supervisores, supervisoresDesde, trackMediaState, trackEstadoSupervisor };
}
