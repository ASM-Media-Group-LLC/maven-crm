import { useEffect, useRef, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { esperaDeReconexion, ESTADOS_MUERTOS } from "@/hooks/useCanalQueRevive";
import { escucharLaVuelta } from "@/hooks/useReanudarAlVolver";

/**
 * EL CANAL DEL CHAT: UNO por pestaña, para todos los que escuchan el Messenger.
 *
 * POR QUÉ. Realtime no junta escuchas: cada `.on("postgres_changes")` es una
 * fila de `realtime.subscription`, y por cada fila que cambia en la tabla corre
 * la RLS UNA VEZ POR ESCUCHA (`realtime.apply_rls` las recorre de a una). El
 * filtro, si lo hay, se mira ANTES que la RLS: una escucha cuyo filtro no deja
 * pasar la fila no cuesta nada.
 *
 * Los DELETE son otra cosa: NO pasan por la RLS. `apply_rls` le manda el borrado
 * a toda escucha cuyo filtro lo deje pasar (el filtro se evalúa sobre la fila
 * vieja completa: las tres tablas tienen REPLICA IDENTITY FULL) y de la fila
 * solo manda la llave (`old.id`), porque "no puede asegurar" el resto. Una
 * escucha de DELETE SIN filtro recibe el id y la hora de cada fila que se borra
 * en esa tabla, de cualquier agencia. Por eso aquí queda UNA sola, filtrada a
 * mis filas de `chat_participants` (ver abajo).
 *
 * Hasta el 28/09 cada pestaña abría, en cualquier pantalla:
 *  - TRES escuchas sin filtro del INSERT de `chat_messages` (la lista de
 *    useChat, los avisos de useMessengerNotifications y el globito de
 *    useUnreadChatCount; CUATRO en /messenger con las menciones);
 *  - DOS del UPDATE de `chat_participants` (TRES en /messenger), sin filtro,
 *    aunque tres de esos cuatro hooks solo miran la fila PROPIA;
 *  - una del UPDATE de `chat_conversations` sin filtro, que recibía el
 *    `updated_at` que se toca con CADA mensaje, también el de los directos.
 *
 * Medido en prod el 28/09 (82 pestañas, 40 personas; tasas desde el arranque del
 * 18/09): `chat_participants` recibe ~534 UPDATE por hora (cada vez que alguien
 * lee) contra 188 escuchas sin filtro → ~100.000 chequeos de RLS por hora, el
 * 70 % de todo lo que Realtime chequeaba del chat y la campana.
 *
 * AQUÍ: un solo canal por pestaña, UNA escucha por (tabla, evento), y cada evento
 * se reparte en memoria a quien se registró. Tres de ellas van filtradas:
 *  - `chat_participants` UPDATE → solo MI fila (`user_id=eq.<yo>`). Es la única
 *    que miran la lista (mute, modo, rol: recargar), el globito y las menciones.
 *    La fila de los demás solo importaba para el rol que muestra el panel de
 *    miembros, y ese panel ahora la escucha él mismo, filtrada por SU
 *    conversación y solo mientras está abierto (GroupMembersPanel.tsx).
 *  - `chat_conversations` UPDATE → solo GRUPOS (`type=eq.group`). La lista solo
 *    copia nombre, foto y descripción, que en un directo no existen: el 75 % de
 *    los mensajes son de directos y cada uno movía `updated_at` para nada.
 *  - `chat_participants` DELETE → solo MI fila (`user_id=eq.<yo>`). Es lo único
 *    de un borrado que la lista puede usar: me sacaron de un grupo, salí desde
 *    otra pestaña, o borraron la conversación entera (delete_conversation_cascade
 *    borra una por una las participaciones antes que la conversación). Hasta el
 *    30/09 había tres DELETE sin filtro: el de `chat_messages` y el de
 *    `chat_participants` leían `old.conversation_id`, que en prod nunca llega
 *    (solo llega `old.id`), así que no hacían nada; el de `chat_conversations`
 *    sí servía, y esta escucha lo reemplaza sin enterarse de lo ajeno.
 *
 * Reglas que heredó de useCanalQueRevive (ver ahí el porqué de cada una):
 *  - topic VERSIONADO y la versión NUNCA se reinicia (#1603: pedir el mismo
 *    topic tras un CLOSED devuelve el zombi);
 *  - espera creciente entre intentos, con tope;
 *  - el CLOSED que dispara nuestro propio removeChannel no programa nada;
 *  - al volver del segundo plano o recuperar la red, canal nuevo.
 */

type Tabla = "chat_messages" | "chat_participants" | "chat_conversations";
type Evento = "INSERT" | "UPDATE" | "DELETE";

export type EscuchaDelChat =
  | "chat_messages:INSERT"
  | "chat_messages:UPDATE"
  | "chat_participants:INSERT"
  | "chat_participants:UPDATE"
  | "chat_participants:DELETE"
  | "chat_conversations:UPDATE";

type Definicion = {
  tabla: Tabla;
  evento: Evento;
  /** Filtro de Realtime (se evalúa antes que la RLS). Sin filtro = toda la tabla. */
  filtro?: (userId: string) => string;
};

/** Qué escucha el canal. FIJO: la lista (useChat, montada en el AppShell) usa
 *  las seis, así que no hay nada que ganar abriendo menos, y un conjunto fijo
 *  evita rearmar el canal cuando se suma alguien que pide otra.
 *  ⚠️ Un DELETE nuevo va FILTRADO a algo mío o no va: sin filtro, Realtime le
 *  manda a cada pestaña los borrados de toda la base (ver arriba). */
export const ESCUCHAS_DEL_CHAT: Readonly<Record<EscuchaDelChat, Definicion>> = {
  "chat_messages:INSERT": { tabla: "chat_messages", evento: "INSERT" },
  "chat_messages:UPDATE": { tabla: "chat_messages", evento: "UPDATE" },
  "chat_participants:INSERT": { tabla: "chat_participants", evento: "INSERT" },
  "chat_participants:UPDATE": { tabla: "chat_participants", evento: "UPDATE", filtro: (uid) => `user_id=eq.${uid}` },
  "chat_participants:DELETE": { tabla: "chat_participants", evento: "DELETE", filtro: (uid) => `user_id=eq.${uid}` },
  "chat_conversations:UPDATE": { tabla: "chat_conversations", evento: "UPDATE", filtro: () => "type=eq.group" },
};

// Las filas llegan tal cual de la base; cada consumidor las lee como siempre.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;
export type CargaDelChat = { new: Fila; old: Fila };

export type OyentesDelChat = { [K in EscuchaDelChat]?: (carga: CargaDelChat) => void } & {
  /** Cada vez que el canal queda SUBSCRIBED, también la primera. Quien se suma
   *  con el canal ya conectado recibe el suyo igual (como si el canal fuera
   *  suyo): la lista recarga ahí, que es lo que hacía con su canal propio. */
  alSuscribir?: () => void;
  /** SUBSCRIBED después de una caída o de volver del segundo plano: momento de
   *  traer lo que se perdió mientras no había canal. */
  alRevivir?: () => void;
};

export type RefDeOyentes = { current: OyentesDelChat };

type Centro = {
  userId: string;
  oyentes: Set<RefDeOyentes>;
  canal: RealtimeChannel | null;
  suscrito: boolean;
  huboCaida: boolean;
  intento: number;
  timer: ReturnType<typeof setTimeout> | null;
  armadoPendiente: boolean;
  cierrePendiente: boolean;
  soltarVuelta: () => void;
};

const centros = new Map<string, Centro>();
// Global y creciente a propósito: si todos se van y vuelven (cambio de cuenta,
// remonte del AppShell), el topic nuevo no puede coincidir con uno que todavía
// se está yendo.
let version = 0;

export function topicDelCanalDelChat(userId: string, v: number): string {
  return `chat-${userId}::v${v}`;
}

// ── SALUD DE LA CONEXIÓN (para el banner y el poll adaptativo) ────────────────
//
// Una sola señal por pestaña: ¿el realtime del chat está entregando? El canal de
// la conversación abierta (useChat) comparte ESTE mismo websocket, así que cuando
// este se cae —socket muerto, JWT vencido— aquel también. Es un proxy honesto de
// "los mensajes llegan solos": cuando dice "reconectando", la app muestra el aviso
// y acelera el repaso de la conversación a ~4s; al volver a "en-vivo" se apaga el
// aviso y no hay poll extra (así lo quiso Alvaro: red extra solo cuando cae).
export type SaludDelChat = "conectando" | "en-vivo" | "reconectando";

let saludActual: SaludDelChat = "conectando";
const oyentesSalud = new Set<() => void>();

// La salud se arma de VARIAS fuentes: el canal compartido de la lista ("lista") y
// el canal de cada conversación abierta (useChat, una por ventana). Que la lista
// esté en vivo NO garantiza que la conversación abierta entregue —son canales
// distintos con su propio reintento—, así que la salud global es la PEOR de las
// fuentes: si alguna reconecta, "reconectando"; si no, "en-vivo" si alguna
// entrega; "conectando" si no hay ninguna. Así el banner y el poll se encienden
// mientras CUALQUIER canal del chat esté caído, no solo el de la lista.
const fuentesSalud = new Map<string, SaludDelChat>();

function emitirSalud(s: SaludDelChat): void {
  if (saludActual === s) return;
  saludActual = s;
  for (const avisar of Array.from(oyentesSalud)) {
    try {
      avisar();
    } catch (err) {
      console.error("[canalDelChat] un oyente de salud falló:", err);
    }
  }
}

function recomputarSalud(): void {
  let next: SaludDelChat = "conectando";
  for (const estado of fuentesSalud.values()) {
    if (estado === "reconectando") { next = "reconectando"; break; }
    if (estado === "en-vivo") next = "en-vivo";
  }
  emitirSalud(next);
}

/** Una fuente reporta su estado. "conectando" la retira (ya no cuenta). La salud
 *  global queda como la peor de las fuentes vivas (ver arriba). */
export function reportarSaludDelChat(fuente: string, estado: SaludDelChat): void {
  if (estado === "conectando") fuentesSalud.delete(fuente);
  else fuentesSalud.set(fuente, estado);
  recomputarSalud();
}

export function saludDelChatAhora(): SaludDelChat {
  return saludActual;
}

function suscribirSalud(avisar: () => void): () => void {
  oyentesSalud.add(avisar);
  return () => void oyentesSalud.delete(avisar);
}

/** La salud de la conexión del chat, viva. Re-renderiza al cambiar. */
export function useSaludDelChat(): SaludDelChat {
  return useSyncExternalStore(suscribirSalud, saludDelChatAhora, saludDelChatAhora);
}

function escuchar(canal: RealtimeChannel, def: Definicion, userId: string, alLlegar: (carga: CargaDelChat) => void): void {
  const cb = (payload: unknown) => alLlegar(payload as CargaDelChat);
  const conFiltro = def.filtro ? { filter: def.filtro(userId) } : {};
  const base = { schema: "public", table: def.tabla, ...conFiltro };
  // Un `on` por evento literal: los tipos de realtime-js no aceptan la unión.
  if (def.evento === "INSERT") canal.on("postgres_changes", { event: "INSERT", ...base }, cb);
  else if (def.evento === "UPDATE") canal.on("postgres_changes", { event: "UPDATE", ...base }, cb);
  else canal.on("postgres_changes", { event: "DELETE", ...base }, cb);
}

function avisar(c: Centro, que: (o: OyentesDelChat) => void): void {
  // Copia: un oyente puede irse (o sumarse) mientras se reparte.
  for (const ref of Array.from(c.oyentes)) {
    try {
      que(ref.current);
    } catch (err) {
      // Antes cada uno tenía su canal: que uno falle no puede dejar sin
      // evento a los otros.
      console.error("[canalDelChat] un oyente falló:", err);
    }
  }
}

function armar(c: Centro): void {
  c.armadoPendiente = false;
  if (centros.get(c.userId) !== c || c.oyentes.size === 0) return;
  if (c.timer) {
    clearTimeout(c.timer);
    c.timer = null;
  }
  const anterior = c.canal;
  if (anterior) {
    // Rearmar deja un hueco sin canal: quien lo necesite se pone al día al revivir.
    c.canal = null;
    c.suscrito = false;
    c.huboCaida = true;
    void supabase.removeChannel(anterior);
  }

  const canal = supabase.channel(topicDelCanalDelChat(c.userId, ++version));
  for (const [clave, def] of Object.entries(ESCUCHAS_DEL_CHAT) as [EscuchaDelChat, Definicion][]) {
    escuchar(canal, def, c.userId, (carga) => {
      if (c.canal !== canal) return;
      avisar(c, (o) => o[clave]?.(carga));
    });
  }
  c.canal = canal;

  canal.subscribe((estado) => {
    // Nuestro propio removeChannel (o un canal ya reemplazado) dispara CLOSED:
    // sin esta guarda programaría un rearmado zombi.
    if (c.canal !== canal) return;
    if (estado === "SUBSCRIBED") {
      c.intento = 0;
      c.suscrito = true;
      reportarSaludDelChat("lista", "en-vivo");
      // realtime-js reintenta solo tras un CHANNEL_ERROR: si el canal volvió por
      // su cuenta, el rearmado que quedó programado ya no hace falta (la lista
      // de useChat lo cancelaba igual con su canal propio).
      if (c.timer) {
        clearTimeout(c.timer);
        c.timer = null;
      }
      const revivio = c.huboCaida;
      c.huboCaida = false;
      avisar(c, (o) => {
        o.alSuscribir?.();
        if (revivio) o.alRevivir?.();
      });
      return;
    }
    if (ESTADOS_MUERTOS.has(estado)) {
      c.suscrito = false;
      reportarSaludDelChat("lista", "reconectando");
      if (c.timer) return;
      c.huboCaida = true;
      c.timer = setTimeout(() => {
        c.timer = null;
        armar(c);
      }, esperaDeReconexion(c.intento++));
    }
  });
}

/** Junta todo lo que pase en la misma vuelta (los efectos de un mismo render se
 *  registran uno tras otro): un solo canal para todos. */
function programarArmado(c: Centro): void {
  if (c.armadoPendiente) return;
  c.armadoPendiente = true;
  queueMicrotask(() => armar(c));
}

function cerrar(c: Centro): void {
  c.cierrePendiente = false;
  if (c.timer) {
    clearTimeout(c.timer);
    c.timer = null;
  }
  c.soltarVuelta();
  const canal = c.canal;
  c.canal = null;
  c.suscrito = false;
  if (canal) void supabase.removeChannel(canal);
  if (centros.get(c.userId) === c) centros.delete(c.userId);
  // Sin chat montado no hay nada que reconectar: que un "reconectando" viejo no
  // quede colgado para el próximo montaje (el primer SUBSCRIBED lo pondrá en vivo).
  if (centros.size === 0) reportarSaludDelChat("lista", "conectando");
}

/** Canal nuevo para `userId` (volver del segundo plano, recuperar la red). */
export function reanudarCanalDelChat(userId: string): void {
  const c = centros.get(userId);
  if (!c || c.oyentes.size === 0) return;
  c.huboCaida = true;
  programarArmado(c);
}

/**
 * Suma un oyente al canal del chat de `userId` y devuelve cómo sacarlo.
 * `oyentes` va por ref: se lee en cada evento, así que siempre corre la versión
 * del último render sin volver a suscribir.
 */
export function registrarEnElCanalDelChat(userId: string, oyentes: RefDeOyentes): () => void {
  let c = centros.get(userId);
  if (!c) {
    const nuevo: Centro = {
      userId,
      oyentes: new Set(),
      canal: null,
      suscrito: false,
      huboCaida: false,
      intento: 0,
      timer: null,
      armadoPendiente: false,
      cierrePendiente: false,
      soltarVuelta: () => {},
    };
    // UNA escucha de la vuelta por pestaña, no una por hook: antes cada hook
    // rearmaba su propio canal al volver.
    nuevo.soltarVuelta = escucharLaVuelta(() => reanudarCanalDelChat(userId));
    centros.set(userId, nuevo);
    programarArmado(nuevo);
    c = nuevo;
  }
  const centro = c;
  centro.cierrePendiente = false;
  centro.oyentes.add(oyentes);
  if (centro.suscrito) {
    queueMicrotask(() => {
      if (centro.suscrito && centro.oyentes.has(oyentes)) oyentes.current.alSuscribir?.();
    });
  }

  return () => {
    if (!centro.oyentes.delete(oyentes) || centro.oyentes.size > 0) return;
    // Diferido: al re-correr un efecto React limpia y vuelve a registrar en la
    // misma vuelta. Cerrar en el acto sería un canal nuevo por cada re-corrida.
    centro.cierrePendiente = true;
    queueMicrotask(() => {
      if (centro.cierrePendiente && centro.oyentes.size === 0) cerrar(centro);
    });
  };
}

/**
 * Escuchar el Messenger desde un componente. `userId` null = todavía no.
 * Los callbacks pueden cambiar en cada render: se leen por ref.
 */
export function useEscuchaDelChat(userId: string | null | undefined, oyentes: OyentesDelChat): void {
  const ref = useRef(oyentes);
  ref.current = oyentes;
  useEffect(() => {
    if (!userId) return;
    return registrarEnElCanalDelChat(userId, ref);
  }, [userId]);
}
