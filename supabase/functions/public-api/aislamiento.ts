// Cómo aísla el API pública los datos de cada agencia.
//
// POR QUÉ EXISTE. El API pública corre con service_role: salta la RLS, así que la
// única pared entre agencias es lo que el código filtre. Hasta el 24/09/2026 no
// filtraba nada —la palabra "tenant" no aparecía en el archivo— y no se notaba
// porque en Maven había UNA sola agencia: una consulta que se olvida de filtrar
// devuelve el resultado correcto por casualidad. El día que entrara la segunda,
// cualquier llave le habría devuelto a una los ingresos, el pipeline comercial y
// los empleados de la otra.
//
// LA REGLA. Cada recurso declara acá cómo se aísla. El router de public-api no
// sirve un recurso que no esté en este mapa, y el test lee public-api/index.ts y
// falla si aparece una tabla o función que nadie declaró.
//
// LOS CUATRO MODOS.
//  * `columna`     — la tabla tiene un tenant_id CONFIABLE y se filtra por él.
//  * `miembros`    — son personas: se aíslan por `tenant_members`, y tenant_members
//                    dice la verdad sobre quién es de qué agencia.
//  * `como_usuario` — NO corre con service_role: consulta con la sesión de la persona
//                    como la que actúa la llave (./como-usuario.ts), así que la pared
//                    es la RLS de la base, la misma que la app. Que esa persona sea
//                    de la agencia de la llave se verifica TRES veces: al crearla
//                    (trigger), en cada pedido (api_key_consumir → 401) y, antes de
//                    cualquier handler, que la base vea la sesión en esa agencia
//                    (servirComoUsuario → 503). Su código vive en
//                    ./recursos-como-usuario.ts, que el test obliga a no tocar `admin`.
//  * `sin_agencia` — no hay forma confiable de saber de qué agencia es cada fila.
//                    Con UNA agencia todas son de ella y se sirven igual que siempre.
//                    Con dos o más, el recurso se APAGA en vez de entregar datos ajenos.
//
// ⚠️ HOY TODOS LOS RECURSOS DE DATOS SON `sin_agencia`, Y ES A PROPÓSITO (el único
// que no, /me, devuelve a la persona misma y corre `como_usuario`). Tener una columna
// no alcanza: tiene que decir la verdad. La revisión del 24/09 lo mostró con /sales:
// creator_daily_earnings SÍ tiene tenant_id, pero con un DEFAULT fijo (el id de la
// primera agencia) que ningún importador sobrescribe, y sus índices únicos son para
// toda la plataforma. Con dos agencias, las ventas de la segunda habrían quedado
// etiquetadas como de la primera, y un import de la segunda podría PISAR filas de la
// primera. /employees igual: handle_new_user mete a todo usuario nuevo en la agencia
// original, así que tenant_members tampoco dice la verdad todavía.
//
// Promover un recurso a `columna` o `miembros` es una decisión de seguridad: exige
// arreglar primero lo que dice su `pendiente`, y el test obliga a declararlo.
//
// FALLAR CERRADO ES EL PUNTO: un 403 el primer día de la agencia nueva se ve y se
// arregla; una fuga no se ve hasta que ya pasó.

import { type Idioma, msg } from "./mensajes.ts";

export type ModoDeAislamiento =
  | { tipo: "columna"; columna: "tenant_id" }
  | { tipo: "miembros" }
  | {
    tipo: "como_usuario";
    /** Si está, el recurso se APAGA (403) con dos o más agencias hasta arreglar
     *  esto. Para lo que la base todavía no separa por agencia aunque la sesión sea
     *  la de la persona: p. ej. el Messenger, donde nada impide una conversación
     *  con gente de otra agencia. */
    pendienteConVariasAgencias?: string;
  }
  | {
    tipo: "sin_agencia";
    /** Qué hace falta arreglar para poder aislarlo de verdad. */
    pendiente: string;
  };

/** El mapa recurso → modo, de solo lectura. */
export type MapaDeAislamiento = Readonly<Record<string, Readonly<ModoDeAislamiento>>>;

/** Congela el mapa y cada entrada: la puerta decide con ESTE mapa, y nadie (ni un
 *  import que lo modifique, ni `mapa.x = …` desde otro archivo) puede cambiarle el
 *  modo a un recurso en tiempo de ejecución. En un módulo (modo estricto) escribirle
 *  tira TypeError en vez de abrir el recurso en silencio. */
function congelar(mapa: Record<string, ModoDeAislamiento>): MapaDeAislamiento {
  for (const modo of Object.values(mapa)) Object.freeze(modo);
  return Object.freeze(mapa);
}

