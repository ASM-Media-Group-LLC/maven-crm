// Ajustes → API keys, y la referencia del API que se abre desde ahí.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
//
// En los textos largos, lo que va entre `acentos graves` se dibuja como código
// y lo que va entre **dobles asteriscos**, en negrita (ver ConFormato en
// AdminApiKeys.tsx): así cada párrafo es UNA clave y se traduce entero, sin
// pedazos sueltos alrededor de los <code>.
export const PREFIJOS_API_KEYS = ["apiKeys."] as const;

export const apiKeys = {
  "apiKeys.subtitle": {
    es: "Acceso programático de solo-lectura a los datos de Maven (creadoras, empleados, ventas).",
    en: "Read-only programmatic access to Maven data (creators, employees, sales).",
  },
  "apiKeys.apiReference": { es: "Referencia del API", en: "API reference" },
  "apiKeys.createKey": { es: "Crear API key", en: "Create API key" },
  "apiKeys.maxActive": { es: "Máximo {max} keys activas", en: "Maximum {max} active keys" },
  "apiKeys.banner.internal": { es: "Uso interno.", en: "Internal use." },
  "apiKeys.banner.noShare": {
    es: "No compartas las API keys con proveedores externos ni las publiques.",
    en: "Don't share API keys with outside vendors or publish them.",
  },
  "apiKeys.banner.limit": {
    es: "Puedes tener hasta **{max} keys activas** a la vez ({active}/{max} en uso).",
    en: "You can have up to **{max} active keys** at a time ({active}/{max} in use).",
  },
  "apiKeys.loadError": { es: "Error al cargar las keys", en: "Couldn't load the keys" },
  "apiKeys.empty": {
    es: "Todavía no hay API keys. Creá la primera con “{button}”.",
    en: "There are no API keys yet. Create the first one with “{button}”.",
  },

  // Tabla
  "apiKeys.col.key": { es: "API key", en: "API key" },
  "apiKeys.col.created": { es: "Creada", en: "Created" },
  "apiKeys.col.createdBy": { es: "Creada por", en: "Created by" },
  "apiKeys.col.actsAs": { es: "Actúa como", en: "Acts as" },
  "apiKeys.col.actsAsHint": {
    es: "La key opera a nombre de esta persona (GET /me) y deja de funcionar si la dan de baja. No cambia nunca. Los datos se entregan según los permisos (scopes) de la key, no según los de esta persona.",
    en: "The key operates on behalf of this person (GET /me) and stops working if they're offboarded. It never changes. Data is returned according to the key's permissions (scopes), not this person's.",
  },
  "apiKeys.col.ipWhitelist": { es: "IP whitelist", en: "IP whitelist" },
  "apiKeys.col.expires": { es: "Expira", en: "Expires" },
  "apiKeys.noRestriction": { es: "Sin restricción", en: "No restriction" },
  "apiKeys.never": { es: "Nunca", en: "Never" },
  "apiKeys.status.personGone": { es: "Persona dada de baja", en: "Person offboarded" },
  "apiKeys.status.personGoneHint": {
    es: "La persona como la que actúa esta key fue dada de baja o ya no está en la agencia: el API la rechaza con 401. Revocala y creá otra.",
    en: "The person this key acts as was offboarded or is no longer in the agency: the API rejects it with 401. Revoke it and create a new one.",
  },
  "apiKeys.status.active": { es: "Activa", en: "Active" },
  "apiKeys.status.unverified": { es: "Activa · sin verificar", en: "Active · unverified" },
  "apiKeys.status.unverifiedHint": {
    es: "No se pudo verificar si la persona como la que actúa esta key sigue activa. Recargá la página.",
    en: "Couldn't verify whether the person this key acts as is still active. Reload the page.",
  },
  "apiKeys.status.revoked": { es: "Revocada", en: "Revoked" },
  "apiKeys.status.expired": { es: "Vencida", en: "Expired" },
  "apiKeys.revoke": { es: "Revocar", en: "Revoke" },

  // Key recién creada
  "apiKeys.fresh.title": { es: "Key creada", en: "Key created" },
  "apiKeys.fresh.copyNow": {
    es: "Copiala ahora. **No la vas a volver a ver** — Maven solo guarda un hash.",
    en: "Copy it now. **You won't see it again** — Maven only stores a hash.",
  },
  "apiKeys.fresh.copyKey": { es: "Copiar la key", en: "Copy the key" },
  "apiKeys.fresh.done": { es: "Listo, ya la copié", en: "Done, I've copied it" },
  "apiKeys.copied": { es: "Copiado", en: "Copied" },
  "apiKeys.copyFailed": { es: "No se pudo copiar — hazlo manualmente", en: "Couldn't copy — copy it manually" },

  // Crear / editar
  "apiKeys.form.editTitle": { es: "Editar API key", en: "Edit API key" },
  "apiKeys.form.description": { es: "Nombre, IPs permitidas, expiración y permisos.", en: "Name, allowed IPs, expiration and permissions." },
  "apiKeys.form.actsAsYou": {
    es: "La key va a actuar como vos, y eso no se puede cambiar después.",
    en: "The key will act as you, and that can't be changed later.",
  },
  "apiKeys.form.namePlaceholder": { es: "Ej: Integración Álvaro", en: "E.g.: CRM integration" },
  "apiKeys.form.noRestrictionHint": { es: "Acceso desde cualquier IP.", en: "Access from any IP." },
  "apiKeys.form.restrict": { es: "Restringir a IPs de confianza", en: "Restrict to trusted IPs" },
  "apiKeys.form.restrictHint": { es: "Solo estas IPs/CIDR pueden usar la key.", en: "Only these IPs/CIDRs can use the key." },
  "apiKeys.form.ipPlaceholder": { es: "Una por línea, ej:\n45.225.224.129\n190.0.0.0/24", en: "One per line, e.g.:\n45.225.224.129\n190.0.0.0/24" },
  "apiKeys.form.ipPlaceholderMessenger": { es: "Una por línea, IPs exactas, ej:\n45.225.224.129", en: "One per line, exact IPs, e.g.:\n45.225.224.129" },
  "apiKeys.form.messengerIpHint": {
    es: "Con Messenger van IPs exactas del servidor de la integración, sin rangos (/). Desde una laptop o una casa la IP cambia y la key deja de funcionar.",
    en: "With Messenger, use the exact IPs of the integration's server, no ranges (/). From a laptop or a home connection the IP changes and the key stops working.",
  },
  "apiKeys.form.expiration": { es: "Expiración", en: "Expiration" },
  "apiKeys.form.keepCurrent": { es: "Mantener actual", en: "Keep current" },
  "apiKeys.form.exp30": { es: "30 días (recomendado)", en: "30 days (recommended)" },
  "apiKeys.form.exp90": { es: "90 días", en: "90 days" },
  "apiKeys.form.exp365": { es: "1 año", en: "1 year" },
  "apiKeys.form.scopes": { es: "API scopes", en: "API scopes" },
  "apiKeys.form.readOnly": { es: "Solo lectura", en: "Read-only" },
  "apiKeys.form.messengerOnlyNew": {
    es: "El Messenger solo se puede poner al crear una key nueva",
    en: "Messenger can only be added when creating a new key",
  },
  "apiKeys.form.messengerTitle": {
    es: "Esta key va a leer TODAS las conversaciones del Messenger de {name}",
    en: "This key will read ALL of {name}'s Messenger conversations",
  },
  "apiKeys.form.messengerBody": {
    es: "Directas y grupos, también las futuras, con los mensajes que te mandan otras personas: exactamente lo que ves en /messenger. Quien tenga la key las lee desde las IPs que pongas, hasta que venza o la revoques. No marca nada como leído.",
    en: "Direct chats and groups, including future ones, with the messages other people send you: exactly what you see in /messenger. Whoever has the key can read them from the IPs you set, until it expires or you revoke it. It doesn't mark anything as read.",
  },
  "apiKeys.form.messengerTitleYou": {
    es: "Esta key va a leer TODAS tus conversaciones del Messenger",
    en: "This key will read ALL of your Messenger conversations",
  },
  "apiKeys.form.messengerConfirm": {
    es: "Entiendo que la key lee mis conversaciones y las de quienes me escriben.",
    en: "I understand the key reads my conversations and those of people who write to me.",
  },
  "apiKeys.form.create": { es: "Crear key", en: "Create key" },
  "apiKeys.toast.created": { es: "API key creada", en: "API key created" },
  "apiKeys.toast.createFailed": { es: "No pude crear la key", en: "Couldn't create the key" },
  "apiKeys.toast.updated": { es: "API key actualizada", en: "API key updated" },
  "apiKeys.toast.updateFailed": { es: "No pude actualizar la key", en: "Couldn't update the key" },
  "apiKeys.toast.revoked": { es: "API key revocada", en: "API key revoked" },
  "apiKeys.toast.revokeFailed": { es: "No pude revocar la key", en: "Couldn't revoke the key" },

  // Revocar
  "apiKeys.revokeDialog.title": { es: "¿Revocar “{name}”?", en: "Revoke “{name}”?" },
  "apiKeys.revokeDialog.body": {
    es: "La key deja de funcionar inmediatamente y cualquier integración que la use empezará a recibir 401. No se puede deshacer.",
    en: "The key stops working immediately and any integration using it will start getting 401. This can't be undone.",
  },

  // Grupos y scopes (en español se usa el texto que manda el servidor; esto es para inglés)
  "apiKeys.group.Creadoras": { es: "Creadoras", en: "Creators" },
  "apiKeys.group.Contactos": { es: "Contactos", en: "Contacts" },
  "apiKeys.group.Empleados": { es: "Empleados", en: "Employees" },
  "apiKeys.group.Ventas": { es: "Ventas", en: "Sales" },
  "apiKeys.group.Promolog": { es: "Promolog", en: "Promolog" },
  "apiKeys.group.Messenger": { es: "Messenger", en: "Messenger" },
  "apiKeys.scope.creators.label": { es: "Perfil + redes sociales", en: "Profile + social networks" },
  "apiKeys.scope.creators.desc": {
    es: "Roster de creadoras: nombre artístico, categoría, estado, ubicación, seguidores de Instagram y todas sus redes (IG, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans).",
    en: "Creator roster: stage name, category, status, location, Instagram followers and all their networks (IG, TikTok, Twitter/X, YouTube, Facebook, Reddit, Telegram, LinkedIn, OnlyFans).",
  },
  "apiKeys.scope.contacts.label": { es: "Contactos y agencias", en: "Contacts and agencies" },
  "apiKeys.scope.contacts.desc": {
    es: "Directorio comercial: modelos, AGENCIAS y ex-creadoras. Nombre, handle, plataforma, país, ciudad, empresa, estado y de qué base salió. Filtro `kind` = modelo | agencia | ex_creadora. El teléfono y el email van ENMASCARADOS salvo que la key tenga además contacts:phone.",
    en: "Business directory: models, AGENCIES and former creators. Name, handle, platform, country, city, company, status and source. Filter `kind` = modelo | agencia | ex_creadora. Phone and email are MASKED unless the key also has contacts:phone.",
  },
  "apiKeys.scope.phone.label": { es: "⚠️ Teléfono y email sin enmascarar", en: "⚠️ Unmasked phone and email" },
  "apiKeys.scope.phone.desc": {
    es: "Devuelve el teléfono y el email REALES de cada contacto, en vez de enmascarados. Es la base de datos comercial completa: una vez entregada no se puede deshacer. Dentro de Maven este dato está restringido a admins (columna solo-admin + permiso 'Ver Teléfonos'), y una API key SALTEA esas capas — este scope es lo único que la frena. Dalo solo a keys que de verdad lo necesiten, con vencimiento corto y whitelist de IP.",
    en: "Returns each contact's REAL phone and email instead of masked ones. It's the complete business database: once handed over it can't be undone. Inside Maven this data is admin-only (admin-only column + the `Ver Teléfonos` (view phones) permission), and an API key BYPASSES those layers — this scope is the only thing stopping it. Give it only to keys that truly need it, with a short expiration and an IP whitelist.",
  },
  "apiKeys.scope.employees.label": { es: "Roster del equipo", en: "Team roster" },
  "apiKeys.scope.employees.desc": {
    es: "Empleados de la agencia: nombre, rol (chatter, closer, manager, coordinador…) y fecha de alta.",
    en: "Agency employees: name, role (chatter, closer, manager, coordinator…) and start date.",
  },
  "apiKeys.scope.hubstaff.label": { es: "Horas de Hubstaff (diario)", en: "Hubstaff hours (daily)" },
  "apiKeys.scope.hubstaff.desc": {
    es: "Horas trabajadas por día según Hubstaff: tiempo trackeado (horas), actividad general y proyecto, por empleado. Filtros por fecha y empleado.",
    en: "Hours worked per day according to Hubstaff: tracked time (hours), overall activity and project, per employee. Filters by date and employee.",
  },
  "apiKeys.scope.cowork.label": { es: "Tiempo en Cowork (diario y al detalle)", en: "Cowork time (daily and detailed)" },
  "apiKeys.scope.cowork.desc": {
    es: "Tiempo trabajado en Cowork por empleado y día: segundos con el reloj corriendo (cámara + pantalla, presente), y detenido por pausa, sin cámara, sin pantalla o fuera de cámara. Con /cowork/time/segments, cada tramo con hora de inicio, fin y motivo. Es el dato que va a reemplazar a Hubstaff.",
    en: "Time worked in Cowork per employee and day: seconds with the clock running (camera + screen, present), and stopped for a break, no camera, no screen or off camera. With /cowork/time/segments, each segment with start time, end time and reason. It's the data that will replace Hubstaff.",
  },
  "apiKeys.scope.sales.label": { es: "Ganancias por creadora (diario)", en: "Earnings per creator (daily)" },
  "apiKeys.scope.sales.desc": {
    es: "Ganancias brutas diarias por creadora con desglose (suscripciones, tips, mensajes, posts, referidos, streams) y fans activos/nuevos.",
    en: "Daily gross earnings per creator with breakdown (subscriptions, tips, messages, posts, referrals, streams) and active/new fans.",
  },
  "apiKeys.scope.salesChatters.label": { es: "Ventas por chatter (diario)", en: "Sales per chatter (daily)" },
  "apiKeys.scope.salesChatters.desc": {
    es: "Ventas diarias por chatter: total vendido, mensajes vendidos y fans chateados.",
    en: "Daily sales per chatter: total sold, messages sold and fans chatted.",
  },
  "apiKeys.scope.promolog.label": { es: "Promoción diaria", en: "Daily promotion" },
  "apiKeys.scope.promolog.desc": {
    es: "Estado diario de promoción por creadora y red: si promocionó ese día, cuántas historias se escanearon y cuántas contaron como promo. Filtros por fecha, creadora y red.",
    en: "Daily promotion status per creator and network: whether they promoted that day, how many stories were scanned and how many counted as promotion. Filters by date, creator and network.",
  },
  "apiKeys.scope.messenger.label": { es: "⚠️ Leer el Messenger de quien crea la key", en: "⚠️ Read the Messenger of whoever creates the key" },
  "apiKeys.scope.messenger.desc": {
    es: "Lee TODAS las conversaciones del Messenger de la persona que crea la key — directas y grupos, también las futuras — exactamente como las ve ella en /messenger, con los mensajes que le mandan otras personas. No marca nada como leído. Exige IPs fijas y vencimiento de 90 días como máximo, y solo se puede poner al crear una key nueva.",
    en: "Reads ALL the Messenger conversations of the person who creates the key — direct chats and groups, including future ones — exactly as they see them in /messenger, including the messages other people send them. It doesn't mark anything as read. Requires fixed IPs and an expiration of 90 days at most, and can only be added when creating a new key.",
  },

  // Referencia del API
  "apiKeys.docs.description": { es: "Solo-lectura. Autenticación por API key.", en: "Read-only. API key authentication." },
  "apiKeys.docs.baseUrl": { es: "Base URL", en: "Base URL" },
  "apiKeys.docs.auth": { es: "Autenticación", en: "Authentication" },
  "apiKeys.docs.authSend": {
    es: "Envía la key en `Authorization: Bearer mvk_live_…` (o el header `X-API-Key`).",
    en: "Send the key in `Authorization: Bearer mvk_live_…` (or the `X-API-Key` header).",
  },
  "apiKeys.docs.authActsAs": {
    es: "Cada key opera a nombre de una persona de Maven (quien la creó) y eso no cambia nunca. Si esa persona deja Maven o la agencia, la key deja de funcionar (401). `GET /me` dice cuál es. Los datos se entregan según los scopes de la key.",
    en: "Each key operates on behalf of a Maven person (whoever created it), and that never changes. If that person leaves Maven or the agency, the key stops working (401). `GET /me` tells you who it is. Data is returned according to the key's scopes.",
  },
  "apiKeys.docs.limit": { es: "Límite", en: "Rate limit" },
  "apiKeys.docs.limitBody": {
    es: "1.000 pedidos por hora y 60 por minuto por key; la hora se reinicia en punto. Las respuestas a una key válida traen `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset` (epoch en segundos), que son los de la hora. Pasado cualquiera de los dos límites: `429` con `Retry-After` (segundos).",
    en: "1,000 requests per hour and 60 per minute per key; the hour resets on the hour. Responses to a valid key include `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (epoch seconds), which refer to the hour. Past either limit: `429` with `Retry-After` (seconds).",
  },
  "apiKeys.docs.language": { es: "Idioma", en: "Language" },
  "apiKeys.docs.languageBody": {
    es: "Los mensajes de error (`message`) vienen en español; con el header `Accept-Language: en`, en inglés. Los códigos (`error`) y los nombres de los campos no cambian.",
    en: "Error messages (`message`) come in Spanish by default; send the `Accept-Language: en` header to get them in English. Error codes (`error`) and field names never change.",
  },
  "apiKeys.docs.example": { es: "Ejemplo", en: "Example" },
  "apiKeys.docs.endpoints": { es: "Endpoints", en: "Endpoints" },
  "apiKeys.docs.pagination": {
    es: "Paginación: `limit` (máx 500) + `offset`. Cada respuesta trae `count` total. En el Messenger los mensajes van con cursor (`next_cursor`, máx 100 por página) y sin count. Las keys con Messenger exigen IPs fijas y vencimiento; los adjuntos son links públicos permanentes: cualquiera que tenga el link lo abre, aunque la key se revoque.",
    en: "Pagination: `limit` (max 500) + `offset`. Each response includes the total `count`. In Messenger, messages use a cursor (`next_cursor`, max 100 per page) and no count. Messenger keys require fixed IPs and an expiration; attachments are permanent public links: anyone with the link can open it, even after the key is revoked.",
  },
  "apiKeys.ep.me": {
    es: "Como quién actúa esta key (acts_as: id, name, avatar_url), su agencia (agency_id) y el cupo que le queda esta hora (rate_limit). No necesita scope.",
    en: "Who this key acts as (acts_as: id, name, avatar_url), its agency (agency_id) and how much of this hour's quota is left (rate_limit). No scope needed.",
  },
  "apiKeys.ep.conversations": {
    es: "La bandeja de la persona de la key, como en /messenger: cada conversación con type (direct | group), counterpart (en las directas), last_message (text_preview de 200 caracteres), unread_count (tope 100; null si no se pudo contar), me (role, last_read_at, is_muted), is_pinned, is_archived. Ordenada por última actividad. Filtros: limit (máx 100), offset. No es para sondear: para lo nuevo, /messenger/feed.",
    en: "The inbox of the key's person, as in /messenger: each conversation with type (direct | group), counterpart (in direct chats), last_message (200-character text_preview), unread_count (capped at 100; null if it couldn't be counted), me (role, last_read_at, is_muted), is_pinned, is_archived. Sorted by latest activity. Filters: limit (max 100), offset. Not meant for polling: for what's new, use /messenger/feed.",
  },
  "apiKeys.ep.conversation": {
    es: "Una conversación: datos, settings del grupo, me y participants (user, role, joined_at). Si el grupo esconde la lista de miembros y la persona no es admin del grupo, participants = null y participants_hidden = true. Si no la ve, 404.",
    en: "One conversation: details, group settings, me and participants (user, role, joined_at). If the group hides its member list and the person isn't a group admin, participants = null and participants_hidden = true. If they can't see it, 404.",
  },
  "apiKeys.ep.messages": {
    es: "La historia, de lo más nuevo a lo más viejo, con cursor: pasá next_cursor en el parámetro before para la página anterior, o usá el parámetro after para pedir lo nuevo en orden. Cada mensaje: sender, kind (text | image | gif | video | voice_note | audio | file | system), text, attachment (url, name, hosted_by, storage_path), reply_to_id, is_thread_reply, is_edited, is_deleted. Un borrado viene sin texto ni adjunto. Filtros: limit (máx 100), before | after, thread_root_id, include=rich (agrega el texto con formato).",
    en: "The history, newest to oldest, with a cursor: pass next_cursor in the before parameter for the previous page, or use the after parameter to get what's new in order. Each message: sender, kind (text | image | gif | video | voice_note | audio | file | system), text, attachment (url, name, hosted_by, storage_path), reply_to_id, is_thread_reply, is_edited, is_deleted. A deleted message comes without text or attachment. Filters: limit (max 100), before | after, thread_root_id, include=rich (adds the formatted text).",
  },
  "apiKeys.ep.feed": {
    es: "Lo nuevo en TODAS las conversaciones, en orden: así recibe mensajes una integración sin webhooks. Primer pedido con since (ISO, 72 h como máximo) o sin nada (últimos 15 min); después, siempre after=next_cursor. Si caught_up = true, esperá 30 s o más antes del próximo. Mira como mucho una hora por pedido. exclude_own=true saca lo que mandó la propia persona. Solo mensajes nuevos: ediciones y borrados se ven releyendo la conversación.",
    en: "What's new across ALL conversations, in order: this is how an integration receives messages without webhooks. First request with since (ISO, 72 h at most) or nothing (last 15 min); after that, always after=next_cursor. If caught_up = true, wait 30 s or more before the next one. It looks at one hour per request at most. exclude_own=true drops what the person sent themselves. New messages only: edits and deletions show up when you re-read the conversation.",
  },
  "apiKeys.ep.creators": {
    es: "Creadoras + redes (IG, TikTok, X, OnlyFans, Telegram…). Filtros: status, limit, offset.",
    en: "Creators + networks (IG, TikTok, X, OnlyFans, Telegram…). Filters: status, limit, offset.",
  },
  "apiKeys.ep.creator": { es: "Detalle de una creadora.", en: "A single creator's details." },
  "apiKeys.ep.contacts": {
    es: "Directorio comercial. Filtros: kind (modelo|agencia|ex_creadora), status, country, con_telefono, limit, offset. Teléfono y email enmascarados salvo que la key tenga contacts:phone.",
    en: "Business directory. Filters: kind (modelo|agencia|ex_creadora), status, country, con_telefono, limit, offset. Phone and email are masked unless the key has contacts:phone.",
  },
  "apiKeys.ep.contact": { es: "Detalle de un contacto.", en: "A single contact's details." },
  "apiKeys.ep.employees": { es: "Roster del equipo (nombre, rol). Filtro: role.", en: "Team roster (name, role). Filter: role." },
  "apiKeys.ep.hubstaff": {
    es: "Horas diarias de Hubstaff por empleado (horas, actividad, proyecto). Filtros: from, to, profile_id.",
    en: "Daily Hubstaff hours per employee (hours, activity, project). Filters: from, to, profile_id.",
  },
  "apiKeys.ep.coworkTime": {
    es: "Tiempo en Cowork por empleado y día: active_seconds (lo que exige la sesión, presente; incluye el meet grupal), group_meet_seconds, paused_seconds, bathroom_breaks / bathroom_seconds / bathroom_exceeded (presupuesto del día), breaks / break_seconds / breaks_exceeded / break_excess_seconds (tope por pausa), no_camera_seconds, no_screen_seconds, away_seconds, in_room_seconds, sessions, first_join, last_leave. Filtros: from, to, profile_id.",
    en: "Cowork time per employee and day: active_seconds (what the session requires, present; includes the group meet), group_meet_seconds, paused_seconds, bathroom_breaks / bathroom_seconds / bathroom_exceeded (daily budget), breaks / break_seconds / breaks_exceeded / break_excess_seconds (per-break cap), no_camera_seconds, no_screen_seconds, away_seconds, in_room_seconds, sessions, first_join, last_leave. Filters: from, to, profile_id.",
  },
  "apiKeys.ep.coworkSegments": {
    es: "Cada tramo del reloj al detalle: state (active | group_meet | paused | no_camera | no_screen | away), detail, started_at, ended_at, seconds, sesión y sala. Filtros: from, to, profile_id.",
    en: "Each clock segment in detail: state (active | group_meet | paused | no_camera | no_screen | away), detail, started_at, ended_at, seconds, session and room. Filters: from, to, profile_id.",
  },
  "apiKeys.ep.coworkBreaks": {
    es: "Cada pausa al detalle: kind (bathroom | break), started_at, ended_at, seconds, limit_seconds (tope vigente de la sesión), exceeded, auto_closed (la cerró el sistema: cerró la pestaña), sesión y sala. Filtros: from, to, profile_id.",
    en: "Each break in detail: kind (bathroom | break), started_at, ended_at, seconds, limit_seconds (the session's current cap), exceeded, auto_closed (closed by the system: the tab was closed), session and room. Filters: from, to, profile_id.",
  },
  "apiKeys.ep.coworkMeets": {
    es: "Cada meet grupal: una fila por persona y meet (meet_id, invoked_by / invoked_by_name, meet_started_at, meet_ended_at, meet_end_reason, room_name de donde vino, joined_at, left_at, seconds, left_reason). Ese tiempo cuenta como trabajado y ya está dentro de active_seconds en /cowork/time. Filtros: from, to, profile_id.",
    en: "Each group meet: one row per person and meet (meet_id, invoked_by / invoked_by_name, meet_started_at, meet_ended_at, meet_end_reason, room_name they came from, joined_at, left_at, seconds, left_reason). That time counts as worked and is already included in active_seconds in /cowork/time. Filters: from, to, profile_id.",
  },
  "apiKeys.ep.sales": {
    es: "Ganancias diarias por creadora + desglose. Filtros: from, to, creator_id.",
    en: "Daily earnings per creator + breakdown. Filters: from, to, creator_id.",
  },
  "apiKeys.ep.salesChatters": { es: "Ventas diarias por chatter. Filtros: from, to.", en: "Daily sales per chatter. Filters: from, to." },
  "apiKeys.ep.promolog": {
    es: "Promoción diaria por creadora y red (promovió sí/no, historias). Filtros: from, to, creator_id, network.",
    en: "Daily promotion per creator and network (promoted yes/no, stories). Filters: from, to, creator_id, network.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
