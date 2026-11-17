// Tiempo trabajado en Cowork — la regla que decide si el reloj CORRE o está
// DETENIDO en un instante dado. Es puro (sin Deno ni navegador) para que la
// edge `cowork-session` y los tests del frontend usen exactamente la misma.
//
// Decisión de Jhon (07/09/2026), preparando el reemplazo de Hubstaff:
//   · Cuenta el tiempo dentro de una sala de Cowork con cámara encendida Y
//     pantalla compartida, las dos a la vez.
//   · Se detiene si se apaga la cámara, si deja de compartir pantalla, si está
//     en pausa (baño/break), o si la cámara está prendida pero NO HAY NADIE
//     delante ("fuera de cámara" = el detector no registra a nadie, literal).
//   · Mal encuadre, muy lejos, poca luz NO detienen el reloj: para eso están
//     las alertas de siempre con las reglas del supervisor.
//   · Tolerancia: agacharse tres segundos no descuenta. La ausencia tiene que
//     durar UMBRAL_FUERA_DE_CAMARA_MS para que el reloj se detenga.
//
// Decisión de Jhon (29/09/2026), sobre las caídas de la sala:
//   · Cuando se cae la sala de LiveKit, la lista de participantes se vacía y la
//     cámara de todo el mundo se ve apagada aunque esté prendida. Antes eso se
//     anotaba como "sin cámara" y se le cobraba la caída a quien estaba
//     trabajando. Ahora es un estado propio: "sin_conexion".
//   · Se pagan los cortes cortos, que son los más comunes: hasta
//     TOPE_SIN_CONEXION_MS pagados por cada VENTANA_SIN_CONEXION_MS. Pasado eso
//     es "sin_conexion_larga": deja de contar y queda a la vista del supervisor.
//   · Es un PRESUPUESTO por ventana y no un tope desde el inicio del tramo: con
//     el tope por tramo, cualquier tramo en el medio (tocar "Baño" unos
//     segundos, un latido "conectada") arrancaba una caída nueva con diez
//     minutos frescos, y una caída de una hora se cobraba casi entera.
//   · Se mide con los tramos guardados en la base (reloj del SERVIDOR), nunca
//     con un dato del navegador.
//   · Si cuando se cayó la sala la persona venía SIN COBRAR (cámara apagada, sin
//     pantalla, fuera de cámara: una racha de NO_COBRABA_DESDE_MS o más), la
//     caída no le regala tiempo: lo que se protege es a quien estaba trabajando.

export type EstadoTiempo =
  | "activo" | "pausa" | "sin_camara" | "sin_pantalla" | "fuera_de_camara" | "meet"
  | "sin_conexion" | "sin_conexion_larga";

export const ESTADOS_TIEMPO: readonly EstadoTiempo[] = [
  "activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara", "meet",
  "sin_conexion", "sin_conexion_larga",
];

/** Cómo está la persona respecto de la sala de LiveKit, según su navegador.
 *  · conectada: en la sala.
 *  · reconectando: LiveKit está reintentando (hasta ~19 s). La lista de
 *    participantes NO se vacía y lo que dice la cámara sigue siendo cierto, así
 *    que se aplica la regla de siempre.
 *  · desconectada: fuera de la sala (se cayó, o todavía está entrando). Lo que
 *    diga la cámara ya no vale: con la sala caída se ve apagada.
 *  · reemplazada: otra pestaña u otro equipo tomó su lugar en la sala. Esa
 *    pestaña deja de latir (coworkLatido): manda la que de verdad está adentro.
 *  · dormido: el equipo se durmió y la sala se cayó por eso. No se vuelve solo
 *    (espera a la persona) y ese tiempo no se paga. */
export type ConexionSala = "conectada" | "reconectando" | "desconectada" | "reemplazada" | "dormido";

export const CONEXIONES_SALA: readonly ConexionSala[] = ["conectada", "reconectando", "desconectada", "reemplazada", "dormido"];

/** Cuánto tiempo de caídas de la sala se paga por ventana. */
export const TOPE_SIN_CONEXION_MS = 10 * 60_000;
/** La ventana del presupuesto de caídas pagadas. */
export const VENTANA_SIN_CONEXION_MS = 60 * 60_000;
/** Un tramo sin cobrar que dura esto ya dice "no estaba trabajando". Menos que
 *  esto puede ser el parpadeo de volver a publicar la cámara al reconectar. */
export const NO_COBRABA_DESDE_MS = 60_000;

/** Cuánto tiene que durar el "no hay nadie" para detener el reloj. */
export const UMBRAL_FUERA_DE_CAMARA_MS = 60_000;
/** Cada cuánto late el cliente mientras está en la sala. */
export const INTERVALO_LATIDO_MS = 30_000;
/** Sin latidos durante este tiempo el segmento abierto se da por terminado en
 *  el último latido visto: una pestaña que se cerró sin avisar no suma. */