export const AISLAMIENTO_POR_RECURSO: MapaDeAislamiento = congelar({
  // Quién es la llave: la persona como la que actúa y su agencia. Sirve para probar
  // en vivo que la sesión fabricada funciona antes de abrir nada más sobre ella.
  me: { tipo: "como_usuario" },
  // Las conversaciones de la persona de la llave, leídas con SU sesión: la RLS del
  // Messenger es por participación, como en la app. Pero nada en la base impide
  // todavía una conversación con gente de OTRA agencia, así que con dos o más se
  // apaga.
  messenger: {
    tipo: "como_usuario",
    pendienteConVariasAgencias: "la base todavía no impide sumar a una conversación a alguien de otra " +
      "agencia (la política INSERT de chat_participants no mira la agencia del agregado)",
  },
  sales: {
    tipo: "sin_agencia",
    pendiente: "creator_daily_earnings.tenant_id tiene DEFAULT fijo y los importadores BLU " +
      "no lo escriben; además sus índices únicos no incluyen la agencia",
  },
  employees: {
    tipo: "sin_agencia",
    pendiente: "handle_new_user asigna a todo usuario nuevo la agencia original, así que " +
      "tenant_members todavía no dice la verdad",
  },
  creators: {
    tipo: "sin_agencia",
    pendiente: "creators no tiene tenant_id",
  },
  contacts: {
    tipo: "sin_agencia",
    pendiente: "closers_contacts no tiene tenant_id ni enlace a nada que lo tenga",
  },
  "sales/chatters": {
    tipo: "sin_agencia",
    pendiente: "chatter_daily_sales no tiene tenant_id ni enlace a nada que lo tenga",
  },
  promolog: {
    tipo: "sin_agencia",
    pendiente: "api_promolog_daily cuelga de creators, que no tiene tenant_id",
  },
  hubstaff: {
    tipo: "sin_agencia",
    pendiente: "el dato es por persona: api_hubstaff_daily puede filtrar por tenant_members " +
      "cuando tenant_members sea confiable",
  },
  cowork: {
    tipo: "sin_agencia",
    pendiente: "el dato es por persona: las RPC de cowork pueden filtrar por tenant_members " +
      "cuando tenant_members sea confiable",
  },
});

/** Tablas y funciones que public-api usa para AUTENTICAR, no para servir datos. */
export const INFRAESTRUCTURA: ReadonlySet<string> = new Set([
  "api_keys",
  "tenants",
  "tenant_members",
  "increment_api_key_usage",
  "api_key_consumir",
  "api_key_vigente",
]);

/** Recursos que se sirven con la sesión del usuario y nunca con service_role. */
export function esComoUsuario(
  recurso: string,
  mapa: MapaDeAislamiento = AISLAMIENTO_POR_RECURSO,
): boolean {
  return Object.hasOwn(mapa, recurso) && mapa[recurso].tipo === "como_usuario";
}

/** Cada tabla/función de datos que toca public-api, y a qué recurso pertenece. */
export const FUENTES_POR_RECURSO: Record<string, string[]> = {
  me: ["profiles", "current_tenant_id"],
  messenger: [
    "chat_participants",
    "chat_conversations",
    "chat_messages",
    "chat_pinned",
    "chat_archived",
    "profiles",
    "get_last_messages",
    "messenger_unread_counts",
  ],
  sales: ["creator_daily_earnings"],
  employees: ["profiles", "user_roles"],
  creators: ["creators", "creator_of_accounts"],
  contacts: ["closers_contacts"],
  "sales/chatters": ["chatter_daily_sales"],
  promolog: ["api_promolog_daily"],
  hubstaff: ["api_hubstaff_daily"],
  cowork: [
    "cowork_tiempo_diario",
    "cowork_pausas_resumen",
    "api_cowork_time_segments",
    "api_cowork_breaks",
    "api_cowork_meets",
  ],
};

export type Veredicto =
  | { ok: true }
  | { ok: false; estado: 403 | 404 | 503; error: string; motivo: string };

/** ¿Se puede servir este recurso sin arriesgar datos de otra agencia?
 *
 *  @param agencias  filas en `tenants`, o `null` si no se pudo contar.
 *  @param mapa      inyectable para testear los modos que hoy nadie usa.
 *  @param idioma    el de `motivo` (ver ./mensajes.ts). Español si no se dice.
 *
 *  Tres salidas distintas, porque le dicen cosas distintas al cliente:
 *   - 404: el recurso no existe (o no declaró cómo aísla, que para el caso es igual).
 *   - 403: hay más de una agencia y este recurso no puede separarlas. No reintentes.
 *   - 503: no pudimos verificarlo. Es un problema NUESTRO; reintentá.
 *  Cerrado siempre, pero sin mentir sobre por qué. */
export function decidir(
  recurso: string,
  agencias: number | null,
  mapa: MapaDeAislamiento = AISLAMIENTO_POR_RECURSO,
  idioma: Idioma = "es",
): Veredicto {
  // Object.hasOwn y no `mapa[recurso]`: con un objeto literal, "constructor" o
  // "toString" existen por herencia y la puerta los dejaba pasar.
  if (!Object.hasOwn(mapa, recurso)) {
    return { ok: false, estado: 404, error: "not_found", motivo: msg(idioma, "recurso_desconocido", { recurso }) };
  }
  const modo = mapa[recurso];
  if (modo.tipo === "columna" || modo.tipo === "miembros") return { ok: true };
  // `=== undefined` y no por verdad: un pendiente vacío ("") igual cuenta como pendiente.
  if (modo.tipo === "como_usuario" && modo.pendienteConVariasAgencias === undefined) return { ok: true };
  const pendiente = modo.tipo === "sin_agencia" ? modo.pendiente : modo.pendienteConVariasAgencias;
  if (agencias === 1) return { ok: true };
  if (agencias !== null && agencias >= 2) {
    return {
      ok: false,
      estado: 403,
      error: "resource_unavailable",
      // String(): acá `pendiente` nunca es undefined (se retornó arriba), pero el tipo
      // no lo sabe; así sale igual que el template de antes.
      motivo: msg(idioma, "recurso_sin_aislamiento", { pendiente: String(pendiente) }),
    };
  }
  // null (no se pudo contar), 0 o negativo: no lo sabemos, así que no se sirve.
  return {
    ok: false,
    estado: 503,
    error: "temporarily_unavailable",
    motivo: msg(idioma, "aislamiento_no_verificado"),
  };
}
