// Catálogo de scopes de la API pública de Maven. Agrupado por entidad para el
// modal estilo Infloww. Extensible: agregar una entrada aquí habilita el scope
// tanto en el gestor (manage-api-keys) como en la validación (public-api).
//
// Dos catálogos: el COMPLETO (con el que se valida, aquí y en public-api) y el que se
// manda a la pantalla de Ajustes → API keys, que todavía no ofrece lo que está en
// SCOPES_OCULTOS_EN_PANTALLA.
//
// Vive en manage-api-keys/ y no en _shared/ (desde el 25/09): es su único
// importador, y un cambio en _shared/ redespliega TODAS las edge functions.
//
// OJO: Maven es el CRM de la AGENCIA, no la fuente de datos de OnlyFans. Los
// scopes exponen datos de Maven (creadoras, empleados, ventas), no data de fans.
export type ScopeDef = { key: string; group: string; label: string; description: string };

export const SCOPE_GROUPS = ["Creadoras", "Contactos", "Empleados", "Ventas", "Promolog", "Messenger"] as const;

/** Scopes del Messenger (leen conversaciones privadas, y messenger:write además
 *  escribe en ellas): exigen IPs fijas y vencimiento de 90 días como máximo, y solo
 *  van en llaves NUEVAS (decisión de Jhon, 25/09). La base lo vuelve a exigir
 *  (api_keys_reglas_messenger detecta `messenger:%`). */
export const SCOPES_MESSENGER = ["messenger:read", "messenger:write"] as const;
export const SCOPE_MESSENGER_LECTURA = "messenger:read";
export const SCOPE_MESSENGER_ESCRITURA = "messenger:write";

/** Lo que la pantalla de Ajustes todavía no ofrece. messenger:write se esconde hasta
 *  el PR 5 (la pantalla con el nombre visible, la rotación y la retirada): sin eso, una
 *  key que escribe no se puede crear bien desde Maven. La validación usa el catálogo
 *  COMPLETO. El PR 5 vacía esta lista. */
export const SCOPES_OCULTOS_EN_PANTALLA: readonly string[] = ["messenger:write"];
export const MESSENGER_MAX_DIAS = 90;

export function esScopeMessenger(s: string): boolean {
  return (SCOPES_MESSENGER as readonly string[]).includes(s);
}

export const SCOPE_CATALOG_COMPLETO: ScopeDef[] = [
  {
    key: "creators:read",
    group: "Creadoras",
    label: "Perfil + redes sociales",
    description:
      "Roster de creadoras: nombre artístico, categoría, estado, ubicación, seguidores de Instagram y todas sus redes (IG, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans).",
  },
  {
    key: "contacts:read",
    group: "Contactos",
    label: "Contactos y agencias",
    description:
      "Directorio comercial: modelos, AGENCIAS y ex-creadoras. Nombre, handle, plataforma, país, ciudad, empresa, estado y de qué base salió. Filtro `kind` = modelo | agencia | ex_creadora. El teléfono y el email van ENMASCARADOS salvo que la key tenga además contacts:phone.",
  },
  {
    key: "contacts:phone",
    group: "Contactos",
    label: "⚠️ Teléfono y email sin enmascarar",
    description:
      "Devuelve el teléfono y el email REALES de cada contacto, en vez de enmascarados. Es la base de datos comercial completa: una vez entregada no se puede deshacer. Dentro de Maven este dato está restringido a admins (columna solo-admin + permiso 'Ver Teléfonos'), y una API key SALTEA esas capas — este scope es lo único que la frena. Dalo solo a keys que de verdad lo necesiten, con vencimiento corto y whitelist de IP.",
  },
  {
    key: "employees:read",
    group: "Empleados",
    label: "Roster del equipo",
    description:
      "Empleados de la agencia: nombre, rol (chatter, closer, manager, coordinador…) y fecha de alta.",
  },
  {
    key: "hubstaff:read",
    group: "Empleados",
    label: "Horas de Hubstaff (diario)",
    description:
      "Horas trabajadas por día según Hubstaff: tiempo trackeado (horas), actividad general y proyecto, por empleado. Filtros por fecha y empleado.",
  },
  {
    key: "cowork:read",
    group: "Empleados",
    label: "Tiempo en Cowork (diario y al detalle)",
    description:
      "Tiempo trabajado en Cowork por empleado y día: segundos con el reloj corriendo (cámara + pantalla, presente), y detenido por pausa, sin cámara, sin pantalla, fuera de cámara o sin conexión a la sala. Con /cowork/time/segments, cada tramo con hora de inicio, fin y motivo. Es el dato que va a reemplazar a Hubstaff.",
  },
  {
    key: "sales:read",
    group: "Ventas",
    label: "Ganancias por creadora (diario)",
    description:
      "Ganancias brutas diarias por creadora con desglose (suscripciones, tips, mensajes, posts, referidos, streams) y fans activos/nuevos.",
  },
  {
    key: "sales:chatters",
    group: "Ventas",
    label: "Ventas por chatter (diario)",
    description:
      "Ventas diarias por chatter: total vendido, mensajes vendidos y fans chateados.",
  },
  {
    key: "messenger:read",
    group: "Messenger",
    label: "⚠️ Leer el Messenger de quien crea la key",
    description:
      "Lee TODAS las conversaciones del Messenger de la persona que crea la key — directas y grupos, también las futuras — exactamente como las ve ella en /messenger, con los mensajes que le mandan otras personas. No marca nada como leído. Exige IPs fijas y vencimiento de 90 días como máximo, y solo se puede poner al crear una key nueva.",
  },
  {
    key: "messenger:write",
    group: "Messenger",
    label: "⚠️ Mandar mensajes en el Messenger a nombre de quien crea la key",
    description:
      "Manda mensajes de texto en las conversaciones de la persona que crea la key, abre chats directos con gente de su agencia y edita o borra lo que mandó la misma integración. Cada mensaje sale con el nombre visible de la key y la etiqueta API, y lo frenan los topes por minuto, hora y día. Va siempre con messenger:read, pide un nombre visible y que quien la crea confirme que escribirá a su nombre, y solo se puede poner al crear una key nueva.",
  },
  {
    key: "promolog:read",
    group: "Promolog",
    label: "Promoción diaria",
    description:
      "Estado diario de promoción por creadora y red: si promocionó ese día, cuántas historias se escanearon y cuántas contaron como promo. Filtros por fecha, creadora y red.",
  },
];

/** El catálogo que ve la pantalla (sin los ocultos). */
export const SCOPE_CATALOG: ScopeDef[] = SCOPE_CATALOG_COMPLETO.filter((s) => !SCOPES_OCULTOS_EN_PANTALLA.includes(s.key));

const SCOPE_SET: Set<string> = new Set(SCOPE_CATALOG_COMPLETO.map((s) => s.key));

/** ¿Existe el scope? Contra el catálogo COMPLETO (también lo oculto en pantalla). */
export function isValidScope(s: string): boolean {
  return SCOPE_SET.has(s);
}