export const LATIDO_VENCIDO_MS = 90_000;

export interface Latido {
  camOn: boolean;
  screenShareOn: boolean;
  /** Estado del detector de la propia cámara: "ok" | "no_face" | "too_small" | "too_dark". */
  faceState?: string | null;
  /** Epoch ms desde que el detector está en `faceState`. */
  faceSince?: number | null;
  onBreak?: boolean;
  /** Llevado a un meet grupal por su supervisor: cuenta como trabajo aunque
   *  no comparta pantalla (en el meet no se comparte). La pausa manda igual. */
  enMeet?: boolean;
  /** Ausente o null = no se sabe (un navegador con la versión anterior, o
   *  antes del primer aviso de la sala): se aplica la regla de siempre. */
  conexionSala?: ConexionSala | null;
}

export interface Veredicto {
  estado: EstadoTiempo;
  /** Sub-dato útil para depurar: el faceState cuando aplica. */
  detalle: string | null;
}

/** Qué exige la sesión. El reloj pide lo mismo que las alertas del supervisor:
 *  si apagó la pantalla para su equipo (managers), el reloj no se detiene por
 *  pantalla; si apagó la cámara, tampoco por cámara ni por "fuera de cámara"
 *  (sin cámara no hay detector). Decisión de Jhon (07/09): depende de lo que
 *  tenga configurado el supervisor. */
export interface Exigencias {
  camara: boolean;
  pantalla: boolean;
}

export const EXIGE_TODO: Exigencias = { camara: true, pantalla: true };

/** ¿Corre el reloj en este instante? Prioridad: pausa > meet > sin conexión >
 *  sin cámara > sin pantalla > fuera de cámara > activo — cada una solo si la
 *  sesión la exige.
 *
 *  `caidaPagada`: si una caída de la sala AHORA se paga. Lo decide el servidor
 *  con `caidaSePaga` (presupuesto por ventana y qué estaba haciendo antes). */
export function estadoDeTiempo(
  l: Latido, ahora: number, umbralFueraMs = UMBRAL_FUERA_DE_CAMARA_MS, exige: Exigencias = EXIGE_TODO,
  caidaPagada = true,
): Veredicto {
  if (l.onBreak) return { estado: "pausa", detalle: null };
  if (l.enMeet) return { estado: "meet", detalle: null };
  // El equipo se durmió (Alvaro, 17/11/2026; frontend/src/lib/equipoDormido.ts):
  // no es una caída de la sala ni se paga, exija lo que exija la sesión. Un
  // equipo dormido que despierta un minuto latía «desconectada» y se le pagaba
  // como caída.
  if (l.conexionSala === "dormido") return { estado: "sin_conexion_larga", detalle: "equipo_dormido" };
  // La sala se cayó. Va DESPUÉS del meet: en el meet la sala no reporta, y un
  // "desconectada" que quedó pegado no puede ganarle.
  // Solo si la sesión exige cámara o pantalla: si no exige ninguna, el reloj
  // nunca dependió de la sala y una caída no tiene por qué detenerlo.
  if ((exige.camara || exige.pantalla) && l.conexionSala === "desconectada") {
    return { estado: caidaPagada ? "sin_conexion" : "sin_conexion_larga", detalle: null };
  }
  if (exige.camara && !l.camOn) return { estado: "sin_camara", detalle: null };
  if (exige.pantalla && !l.screenShareOn) return { estado: "sin_pantalla", detalle: null };
  // "Fuera de cámara" solo tiene sentido si la cámara se exige y está encendida.
  if (exige.camara && l.camOn && l.faceState === "no_face") {
    // Un faceSince en el futuro (reloj del cliente adelantado) cuenta como "recién".
    const desde = typeof l.faceSince === "number" && l.faceSince <= ahora ? l.faceSince : ahora;
    if (ahora - desde >= umbralFueraMs) return { estado: "fuera_de_camara", detalle: "no_face" };
  }
  return { estado: "activo", detalle: l.faceState ?? null };
}

/** ¿El reloj corre en este estado? Es LA regla de qué se paga: el resto del
 *  código tiene que preguntarle a esta función, no repetir la lista a mano. */
export function cuentaComoTrabajo(estado: EstadoTiempo): boolean {
  return estado === "activo" || estado === "meet" || estado === "sin_conexion";
}

/** Un tramo guardado, como lo lee la edge. */
export interface TramoGuardado {
  estado: string;
  started_at: string;
  ended_at: string | null;
  last_seen_at: string;
}

/** Pasado este hueco sin latidos, lo que la persona hacía antes ya no dice nada
 *  de la caída de ahora: es otra caída. Menos que esto (un corte de red de unos
 *  minutos) NO borra lo de antes: si no, bastaba un corte de 90 s para que alguien
 *  con la cámara apagada cobrara la caída. */
