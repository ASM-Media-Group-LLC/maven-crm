import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MediaState {
  micOn: boolean;
  camOn: boolean;
  screenShareOn: boolean;
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

function leerEstados(canal: CanalRealtime) {
  const estado = canal.presenceState<PayloadPresencia>();
  const resultado: Record<string, MediaState> = {};
  Object.entries(estado).forEach(([key, presencias]) => {
    const ultima = presencias?.[0];
    if (!ultima) return;
    resultado[key] = {
      micOn: !!ultima.micOn,
      camOn: !!ultima.camOn,
      screenShareOn: !!ultima.screenShareOn,
      onBreak: !!ultima.onBreak,
      breakStartedAt: ultima.breakStartedAt ?? null,
      breakKind: ultima.breakKind ?? null,
      faceState: ultima.faceState ?? null,
      faceSince: ultima.faceSince ?? null,
      banoConsumidoSeg: ultima.banoConsumidoSeg ?? null,
    };
  });
  return resultado;
}

function publicar(entrada: CanalVivo, state: MediaState) {
  entrada.ultimoEstado = state;
  entrada.canal.track({
    user_id: entrada.userId,
    micOn: state.micOn,
    camOn: state.camOn,
    screenShareOn: state.screenShareOn,
    onBreak: !!state.onBreak,
    breakStartedAt: state.onBreak ? (state.breakStartedAt ?? Date.now()) : null,
    breakKind: state.breakKind ?? null,
    faceState: state.faceState ?? null,
    faceSince: state.faceSince ?? null,
    banoConsumidoSeg: state.banoConsumidoSeg ?? null,
  });
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
      if (estado === "SUBSCRIBED" && aPublicar) publicar(entrada, aPublicar);
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

function revisarSalud() {
  const entrada = vivo;
  if (!entrada) return;

  const estado = estadoDelCanal(entrada.canal);
  // 'joined' es lo sano. Si quedó 'closed' o 'errored', rearmar: reintentar es
  // barato y quedarse mudo no.
  if (typeof estado === "string" && estado !== "joined" && estado !== "joining") {
    const { sessionId, userId, oyentes, ultimoEstado, usos } = entrada;
    supabase.removeChannel(entrada.canal);
    const nueva = abrirCanal(sessionId, userId);
    nueva.usos = usos;
    oyentes.forEach((f) => nueva.oyentes.add(f));
    nueva.ultimoEstado = ultimoEstado;
    vivo = nueva;
    // Si esta persona estaba publicando su estado, lo vuelve a publicar: si no,
    // reaparecería en el tablero de los demás pero sin cámara ni micro.
    if (ultimoEstado) publicar(nueva, ultimoEstado);
    return;
  }

  // Aunque el canal esté sano, se relee: un `sync` perdido no deja rastro.
  const estados = leerEstados(entrada.canal);
  entrada.oyentes.forEach((f) => f(estados));

  // Y el chequeo que de verdad importa para quien PUBLICA: "yo debería
  // aparecer en esta sala, ¿aparezco?". Si no, se reanuncia. Cubre cualquier
  // camino por el que se pierda el track sin que el canal se caiga.
  const aPublicar = entrada.ultimoEstado ?? ultimoEstadoPendiente;
  if (aPublicar && !estados[entrada.userId]) publicar(entrada, aPublicar);
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
  if (!vivo) return;
  supabase.removeChannel(vivo.canal);
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
      supabase.removeChannel(vivo.canal);
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
        supabase.removeChannel(entrada.canal);
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
