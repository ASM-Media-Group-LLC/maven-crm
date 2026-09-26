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
    es: "La key deja de funcionar inmediatamente y cualquier integración que la use empezará a recibir 401. Si tiene un webhook, también se detiene. No se puede deshacer.",
    en: "The key stops working immediately and any integration using it will start getting 401. If it has a webhook, that stops too. This can't be undone.",
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
    es: "Lo nuevo en TODAS las conversaciones, en orden: así recibe mensajes una integración (con webhook, el aviso le dice cuándo leer; sin webhook, lee cada tanto). Primer pedido con since (ISO, 72 h como máximo) o sin nada (últimos 15 min); después, siempre after=next_cursor. Si caught_up = true, esperá 30 s o más antes del próximo. Mira como mucho una hora por pedido. exclude_own=true saca lo que mandó la propia persona. Solo mensajes nuevos: ediciones y borrados se ven releyendo la conversación.",
    en: "What's new across ALL conversations, in order: this is how an integration receives messages (with a webhook, the notification tells it when to read; without one, it reads every so often). First request with since (ISO, 72 h at most) or nothing (last 15 min); after that, always after=next_cursor. If caught_up = true, wait 30 s or more before the next one. It looks at one hour per request at most. exclude_own=true drops what the person sent themselves. New messages only: edits and deletions show up when you re-read the conversation.",
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

  // ── Webhooks del Messenger (columna, diálogo y referencia) ──
  "apiKeys.col.webhook": { es: "Webhook", en: "Webhook" },
  "apiKeys.webhook.none": { es: "Sin webhook", en: "No webhook" },
  "apiKeys.webhook.register": { es: "Registrar", en: "Register" },
  "apiKeys.webhook.unknown": { es: "No se pudo consultar", en: "Couldn't check" },
  "apiKeys.webhook.unknownHint": {
    es: "No se pudo saber si esta key tiene webhook. Recargá la página.",
    en: "Couldn't tell whether this key has a webhook. Reload the page.",
  },
  "apiKeys.webhook.state.pending": { es: "Esperando la prueba", en: "Waiting for the test" },
  "apiKeys.webhook.state.active": { es: "Activo", en: "Active" },
  "apiKeys.webhook.state.failing": { es: "Activo · fallando", en: "Active · failing" },
  "apiKeys.webhook.state.paused": { es: "Pausado", en: "Paused" },
  "apiKeys.webhook.state.disabled": { es: "Detenido", en: "Stopped" },

  "apiKeys.webhook.title": { es: "Webhook de “{name}”", en: "Webhook for “{name}”" },
  "apiKeys.webhook.registerTitle": { es: "Registrar un webhook en “{name}”", en: "Register a webhook on “{name}”" },
  "apiKeys.webhook.registerIntro": {
    es: "Maven le avisa a tu servidor cada vez que hay mensajes nuevos que esta key puede leer. El aviso **no lleva contenido**: solo cuántos mensajes hay, en qué conversaciones y desde dónde leer. Tu servidor los lee con `GET /messenger/feed`, desde sus IPs fijas y con la key.",
    en: "Maven notifies your server whenever there are new messages this key can read. The notification **carries no content**: only how many messages there are, in which conversations and where to read from. Your server reads them with `GET /messenger/feed`, from its fixed IPs and with the key.",
  },
  "apiKeys.webhook.url": { es: "URL de tu servidor", en: "Your server's URL" },
  "apiKeys.webhook.urlPlaceholder": { es: "https://tu-servidor.com/maven/webhook", en: "https://your-server.com/maven/webhook" },
  "apiKeys.webhook.urlHint": {
    es: "Solo `https`, puerto 443, sin usuario ni `#`. No se puede editar: para cambiarla, borrá el webhook y registrá otro. Se trata como un secreto: después solo se muestra el dominio.",
    en: "Only `https`, port 443, no username or `#`. It can't be edited: to change it, delete the webhook and register another one. It's treated as a secret: afterwards only the domain is shown.",
  },
  "apiKeys.webhook.excludeOwn": { es: "No avisar los mensajes que yo mando", en: "Don't notify the messages I send" },
  "apiKeys.webhook.excludeOwnHint": {
    es: "Marcado, solo avisa lo que te escriben otras personas. Desmarcado, también lo que mandás vos.",
    en: "Checked, it only notifies what other people write to you. Unchecked, it also notifies what you send.",
  },
  "apiKeys.webhook.registerButton": { es: "Registrar webhook", en: "Register webhook" },
  "apiKeys.webhook.person.you": {
    es: "Sos vos, la persona de la key: el webhook avisa lo nuevo de tus conversaciones. Solo vos podés registrarlo, probarlo o reanudarlo.",
    en: "That's you, the key's person: the webhook notifies what's new in your conversations. Only you can register, test or resume it.",
  },
  "apiKeys.webhook.person.other": {
    es: "La persona de la key: el webhook avisa lo nuevo de sus conversaciones. Solo esta persona puede registrarlo, probarlo o reanudarlo; cualquier admin puede pausarlo, borrarlo y ver las entregas.",
    en: "The key's person: the webhook notifies what's new in their conversations. Only this person can register, test or resume it; any admin can pause it, delete it and see the deliveries.",
  },

  "apiKeys.webhook.secretTitle": { es: "Webhook registrado", en: "Webhook registered" },
  "apiKeys.webhook.secretCopyNow": {
    es: "Copiá el **secreto de firma** ahora y pasáselo al integrador: **no se vuelve a mostrar**. Con él verifica que cada aviso viene de Maven.",
    en: "Copy the **signing secret** now and give it to the integrator: **it won't be shown again**. They use it to verify that each notification comes from Maven.",
  },
  "apiKeys.webhook.secretCopy": { es: "Copiar secreto", en: "Copy secret" },
  "apiKeys.webhook.nextTest": {
    es: "Para activarlo, mandá una prueba: Maven le manda a tu servidor un aviso firmado de tipo `webhook.test`, y tiene que contestar 2xx.",
    en: "To activate it, send a test: Maven sends your server a signed `webhook.test` notification, and it has to answer 2xx.",
  },
  "apiKeys.webhook.sendTest": { es: "Enviar prueba", en: "Send test" },
  "apiKeys.webhook.later": { es: "Después", en: "Later" },

  "apiKeys.webhook.tab.status": { es: "Estado", en: "Status" },
  "apiKeys.webhook.tab.deliveries": { es: "Entregas", en: "Deliveries" },
  "apiKeys.webhook.detail.host": { es: "Dominio", en: "Domain" },
  "apiKeys.webhook.detail.secret": { es: "Secreto", en: "Secret" },
  "apiKeys.webhook.detail.own": { es: "Mensajes propios", en: "Own messages" },
  "apiKeys.webhook.detail.ownExcluded": { es: "No se avisan", en: "Not notified" },
  "apiKeys.webhook.detail.ownIncluded": { es: "Se avisan", en: "Notified" },
  "apiKeys.webhook.detail.created": { es: "Registrado", en: "Registered" },
  "apiKeys.webhook.detail.lastTest": { es: "Última prueba", en: "Last test" },
  "apiKeys.webhook.detail.lastSuccess": { es: "Última entrega que llegó", en: "Last successful delivery" },
  "apiKeys.webhook.detail.lastAttempt": { es: "Último intento", en: "Last attempt" },
  "apiKeys.webhook.detail.failures": { es: "Fallos seguidos", en: "Failures in a row" },
  "apiKeys.webhook.detail.failuresSince": { es: "{n}, desde el {when}", en: "{n}, since {when}" },
  "apiKeys.webhook.detail.nextAttempt": { es: "Próximo intento", en: "Next attempt" },
  "apiKeys.webhook.detail.pausedOn": { es: "lo pausó el {when}", en: "paused it on {when}" },
  "apiKeys.webhook.detail.pausedWhen": { es: "Pausado el {when}", en: "Paused on {when}" },
  "apiKeys.webhook.detail.disabledOn": { es: "Detenido el {when}", en: "Stopped on {when}" },

  "apiKeys.webhook.help.pending": {
    es: "Todavía no está activo: mandá una prueba y que tu servidor la conteste con 2xx.",
    en: "It isn't active yet: send a test and have your server answer it with 2xx.",
  },
  "apiKeys.webhook.help.active": {
    es: "Maven revisa cada 15 segundos si hay mensajes nuevos y le avisa a tu servidor.",
    en: "Maven checks every 15 seconds for new messages and notifies your server.",
  },
  "apiKeys.webhook.help.failing": {
    es: "El servidor del integrador está fallando: Maven reintenta el mismo aviso con esperas cada vez más largas. Si falla 3 días seguidos, el webhook se detiene.",
    en: "The integrator's server is failing: Maven retries the same notification with longer and longer waits. If it fails for 3 days in a row, the webhook stops.",
  },
  "apiKeys.webhook.help.paused": {
    es: "Pausado: no sale ningún aviso. Al reanudar, Maven manda una prueba y arranca desde ese momento; lo de la pausa no se avisa, y el integrador lo lee del feed con su cursor.",
    en: "Paused: no notification goes out. On resume, Maven sends a test and starts from that moment; what happened during the pause isn't notified, and the integrator reads it from the feed with its cursor.",
  },
  "apiKeys.webhook.reason.receiver_gone": {
    es: "Tu servidor contestó 410: dice que esa URL ya no existe. Si la volviste a habilitar, reanudá.",
    en: "Your server answered 410: it says that URL no longer exists. If you enabled it again, resume.",
  },
  "apiKeys.webhook.reason.receiver_failing": {
    es: "Falló 3 días seguidos sin contestar 2xx. Cuando el servidor vuelva, reanudá.",
    en: "It failed for 3 days in a row without answering 2xx. When the server is back, resume.",
  },
  "apiKeys.webhook.reason.key_revoked": {
    es: "La key fue revocada. Este webhook no vuelve: creá una key nueva y registrá el webhook ahí.",
    en: "The key was revoked. This webhook won't come back: create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.key_expired": {
    es: "La key venció. Creá una key nueva y registrá el webhook ahí.",
    en: "The key expired. Create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.scope_removed": {
    es: "La key ya no tiene el permiso de Messenger. Creá una key nueva y registrá el webhook ahí.",
    en: "The key no longer has the Messenger permission. Create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.person_inactive": {
    es: "La persona de la key fue dada de baja o ya no está en la agencia.",
    en: "The key's person was offboarded or is no longer in the agency.",
  },
  "apiKeys.webhook.reason.multi_agency": {
    es: "Hay más de una agencia en Maven: los webhooks quedan apagados hasta resolverlo.",
    en: "There's more than one agency in Maven: webhooks stay off until that's resolved.",
  },
  "apiKeys.webhook.reason.config_error": {
    es: "La URL ya no se acepta o hay un problema de configuración en Maven. Si reanudar no lo arregla, borralo y registralo de nuevo.",
    en: "The URL is no longer allowed or there's a configuration problem in Maven. If resuming doesn't fix it, delete it and register it again.",
  },
  "apiKeys.webhook.reason.admin": { es: "Lo detuvo un administrador.", en: "An administrator stopped it." },
  "apiKeys.webhook.reason.other": { es: "Está detenido.", en: "It's stopped." },

  "apiKeys.webhook.err.http": { es: "El servidor contestó {code}", en: "The server answered {code}" },
  "apiKeys.webhook.err.dns": { es: "No se encontró el servidor (DNS)", en: "Couldn't find the server (DNS)" },
  "apiKeys.webhook.err.direccion_bloqueada": { es: "El nombre apunta a una dirección privada", en: "The name points to a private address" },
  "apiKeys.webhook.err.conexion": { es: "No se pudo conectar", en: "Couldn't connect" },
  "apiKeys.webhook.err.tls": { es: "Certificado HTTPS inválido", en: "Invalid HTTPS certificate" },
  "apiKeys.webhook.err.plazo": { es: "No contestó a tiempo", en: "Didn't answer in time" },
  "apiKeys.webhook.err.cortado": { es: "Se cortó después de mandar (puede haber llegado)", en: "Cut off after sending (it may have arrived)" },
  "apiKeys.webhook.err.respuesta_invalida": { es: "La respuesta no se pudo leer", en: "The response couldn't be read" },
  "apiKeys.webhook.err.host_prohibido": { es: "La URL ya no se acepta", en: "The URL is no longer allowed" },
  "apiKeys.webhook.err.maven_secreto": {
    es: "El secreto no abre con la clave del servidor: avisale a quien administra Maven",
    en: "The secret can't be opened with the server's key: tell whoever runs Maven",
  },
  "apiKeys.webhook.err.maven_sesion": {
    es: "Maven no pudo leer como la persona de la key; reintenta en 5 min",
    en: "Maven couldn't read as the key's person; retrying in 5 min",
  },
  "apiKeys.webhook.err.maven": {
    es: "Falla de Maven, no del integrador; reintenta en 5 min",
    en: "A Maven-side failure, not the integrator's; retrying in 5 min",
  },

  "apiKeys.webhook.pause": { es: "Pausar", en: "Pause" },
  "apiKeys.webhook.resume": { es: "Reanudar", en: "Resume" },
  "apiKeys.webhook.delete": { es: "Borrar", en: "Delete" },
  "apiKeys.webhook.deleteTitle": { es: "¿Borrar el webhook de “{name}”?", en: "Delete the webhook for “{name}”?" },
  "apiKeys.webhook.deleteBody": {
    es: "Maven deja de avisarle a {host} y el secreto deja de valer. Para volver hay que registrar uno nuevo, con otro secreto.",
    en: "Maven stops notifying {host} and the secret stops being valid. To come back you have to register a new one, with a new secret.",
  },
  "apiKeys.webhook.toast.registered": { es: "Webhook registrado", en: "Webhook registered" },
  "apiKeys.webhook.toast.paused": { es: "Webhook pausado", en: "Webhook paused" },
  "apiKeys.webhook.toast.deleted": { es: "Webhook borrado", en: "Webhook deleted" },
  "apiKeys.webhook.toast.activated": { es: "Webhook activado", en: "Webhook activated" },

  "apiKeys.webhook.test.delivered": { es: "Llegó", en: "Delivered" },
  "apiKeys.webhook.test.notDelivered": { es: "No llegó", en: "Not delivered" },
  "apiKeys.webhook.test.activated": {
    es: "Webhook activado: desde ahora avisa los mensajes nuevos.",
    en: "Webhook activated: from now on it notifies new messages.",
  },
  "apiKeys.webhook.test.uncertain": {
    es: "Se cortó después de mandar: puede haber llegado igual.",
    en: "It was cut off after sending: it may have arrived anyway.",
  },

  "apiKeys.webhook.deliveries.onlyFailed": { es: "Solo las que no se entregaron", en: "Only the ones not delivered" },
  "apiKeys.webhook.deliveries.empty": { es: "Todavía no hay entregas.", en: "No deliveries yet." },
  "apiKeys.webhook.deliveries.loadError": { es: "No se pudieron cargar las entregas.", en: "Couldn't load the deliveries." },
  "apiKeys.webhook.deliveries.retention": {
    es: "Se guardan 14 días. Maven nunca guarda lo que contesta tu servidor, solo el código.",
    en: "They're kept for 14 days. Maven never stores what your server answers, only the code.",
  },
  "apiKeys.webhook.deliveries.col.when": { es: "Cuándo", en: "When" },
  "apiKeys.webhook.deliveries.col.type": { es: "Tipo", en: "Type" },
  "apiKeys.webhook.deliveries.col.attempts": { es: "Intentos", en: "Attempts" },
  "apiKeys.webhook.deliveries.col.result": { es: "Resultado", en: "Result" },
  "apiKeys.webhook.deliveries.type.bellCount": { es: "Aviso · {n} mensajes", en: "Notification · {n} messages" },
  "apiKeys.webhook.deliveries.type.bellOne": { es: "Aviso · 1 mensaje", en: "Notification · 1 message" },
  "apiKeys.webhook.deliveries.lastAt": { es: "el último: {when}", en: "last one: {when}" },
  "apiKeys.webhook.deliveries.type.test": { es: "Prueba", en: "Test" },
  "apiKeys.webhook.deliveries.delivered": { es: "Entregado", en: "Delivered" },
  "apiKeys.webhook.deliveries.pending": { es: "Pendiente", en: "Pending" },
  "apiKeys.webhook.deliveries.retrying": { es: "Reintenta {when}", en: "Retrying {when}" },
  "apiKeys.webhook.deliveries.dropped": { es: "Descartado: {reason}", en: "Dropped: {reason}" },
  "apiKeys.webhook.drop.receiver_gone": { es: "el servidor dijo 410", en: "the server said 410" },
  "apiKeys.webhook.drop.receiver_failing": { es: "3 días fallando", en: "3 days failing" },
  "apiKeys.webhook.drop.endpoint_paused": { es: "se pausó", en: "it was paused" },
  "apiKeys.webhook.drop.endpoint_disabled": { es: "se detuvo", en: "it was stopped" },
  "apiKeys.webhook.drop.test_failed": { es: "la prueba no llegó", en: "the test wasn't delivered" },
  "apiKeys.webhook.drop.other": { es: "otro motivo", en: "another reason" },

  "apiKeys.docs.webhooks": { es: "Webhooks (Messenger)", en: "Webhooks (Messenger)" },
  "apiKeys.docs.webhooks.what": {
    es: "Con una key de Messenger se puede registrar un webhook (columna **Webhook** de la tabla). Maven revisa cada 15 s y, si hay mensajes nuevos, le manda a tu URL un **aviso firmado sin contenido**: cuántos, en qué conversaciones y los cursores. El contenido se lee con `GET /messenger/feed`.",
    en: "A Messenger key can have a webhook (the table's **Webhook** column). Maven checks every 15 s and, if there are new messages, sends your URL a **signed notification with no content**: how many, in which conversations and the cursors. The content is read with `GET /messenger/feed`.",
  },
  "apiKeys.docs.webhooks.signature": {
    es: "Cada aviso lleva `webhook-id`, `webhook-timestamp` y `webhook-signature` (Standard Webhooks: HMAC-SHA256 con el secreto `whsec_…`). Verificá la firma sobre el cuerpo **tal cual llega**, compará en tiempo constante y rechazá timestamps de más de 5 minutos. Las librerías `standardwebhooks` (Node, Python, Go y otras) lo hacen solas.",
    en: "Each notification carries `webhook-id`, `webhook-timestamp` and `webhook-signature` (Standard Webhooks: HMAC-SHA256 with the `whsec_…` secret). Verify the signature over the body **exactly as received**, compare in constant time and reject timestamps more than 5 minutes off. The `standardwebhooks` libraries (Node, Python, Go and others) do it for you.",
  },
  "apiKeys.docs.webhooks.receiver": {
    es: "Tu servidor contesta **2xx en menos de 5 s** y hace el trabajo después: lee `GET /messenger/feed?after=<su último next_cursor>` (la primera vez, `data.after` del aviso) con el mismo `exclude_own` del aviso, sigue `next_cursor` hasta `caught_up = true` y guarda el cursor. Deduplica por `message.id` e ignora tipos de evento que no conozca.",
    en: "Your server answers **2xx within 5 s** and does the work afterwards: it reads `GET /messenger/feed?after=<its last next_cursor>` (the first time, the notification's `data.after`) with the notification's same `exclude_own`, follows `next_cursor` until `caught_up = true` and saves the cursor. It deduplicates by `message.id` and ignores event types it doesn't know.",
  },
  "apiKeys.docs.webhooks.guarantees": {
    es: "Garantías: **al menos una vez** (un aviso puede repetirse, con el mismo `webhook-id`), sin orden entre avisos (el feed sí está ordenado) y un solo aviso en vuelo por webhook. Si falla, se reintenta el mismo con esperas crecientes (30 s, 2 min, 10 min… hasta 8 h); si falla **3 días seguidos** o contesta **410**, el webhook se detiene. Un 3xx cuenta como fallo: no se siguen redirecciones.",
    en: "Guarantees: **at least once** (a notification may repeat, with the same `webhook-id`), no order between notifications (the feed is ordered) and only one notification in flight per webhook. If it fails, the same one is retried with growing waits (30 s, 2 min, 10 min… up to 8 h); if it fails **3 days in a row** or answers **410**, the webhook stops. A 3xx counts as a failure: redirects aren't followed.",
  },
  "apiKeys.docs.webhooks.fallback": {
    es: "**Obligatorio:** además del webhook, leé el feed con tu propio cursor **cada 15 minutos o menos**. Así un aviso perdido, una pausa o un webhook detenido solo demoran mensajes, nunca los pierden (son 4 pedidos por hora de los 1000 del límite).",
    en: "**Required:** besides the webhook, read the feed with your own cursor **every 15 minutes or less**. That way a lost notification, a pause or a stopped webhook only delays messages, never loses them (it's 4 requests per hour out of the 1000 limit).",
  },
  "apiKeys.docs.webhooks.limits": {
    es: "Maven no tiene IPs de salida fijas: la firma es la prueba de que el aviso viene de Maven. El webhook deja de funcionar cuando la key vence (90 días como máximo): renovar es crear una key nueva y registrar el webhook de nuevo.",
    en: "Maven has no fixed outgoing IPs: the signature is the proof that the notification comes from Maven. The webhook stops working when the key expires (90 days at most): renewing means creating a new key and registering the webhook again.",
  },
  "apiKeys.docs.webhooks.example": { es: "Ejemplo de aviso", en: "Example notification" },
} as const satisfies Record<string, { es: string; en: string }>;