export const HUECO_NUEVA_CAIDA_MS = 30 * 60_000;

const inicioDe = (t: TramoGuardado) => Date.parse(t.started_at);
/** Hasta dónde se VIO el tramo: el cierre, o el último latido si sigue abierto. */
const finDe = (t: TramoGuardado) => Date.parse(t.ended_at ?? t.last_seen_at);

/** Cuánto de caídas PAGADAS lleva la persona en la ventana, según la base.
 *  El tramo abierto cuenta hasta `ahora` si sigue vigente (así nunca se paga
 *  más que el tope), y hasta su último latido si venció (se va a cerrar ahí). */
export function sinConexionPagadaMs(
  tramos: readonly TramoGuardado[], ahora: number, abiertoVigente: boolean, ventanaMs = VENTANA_SIN_CONEXION_MS,
): number {
  const desde = ahora - ventanaMs;
  let total = 0;
  for (const t of tramos) {
    if (t.estado !== "sin_conexion") continue;
    const ini = inicioDe(t);
    const fin = t.ended_at ? Date.parse(t.ended_at) : abiertoVigente ? ahora : Date.parse(t.last_seen_at);
    if (!Number.isFinite(ini) || !Number.isFinite(fin)) continue;
    total += Math.max(0, Math.min(fin, ahora) - Math.max(ini, desde));
  }
  return total;
}

/** Estados en que la persona no estaba cobrando. La caída larga está: una caída
 *  que ya no se paga no vuelve a pagarse sola porque en el medio hubo un
 *  reconectar de segundos. */
const RACHA_SIN_COBRAR: ReadonlySet<string> = new Set(["sin_camara", "sin_pantalla", "fuera_de_camara", "sin_conexion_larga"]);

/** ¿La persona venía SIN COBRAR cuando se cayó la sala? Mira la RACHA de tramos
 *  de esta sesión hacia atrás, no solo el último: apagar la cámara 30 s después
 *  de llevar 20 min sin compartir pantalla sigue siendo "no estaba cobrando".
 *  · La racha se corta con un tramo que sí cobraba, o con un hueco entre tramos
 *    de más de LATIDO_VENCIDO_MS.
 *  · ⚠️ La PAUSA es transparente: ni corta ni suma. Si cortara, tocar "Baño"
 *    unos segundos volvía pagable una caída que no se pagaba; si el último
 *    tramo es una pausa, decide lo que había antes (quien volvió del baño
 *    trabajando cobra; quien venía sin cobrar, no). */
export function noCobrabaAlCaerse(tramosDeLaSesion: readonly TramoGuardado[], ahora: number): boolean {
  const orden = tramosDeLaSesion
    .filter((t) => Number.isFinite(inicioDe(t)) && Number.isFinite(finDe(t)))
    .sort((a, b) => inicioDe(b) - inicioDe(a)); // el más nuevo primero
  if (!orden.length || ahora - finDe(orden[0]) > HUECO_NUEVA_CAIDA_MS) return false;
  let inicioSiguiente: number | null = null; // para medir el hueco con el tramo más nuevo
  let visto = 0; // lo que se VIO sin cobrar (sin contar pausas)
  let primero = true;
  for (const t of orden) {
    if (inicioSiguiente !== null && inicioSiguiente - finDe(t) > LATIDO_VENCIDO_MS) break;
    inicioSiguiente = inicioDe(t);
    if (t.estado === "pausa") continue;
    if (!RACHA_SIN_COBRAR.has(t.estado)) break;
    // Una caída que ya no se paga sigue sin pagarse mientras dure.
    if (primero && t.estado === "sin_conexion_larga") return true;
    primero = false;
    // Hasta el último latido: no hasta ahora, que puede incluir un corte de red
    // en el que no se sabe qué pasó.
    visto += finDe(t) - inicioDe(t);
    if (visto >= NO_COBRABA_DESDE_MS) return true;
  }
  return false;
}

/** ¿Una caída de la sala, AHORA, se paga? Si venía sin cobrar, no; si no, hasta
 *  agotar el presupuesto de la ventana. */
export function caidaSePaga(noCobraba: boolean, pagadoMs: number): boolean {
  return !noCobraba && pagadoMs < TOPE_SIN_CONEXION_MS;
}

// ── DOS EQUIPOS DE LA MISMA PERSONA ──────────────────────────────────────────
// Hay UN solo tramo abierto por persona. Con Cowork abierto en dos equipos (la
// laptop que perdió el wifi y el teléfono al que se pasó a trabajar), los dos
// laten: el teléfono dice "trabajando" y la laptop, que quedó fuera de la sala,
// dice "sin conexión". Cada latido cerraba el tramo del otro y abría el suyo,
// cada tramo duraba casi cero, y el tiempo trabajado en el teléfono no sumaba
// mientras la laptop siguiera abierta. Ya pasaba antes de 'sin_conexion' (la
// laptop decía "sin cámara"). Por eso cada pestaña se identifica (`equipo`).

/** Cuánto hace que latió el OTRO equipo para darlo todavía por adentro: un poco
 *  más que un latido (30 s). Si se fue, a los 45 s manda el que queda. */
export const OTRO_EQUIPO_VIVO_MS = 45_000;

/** Estados que solo produce un equipo que está (o estuvo hasta recién) EN la
 *  sala. Los de caída no: si el otro también está afuera, no hay a quién darle
 *  prioridad. */
const ESTADOS_EN_SALA: ReadonlySet<string> = new Set(["activo", "meet", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara"]);

/** ¿Este latido viene de un equipo que quedó AFUERA de la sala mientras otro
 *  equipo de la misma persona sigue adentro? Si sí, la edge lo ignora sin tocar
 *  el tramo. Sin `equipo` (una pestaña con la versión anterior) nunca: queda
 *  como antes. */
export function latidoDeEquipoAfuera(
  abierto: { estado: string; equipo?: string | null; last_seen_at: string } | null,
  equipo: string | null,
  conexionSala: ConexionSala | null | undefined,
  ahora: number,
): boolean {
  // No se exige que el tramo sea de esta misma sala o sesión: si la laptop quedó
  // asignada a otra, igual le robaba el tramo al teléfono que está trabajando.
  if (!equipo || !abierto || !abierto.equipo || abierto.equipo === equipo) return false;
  // Este equipo está en la sala: manda él (si el otro también estuviera, LiveKit
  // echa a uno con "otra pestaña" y ese deja de latir).
  if (conexionSala === "conectada" || conexionSala === "reconectando") return false;
  if (!ESTADOS_EN_SALA.has(abierto.estado)) return false;
  const visto = Date.parse(abierto.last_seen_at);
  return Number.isFinite(visto) && ahora - visto <= OTRO_EQUIPO_VIVO_MS;
}

/** El identificador de la pestaña, tal como llegó. Estricto: cualquier otra cosa
 *  es "no se sabe", que es la regla de siempre. */
export function equipoDeCuerpo(body: Record<string, unknown>): string | null {
  const e = body.equipo;
  return typeof e === "string" && e.length > 0 && e.length <= 64 ? e : null;
}

/** Arma el latido con lo que mandó el navegador. Estricto: lo que no llega o
 *  llega con otro tipo queda como "no se sabe", nunca como un valor inventado.
 *  La pausa y el meet vienen de la BASE (sobreviven a recargar la pestaña). */
export function latidoDeCuerpo(body: Record<string, unknown>, base: { enPausa: boolean; enMeet: boolean }): Latido {
  const conexion = body.conexionSala;
  return {
    camOn: body.camOn === true,
    screenShareOn: body.screenShareOn === true,
    faceState: typeof body.faceState === "string" ? body.faceState : null,
    faceSince: typeof body.faceSince === "number" ? body.faceSince : null,
    onBreak: base.enPausa || body.onBreak === true,
    enMeet: base.enMeet,
    conexionSala: typeof conexion === "string" && (CONEXIONES_SALA as readonly string[]).includes(conexion)
      ? conexion as ConexionSala
      : null,
  };
}

// ── El anfitrión en un Meet de Maven (Alvaro, 17/11/2026) ─────────────────
// Luis (anfitrión) pasaba la mañana en reuniones de Meet y Cowork lo marcaba
// «fuera»: su Hub no latía y el reloj se detenía. Para quien es ANFITRIÓN de
// un Cowork, estar conectado en un Meet de Maven (salas `meet_…`) cuenta igual
// que estar en el Hub. Los chatters no: ellos trabajan en su sala.
//
// La señal es `llamada_maven_latido`: la pestaña de la llamada la refresca
// cada 30 s mientras está montada (lib/llamadaEnMaven.ts), con el nombre de la
// sala de LiveKit. Los registros de llamadas no sirven (casi nunca marcan fin).

/** ¿Es una sala de Meet de Maven? (las de Cowork son `cowork_…`, las del chat `call-…`). */
export function esSalaDeMeet(sala: string | null | undefined): boolean {
  return typeof sala === "string" && sala.startsWith("meet_");
}

/** ¿El latido de llamada dice que está AHORA en un Meet de Maven? Misma
 *  tolerancia que el reloj: sin latido en 90 s, ya no está. */
export function enMeetDeMaven(
  fila: { sala: string | null; last_seen_at: string } | null | undefined,
  ahora: number,
): boolean {
  if (!fila || !esSalaDeMeet(fila.sala)) return false;
  const visto = Date.parse(fila.last_seen_at);
  return Number.isFinite(visto) && ahora - visto <= LATIDO_VENCIDO_MS;
}
