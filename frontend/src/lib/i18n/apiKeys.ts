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
    es: "Acceso programático a los datos de Maven (creadoras, empleados, ventas) y, con su permiso, al Messenger: leerlo y mandar mensajes.",
    en: "Programmatic access to Maven data (creators, employees, sales) and, with its own permission, to the Messenger: reading it and sending messages.",
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
    es: "Todavía no hay API keys. Crea la primera con “{button}”.",
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
    es: "La persona como la que actúa esta key fue dada de baja o ya no está en la agencia: el API la rechaza con 401. Revócala y crea otra.",
    en: "The person this key acts as was offboarded or is no longer in the agency: the API rejects it with 401. Revoke it and create a new one.",
  },
  "apiKeys.status.active": { es: "Activa", en: "Active" },
  "apiKeys.status.unverified": { es: "Activa · sin verificar", en: "Active · unverified" },
  "apiKeys.status.unverifiedHint": {
    es: "No se pudo verificar si la persona como la que actúa esta key sigue activa. Recarga la página.",
    en: "Couldn't verify whether the person this key acts as is still active. Reload the page.",
  },
  "apiKeys.actsAsDisplayName": { es: "como «{name}»", en: "as “{name}”" },
  "apiKeys.status.revoked": { es: "Revocada", en: "Revoked" },
  "apiKeys.status.expired": { es: "Vencida", en: "Expired" },
  "apiKeys.revoke": { es: "Revocar", en: "Revoke" },

  // Key recién creada
  "apiKeys.fresh.title": { es: "Key creada", en: "Key created" },
  "apiKeys.fresh.copyNow": {
    es: "Cópiala ahora. **No la vas a volver a ver** — Maven solo guarda un hash.",
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
    es: "La key va a actuar como tú, y eso no se puede cambiar después.",
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
  "apiKeys.form.writes": { es: "Manda mensajes", en: "Sends messages" },
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
  // messenger:write: nombre visible, rotación y la confirmación propia
  "apiKeys.form.displayName": { es: "Nombre visible", en: "Display name" },
  "apiKeys.form.displayNamePlaceholder": { es: "Ej: BLU", en: "E.g.: BLU" },
  "apiKeys.form.displayNameHint": {
    es: "Es el nombre con el que salen los mensajes de la key, junto a la etiqueta API (por ejemplo «BLU»): lo ven todos en la burbuja, la lista de chats, la campana y el celular. De 2 a 32 caracteres, con letras, números, espacios y . & _ -. No puede parecerse a Maven, a un área (soporte, sistemas, RR. HH.…) ni a una persona de la agencia, y queda reservado para esta integración aunque la key venza.",
    en: "It's the name the key's messages go out with, next to the API label (for example “BLU”): everyone sees it in the bubble, the chat list, the bell and on their phone. 2 to 32 characters, using letters, numbers, spaces and . & _ -. It can't look like Maven, a department (support, systems, HR…) or a person in the agency, and it stays reserved for this integration even after the key expires.",
  },
  "apiKeys.form.displayName.required": {
    es: "Una key que escribe en el Messenger necesita un nombre visible: el que verán todos junto a la etiqueta API",
    en: "A key that writes to the Messenger needs a display name: the one everyone will see next to the API label",
  },
  "apiKeys.form.displayName.format": {
    es: "El nombre visible va de 2 a 32 caracteres, con letras, números, espacios y . & _ -",
    en: "The display name must be 2 to 32 characters long, using letters, numbers, spaces and . & _ -",
  },
  "apiKeys.form.displayName.reserved": {
    es: "Ese nombre visible se parece al de Maven o al de un área (soporte, sistemas, RR. HH., finanzas…): elige otro",
    en: "That display name looks like Maven's or a department's (support, systems, HR, finance…): choose another one",
  },
  "apiKeys.form.replaces": { es: "Reemplaza a…", en: "Replaces…" },
  "apiKeys.form.replacesNone": { es: "Ninguna: es una integración nueva", en: "None: it's a new integration" },
  "apiKeys.form.replacesOption": { es: "{name} · «{display}» · {status}", en: "{name} · “{display}” · {status}" },
  "apiKeys.form.replacesHint": {
    es: "Si esta key reemplaza a otra tuya que escribía (porque vence o porque la revocaste), elígela: la nueva sigue siendo la misma integración, con su nombre visible, y puede editar y borrar lo que mandó la anterior.",
    en: "If this key replaces another of yours that wrote messages (because it expires or because you revoked it), choose it: the new one stays the same integration, with its display name, and can edit and delete what the old one sent.",
  },
  "apiKeys.form.writeTitle": {
    es: "Esta key va a mandar mensajes en el Messenger a nombre de {name}",
    en: "This key will send Messenger messages on behalf of {name}",
  },
  "apiKeys.form.writeTitleYou": {
    es: "Esta key va a mandar mensajes en el Messenger a tu nombre",
    en: "This key will send Messenger messages on your behalf",
  },
  "apiKeys.form.writeBody": {
    es: "En tus conversaciones y en directos nuevos con gente de la agencia. Cada mensaje sale con el nombre visible y la etiqueta API, pero sale de tu cuenta: tú y cualquier admin pueden retirarlo. Quien tenga la key escribe desde las IPs que pongas, hasta que venza o la revoques.",
    en: "In your conversations and in new direct chats with people in the agency. Each message goes out with the display name and the API label, but it comes from your account: you or any admin can withdraw it. Whoever has the key can write from the IPs you set, until it expires or you revoke it.",
  },
  "apiKeys.form.writeConfirm": {
    es: "Entiendo que la key manda mensajes a mi nombre, con el nombre visible y la etiqueta API.",
    en: "I understand the key sends messages on my behalf, with the display name and the API label.",
  },
  "apiKeys.write.outdatedOne": {
    es: "1 persona conectada con una versión de Maven sin la etiqueta API: {names}",
    en: "1 person connected with a version of Maven without the API label: {names}",
  },
  "apiKeys.write.outdatedMany": {
    es: "{n} personas conectadas con una versión de Maven sin la etiqueta API: {names}",
    en: "{n} people connected with a version of Maven without the API label: {names}",
  },
  "apiKeys.write.outdatedMore": { es: "{n} más", en: "{n} more" },
  "apiKeys.write.outdatedHint": {
    es: "Verían los mensajes de esta key como si los escribieras tú, sin la etiqueta API. Pídeles que recarguen Maven antes de que se encienda la escritura.",
    en: "They'd see this key's messages as if you wrote them, without the API label. Ask them to reload Maven before writing is turned on.",
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

  // Retirar lo que mandó una integración (api_retirar_mensajes_de_integracion)
  "apiKeys.withdraw.button": { es: "Retirar lo que mandó desde…", en: "Withdraw what it sent since…" },
  "apiKeys.withdraw.title": { es: "Retirar lo que mandó «{name}»", en: "Withdraw what “{name}” sent" },
  "apiKeys.withdraw.body": {
    es: "Se retira lo que mandó esta integración —todas sus keys, también las revocadas o vencidas— desde la fecha que elijas: cada mensaje se archiva para los admins, se vacía en el Messenger para todos y se borran sus notificaciones. No se puede deshacer.",
    en: "This withdraws what this integration sent —all its keys, including revoked or expired ones— since the date you choose: each message is archived for admins, emptied in the Messenger for everyone, and its notifications are deleted. This can't be undone.",
  },
  "apiKeys.withdraw.revokeFirst": {
    es: "La key sigue activa: si la integración sigue mandando, revócala primero para que no llegue nada nuevo.",
    en: "The key is still active: if the integration is still sending, revoke it first so nothing new comes in.",
  },
  "apiKeys.withdraw.since": { es: "Desde", en: "Since" },
  "apiKeys.withdraw.since.hora": { es: "La última hora", en: "The last hour" },
  "apiKeys.withdraw.since.dia": { es: "Las últimas 24 horas", en: "The last 24 hours" },
  "apiKeys.withdraw.since.semana": { es: "Los últimos 7 días", en: "The last 7 days" },
  "apiKeys.withdraw.since.todo": { es: "Todo lo que mandó", en: "Everything it sent" },
  "apiKeys.withdraw.since.fecha": { es: "Una fecha y hora…", en: "A date and time…" },
  "apiKeys.withdraw.dateLabel": { es: "Fecha y hora desde la que se retira", en: "Date and time to withdraw from" },
  "apiKeys.withdraw.confirm": {
    es: "Entiendo que los mensajes se vacían para todos y que no se puede deshacer.",
    en: "I understand the messages are emptied for everyone and that this can't be undone.",
  },
  "apiKeys.withdraw.go": { es: "Retirar", en: "Withdraw" },
  "apiKeys.withdraw.stop": { es: "Detener", en: "Stop" },
  "apiKeys.withdraw.again": { es: "Seguir retirando", en: "Keep withdrawing" },
  "apiKeys.withdraw.starting": { es: "Retirando…", en: "Withdrawing…" },
  "apiKeys.withdraw.progress": { es: "Retirando… {done} retirados, quedan {left}", en: "Withdrawing… {done} withdrawn, {left} left" },
  "apiKeys.withdraw.moreThan": { es: "más de {n}", en: "more than {n}" },
  "apiKeys.withdraw.done": { es: "Listo: se retiraron {n} mensajes.", en: "Done: {n} messages were withdrawn." },
  "apiKeys.withdraw.doneOne": { es: "Listo: se retiró 1 mensaje.", en: "Done: 1 message was withdrawn." },
  "apiKeys.withdraw.nothing": { es: "No había nada que retirar desde esa fecha.", en: "There was nothing to withdraw since that date." },
  "apiKeys.withdraw.stopped": {
    es: "Se detuvo: se retiraron {done} y quedan {left}. Puedes seguir cuando quieras.",
    en: "Stopped: {done} withdrawn and {left} left. You can continue whenever you want.",
  },
  "apiKeys.withdraw.stuck": {
    es: "Se retiraron {done}, pero quedan {left}. Si la integración sigue mandando, revoca la key y sigue retirando.",
    en: "{done} were withdrawn, but {left} are left. If the integration is still sending, revoke the key and keep withdrawing.",
  },
  "apiKeys.withdraw.doneBefore": {
    es: "Antes del error se retiraron {n}: esos ya quedaron retirados.",
    en: "{n} were withdrawn before the error: those stay withdrawn.",
  },
  "apiKeys.withdraw.err.sin_sesion": {
    es: "Tu sesión venció. Vuelve a iniciar sesión y sigue retirando.",
    en: "Your session expired. Sign in again and keep withdrawing.",
  },
  "apiKeys.withdraw.err.sin_permiso": {
    es: "Solo un admin de la agencia de la key o la persona de la key puede retirar lo que mandó.",
    en: "Only an admin of the key's agency or the key's person can withdraw what it sent.",
  },
  "apiKeys.withdraw.err.sin_llave": { es: "Esa key ya no existe.", en: "That key no longer exists." },
  "apiKeys.withdraw.atLeast": {
    es: "Se retiraron al menos {n}: esos ya quedaron retirados.",
    en: "At least {n} were withdrawn: those stay withdrawn.",
  },
  "apiKeys.withdraw.err.sin_saber": {
    es: "Se cortó la conexión y no se sabe si la última tanda alcanzó a retirarse. Seguir retirando es seguro: nada se retira dos veces.",
    en: "The connection dropped, so it's not known whether the last batch went through. It's safe to keep withdrawing: nothing is withdrawn twice.",
  },
  "apiKeys.withdraw.err.otro": {
    es: "No se pudo retirar. Prueba de nuevo en un momento.",
    en: "Couldn't withdraw. Try again in a moment.",
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
  "apiKeys.scope.team.label": { es: "⚠️ Backstage manda el equipo", en: "⚠️ Backstage manages the team" },
  "apiKeys.scope.team.desc": {
    es: "Para Backstage: POST /equipo/sync con la lista completa del equipo (correo, rol, equipo, a quién reporta, nivel, horario y si sigue activo). Maven cambia rol, nivel, horario, equipo y jefe, y manda a la papelera a quien venga inactivo; nunca crea cuentas, nunca toca a admins ni dueños y nunca sube a nadie a admin. Mientras el dueño no prenda «aplicar», todo es ensayo: solo contesta qué cambiaría. Solo sirve si quien crea la key es admin o dueño.",
    en: "For Backstage: it POSTs the full team list to the team sync endpoint (email, role, team, who they report to, level, schedule and whether they are still active). Maven updates role, level, schedule, team and manager, and moves whoever comes in as inactive to the trash; it never creates accounts, never touches admins or owners and never promotes anyone to admin. Until the owner turns on \"apply\", everything is a dry run: it only answers what it would change. It only works if the person who creates the key is an admin or owner.",
  },
  "apiKeys.scope.hubstaff.label": { es: "Horas de Hubstaff (diario)", en: "Hubstaff hours (daily)" },
  "apiKeys.scope.hubstaff.desc": {
    es: "Horas trabajadas por día según Hubstaff: tiempo trackeado (horas), actividad general y proyecto, por empleado. Filtros por fecha y empleado.",
    en: "Hours worked per day according to Hubstaff: tracked time (hours), overall activity and project, per employee. Filters by date and employee.",
  },
  "apiKeys.scope.cowork.label": { es: "Tiempo en Cowork (diario y al detalle)", en: "Cowork time (daily and detailed)" },
  "apiKeys.scope.cowork.desc": {
    es: "Tiempo trabajado en Cowork por empleado y día: segundos con el reloj corriendo (cámara + pantalla, presente), y detenido por pausa, sin cámara, sin pantalla, fuera de cámara o sin conexión a la sala. Con /cowork/time/segments, cada tramo con hora de inicio, fin y motivo. Es el dato que va a reemplazar a Hubstaff.",
    en: "Time worked in Cowork per employee and day: seconds with the clock running (camera + screen, present), and stopped for a break, no camera, no screen, off camera or disconnected from the room. With /cowork/time/segments, each segment with start time, end time and reason. It's the data that will replace Hubstaff.",
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
  "apiKeys.scope.messengerWrite.label": {
    es: "⚠️ Mandar mensajes en el Messenger a nombre de quien crea la key",
    en: "⚠️ Send Messenger messages on behalf of whoever creates the key",
  },
  "apiKeys.scope.messengerWrite.desc": {
    es: "Manda mensajes de texto en las conversaciones de la persona que crea la key, abre chats directos con gente de su agencia y edita o borra lo que mandó la misma integración. Cada mensaje sale con el nombre visible de la key y la etiqueta API, y lo frenan los topes por minuto, hora y día. Va siempre con messenger:read, pide un nombre visible y que quien la crea confirme que escribirá a su nombre, y solo se puede poner al crear una key nueva.",
    en: "Sends text messages in the conversations of the person who creates the key, opens direct chats with people in their agency, and edits or deletes what the same integration sent. Each message goes out with the key's display name and the API label, and is held back by per-minute, per-hour and per-day limits. It always goes with messenger:read, needs a display name and the creator's confirmation that it will write on their behalf, and can only be added when creating a new key.",
  },

  // Referencia del API
  "apiKeys.docs.description": {
    es: "Autenticación por API key. Todo es de lectura, salvo las rutas del Messenger que piden messenger:write.",
    en: "API key authentication. Everything is read-only, except the Messenger routes that require messenger:write.",
  },
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
    es: "Como quién actúa esta key (acts_as: id, name, avatar_url), su agencia (agency_id) y el cupo que le queda esta hora (rate_limit). Con messenger:write, también messenger_write: el nombre visible, los topes y lo que queda de cada uno (null en una key que no escribe). No necesita scope.",
    en: "Who this key acts as (acts_as: id, name, avatar_url), its agency (agency_id) and how much of this hour's quota is left (rate_limit). With messenger:write, also messenger_write: the display name, the limits and what's left of each (null for a key that doesn't write). No scope needed.",
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
    es: "La historia, de lo más nuevo a lo más viejo, con cursor: pasa next_cursor en el parámetro before para la página anterior, o usa el parámetro after para pedir lo nuevo en orden. Cada mensaje: sender, kind (text | image | gif | video | voice_note | audio | file | system), text, attachment (url, name, hosted_by, storage_path), reply_to_id, is_thread_reply, is_edited, is_deleted. Un borrado viene sin texto ni adjunto. Filtros: limit (máx 100), before | after, thread_root_id, include=rich (agrega el texto con formato).",
    en: "The history, newest to oldest, with a cursor: pass next_cursor in the before parameter for the previous page, or use the after parameter to get what's new in order. Each message: sender, kind (text | image | gif | video | voice_note | audio | file | system), text, attachment (url, name, hosted_by, storage_path), reply_to_id, is_thread_reply, is_edited, is_deleted. A deleted message comes without text or attachment. Filters: limit (max 100), before | after, thread_root_id, include=rich (adds the formatted text).",
  },
  "apiKeys.ep.feed": {
    es: "Lo nuevo en TODAS las conversaciones, en orden: así recibe mensajes una integración (con webhook, el aviso le dice cuándo leer y además lee cada 15 min o menos como respaldo; sin webhook, lee cada tanto). Primer pedido con since (ISO, 72 h como máximo) o sin nada (últimos 15 min); después, siempre after=next_cursor. Si caught_up = true, espera 30 s o más antes del próximo. Mira como mucho una hora por pedido. exclude_own=true saca lo que mandó la propia persona. Solo mensajes nuevos: ediciones y borrados se ven releyendo la conversación.",
    en: "What's new across ALL conversations, in order: this is how an integration receives messages (with a webhook, the notification tells it when to read, and it still reads every 15 minutes or less as a fallback; without one, it reads every so often). First request with since (ISO, 72 h at most) or nothing (last 15 min); after that, always after=next_cursor. If caught_up = true, wait 30 s or more before the next one. It looks at one hour per request at most. exclude_own=true drops what the person sent themselves. New messages only: edits and deletions show up when you re-read the conversation.",
  },
  "apiKeys.ep.people": {
    es: "A quién se le puede escribir: las personas activas de la agencia de la key, sin la persona de la key (id, name, avatar_url). Filtros: q (nombre, da igual con o sin acentos), limit (máx 100), offset. Pide messenger:read y messenger:write, y solo responde con la escritura encendida: apagada o en pausa, da 503 writes_paused.",
    en: "Who you can write to: the active people in the key's agency, without the key's person (id, name, avatar_url). Filters: q (name, accents don't matter), limit (max 100), offset. Requires messenger:read and messenger:write, and only answers while writing is on: when it's off or paused, it gives 503 writes_paused.",
  },
  "apiKeys.ep.openDirect": {
    es: "Abre un directo con una persona del directorio y le manda el primer mensaje, en el mismo paso. Cuerpo: type (direct), user_id y text. Si ya tienen un directo, se usa ese (200, created = false); si no, se crea (201). Nunca queda un directo vacío. Exige Idempotency-Key.",
    en: "Opens a direct chat with a person from the directory and sends them the first message, in the same step. Body: type (direct), user_id and text. If you already have a direct chat, that one is used (200, created = false); otherwise it's created (201). A direct chat is never left empty. Requires Idempotency-Key.",
  },
  "apiKeys.ep.send": {
    es: "Manda un mensaje de texto a una conversación donde la persona de la key participa (201; la repetición con la misma Idempotency-Key, 200 con idempotent_replay = true). Cuerpo: text, y opcionales reply_to_id (un mensaje de esa conversación) y thread (true para responder en el hilo de reply_to_id). Exige Idempotency-Key.",
    en: "Sends a text message to a conversation the key's person is in (201; a repeat with the same Idempotency-Key, 200 with idempotent_replay = true). Body: text, plus optional reply_to_id (a message in that conversation) and thread (true to reply in reply_to_id's thread). Requires Idempotency-Key.",
  },
  "apiKeys.ep.edit": {
    es: "Edita un mensaje que mandó la misma integración (también con una key anterior de la rotación). Cuerpo: text. Con el mismo texto, 200 sin cambios (changed = false). Lo escrito a mano o por otra integración da 403.",
    en: "Edits a message sent by the same integration (also with an earlier key from the rotation). Body: text. With the same text, 200 without changes (changed = false). Messages written by hand or by another integration give 403.",
  },
  "apiKeys.ep.delete": {
    es: "Borra un mensaje que mandó la misma integración, como lo borra la app (queda archivado para los admins). Sin cuerpo. Responde id y already_deleted.",
    en: "Deletes a message sent by the same integration, the way the app does (it stays archived for admins). No body. Answers id and already_deleted.",
  },
  "apiKeys.docs.write": { es: "Escribir en el Messenger", en: "Writing to the Messenger" },
  "apiKeys.docs.writeBody": {
    es: "Las rutas que escriben piden `messenger:write`. Cada pedido va con `Content-Type: application/json` y un cuerpo de hasta 64 KB; un campo que no existe da `400 unknown_field`. El texto va de 1 a 4.000 caracteres, sin formato. Todo mensaje sale con el nombre visible de la key y la etiqueta API, y en la lectura trae `via_api` (`{display_name}`; `null` si lo escribió una persona): `sender` sigue siendo la persona real.",
    en: "The routes that write require `messenger:write`. Each request goes with `Content-Type: application/json` and a body of up to 64 KB; a field that doesn't exist gives `400 unknown_field`. The text is 1 to 4,000 characters, plain. Every message goes out with the key's display name and the API label, and when read it carries `via_api` (`{display_name}`; `null` if a person wrote it): `sender` is still the real person.",
  },
  "apiKeys.docs.writeIdempotency": {
    es: "Los dos `POST` exigen `Idempotency-Key`: de 8 a 100 caracteres ASCII visibles, sin espacios, válida **72 horas**. El mismo pedido con la misma key devuelve el mismo resultado con `idempotent_replay: true` (no manda otro mensaje); otro pedido con la misma key da `409 idempotency_key_reused`, y si el primero sigue en curso, `429 concurrent_write`. Genera una por mensaje y guárdala hasta tener la respuesta.",
    en: "Both `POST` routes require `Idempotency-Key`: 8 to 100 visible ASCII characters, no spaces, valid for **72 hours**. The same request with the same key returns the same result with `idempotent_replay: true` (it doesn't send another message); a different request with the same key gives `409 idempotency_key_reused`, and if the first one is still in progress, `429 concurrent_write`. Generate one per message and keep it until you have the answer.",
  },
  "apiKeys.docs.writeExample": { es: "Ejemplo: mandar un mensaje", en: "Example: sending a message" },
  "apiKeys.docs.writeLimits": {
    es: "Topes: por key, **1.000 mensajes por hora** (60 por minuto y 10.000 por día) y destinatarios ponderados: cada mensaje pesa (personas de la conversación − 1) + 3, así que un directo pesa 4 y un grupo de 50 pesa 52 (300 por minuto, 4.000 por hora y 40.000 por día). Por conversación, entre todas las keys: 6 por minuto y 150 por día; los grupos de más de 50 personas no se escriben por API. Editar y borrar tienen su propio tope (30 por minuto y 300 por hora). Pasado uno: `429 rate_limited` con `limit` (cuál) y `Retry-After`. `GET /me` dice los topes vigentes y lo que queda (`messenger_write`). Cada escritura también gasta 1 de los 1.000 pedidos por hora.",
    en: "Limits: per key, **1,000 messages per hour** (60 per minute and 10,000 per day) and weighted recipients: each message weighs (people in the conversation − 1) + 3, so a direct message weighs 4 and a group of 50 weighs 52 (300 per minute, 4,000 per hour and 40,000 per day). Per conversation, across all keys: 6 per minute and 150 per day; groups of more than 50 people can't be written to through the API. Editing and deleting have their own limit (30 per minute and 300 per hour). Past one: `429 rate_limited` with `limit` (which one) and `Retry-After`. `GET /me` tells you the current limits and what's left (`messenger_write`). Every write also uses 1 of the 1,000 requests per hour.",
  },
  "apiKeys.docs.writeLoop": {
    es: "**Rondas entre bots:** si las últimas 20 filas de una conversación son todas de integraciones de 2 o más personas, la siguiente da `429` con `limit: conversation_loop` durante una hora. Un mensaje de una persona la desarma. Una sola integración que publica sola (reportes a un grupo) no se corta: la frenan los topes del día.",
    en: "**Bot loops:** if the last 20 rows of a conversation all come from integrations of 2 or more people, the next one gives `429` with `limit: conversation_loop` for one hour. A message from a person breaks the loop. A single integration posting on its own (reports to a group) isn't cut off: the daily limits hold it back.",
  },
  "apiKeys.docs.writeUnknown": {
    es: "**Resultado incierto:** si la respuesta es `503 outcome_unknown` o se corta la conexión, el mensaje **puede haber salido**. Reintenta con la **misma** `Idempotency-Key`: si salió, recibes el mismo mensaje con `idempotent_replay: true`; con una key nueva saldría dos veces. `503 writes_paused` quiere decir que la escritura está apagada o en pausa: reintenta después de `Retry-After`.",
    en: "**Uncertain outcome:** if the answer is `503 outcome_unknown` or the connection drops, the message **may have gone out**. Retry with the **same** `Idempotency-Key`: if it went out, you get the same message with `idempotent_replay: true`; with a new key it would go out twice. `503 writes_paused` means writing is off or paused: retry after `Retry-After`.",
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
    es: "Tiempo en Cowork por empleado y día: active_seconds (lo que exige la sesión, presente; incluye el meet grupal), group_meet_seconds, paused_seconds, bathroom_breaks / bathroom_seconds / bathroom_exceeded (presupuesto del día), breaks / break_seconds / breaks_exceeded / break_excess_seconds (tope por pausa), no_camera_seconds, no_screen_seconds, away_seconds, disconnected_seconds (la sala se cayó; se pagan hasta 10 min por hora y ya van dentro de active_seconds), disconnected_long_seconds (caídas que no se pagan), in_room_seconds, sessions, first_join, last_leave. Filtros: from, to, profile_id.",
    en: "Cowork time per employee and day: active_seconds (what the session requires, present; includes the group meet), group_meet_seconds, paused_seconds, bathroom_breaks / bathroom_seconds / bathroom_exceeded (daily budget), breaks / break_seconds / breaks_exceeded / break_excess_seconds (per-break cap), no_camera_seconds, no_screen_seconds, away_seconds, disconnected_seconds (the room dropped; up to 10 min per hour is paid and already inside active_seconds), disconnected_long_seconds (unpaid drops), in_room_seconds, sessions, first_join, last_leave. Filters: from, to, profile_id.",
  },
  "apiKeys.ep.coworkSegments": {
    es: "Cada tramo del reloj al detalle: state (active | group_meet | paused | no_camera | no_screen | away | disconnected | disconnected_long; puede sumar valores nuevos: trate cualquier valor desconocido como reloj detenido), detail, started_at, ended_at, seconds, sesión y sala. Filtros: from, to, profile_id.",
    en: "Each clock segment in detail: state (active | group_meet | paused | no_camera | no_screen | away | disconnected | disconnected_long; new values may be added: treat any unknown value as a stopped clock), detail, started_at, ended_at, seconds, session and room. Filters: from, to, profile_id.",
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
    es: "No se pudo saber si esta key tiene webhook. Recarga la página.",
    en: "Couldn't tell whether this key has a webhook. Reload the page.",
  },
  "apiKeys.webhook.state.pending": { es: "Esperando la prueba", en: "Waiting for the test" },
  "apiKeys.webhook.state.active": { es: "Activo", en: "Active" },
  "apiKeys.webhook.state.failing": { es: "Activo · fallando", en: "Active · failing" },
  "apiKeys.webhook.state.paused": { es: "Pausado", en: "Paused" },
  "apiKeys.webhook.state.disabled": { es: "Detenido", en: "Stopped" },
  "apiKeys.webhook.state.delayed": { es: "Activo · demorado", en: "Active · delayed" },
  "apiKeys.webhook.stale": {
    es: "No se pudo actualizar el estado: esto es lo último que se supo.",
    en: "Couldn't refresh the status: this is the last thing we knew.",
  },
  "apiKeys.webhook.done": { es: "Listo", en: "Done" },
  "apiKeys.webhook.working": { es: "Procesando…", en: "Working…" },
  "apiKeys.webhook.noneBody": {
    es: "Esta key no tiene webhook. Solo la persona de la key puede registrarlo.",
    en: "This key has no webhook. Only the key's person can register one.",
  },
  "apiKeys.refreshFailed": {
    es: "No se pudo actualizar la lista: lo que ves puede estar viejo.",
    en: "Couldn't refresh the list: what you see may be out of date.",
  },
  "apiKeys.webhook.detail.delay": { es: "Demora de Maven", en: "Maven delay" },

  "apiKeys.webhook.title": { es: "Webhook de “{name}”", en: "Webhook for “{name}”" },
  "apiKeys.webhook.registerTitle": { es: "Registrar un webhook en “{name}”", en: "Register a webhook on “{name}”" },
  "apiKeys.webhook.registerIntro": {
    es: "Maven le avisa a tu servidor cada vez que hay mensajes nuevos que esta key puede leer. El aviso **no lleva contenido**: solo cuántos mensajes hay, en qué conversaciones y desde dónde leer. Tu servidor los lee con `GET /messenger/feed`, desde sus IPs fijas y con la key.",
    en: "Maven notifies your server whenever there are new messages this key can read. The notification **carries no content**: only how many messages there are, in which conversations and where to read from. Your server reads them with `GET /messenger/feed`, from its fixed IPs and with the key.",
  },
  "apiKeys.webhook.url": { es: "URL de tu servidor", en: "Your server's URL" },
  "apiKeys.webhook.urlPlaceholder": { es: "https://tu-servidor.com/maven/webhook", en: "https://your-server.com/maven/webhook" },
  "apiKeys.webhook.urlHint": {
    es: "Solo `https`, puerto 443, sin usuario ni `#`. No se puede editar: para cambiarla, borra el webhook y registra otro. Se trata como un secreto: después solo se muestra el dominio.",
    en: "Only `https`, port 443, no username or `#`. It can't be edited: to change it, delete the webhook and register another one. It's treated as a secret: afterwards only the domain is shown.",
  },
  "apiKeys.webhook.excludeOwn": { es: "No avisar los mensajes que yo mando", en: "Don't notify the messages I send" },
  "apiKeys.webhook.excludeOwnHint": {
    es: "Marcado, solo avisa lo que te escriben otras personas. Desmarcado, también lo que mandas tú.",
    en: "Checked, it only notifies what other people write to you. Unchecked, it also notifies what you send.",
  },
  "apiKeys.webhook.registerButton": { es: "Registrar webhook", en: "Register webhook" },
  "apiKeys.webhook.person.you": {
    es: "Eres tú, la persona de la key: el webhook avisa lo nuevo de tus conversaciones. Solo tú puedes registrarlo, probarlo o reanudarlo.",
    en: "That's you, the key's person: the webhook notifies what's new in your conversations. Only you can register, test or resume it.",
  },
  "apiKeys.webhook.person.other": {
    es: "La persona de la key: el webhook avisa lo nuevo de sus conversaciones. Solo esta persona puede registrarlo, probarlo o reanudarlo; cualquier admin puede pausarlo, borrarlo y ver las entregas.",
    en: "The key's person: the webhook notifies what's new in their conversations. Only this person can register, test or resume it; any admin can pause it, delete it and see the deliveries.",
  },

  "apiKeys.webhook.secretTitle": { es: "Webhook registrado", en: "Webhook registered" },
  "apiKeys.webhook.secretCopyNow": {
    es: "Copia el **secreto de firma** ahora y pásaselo al integrador: **no se vuelve a mostrar**. Con él verifica que cada aviso viene de Maven.",
    en: "Copy the **signing secret** now and give it to the integrator: **it won't be shown again**. They use it to verify that each notification comes from Maven.",
  },
  "apiKeys.webhook.secretCopy": { es: "Copiar secreto", en: "Copy secret" },
  "apiKeys.webhook.nextTest": {
    es: "Para activarlo, manda una prueba: Maven le manda a tu servidor un aviso firmado de tipo `webhook.test`, y tiene que contestar 2xx.",
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
    es: "Todavía no está activo: manda una prueba y que tu servidor la conteste con 2xx.",
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
  "apiKeys.webhook.help.delayed": {
    es: "La última revisión se demoró por una falla de Maven, no del integrador. Maven la reintenta sola.",
    en: "The last check was delayed by a Maven-side failure, not the integrator's. Maven retries it on its own.",
  },
  "apiKeys.webhook.help.paused": {
    es: "Pausado: no sale ningún aviso. Al reanudar, Maven manda una prueba y arranca desde ese momento; lo de la pausa no se avisa, y el integrador lo lee del feed con su cursor.",
    en: "Paused: no notification goes out. On resume, Maven sends a test and starts from that moment; what happened during the pause isn't notified, and the integrator reads it from the feed with its cursor.",
  },
  "apiKeys.webhook.reason.receiver_gone": {
    es: "Tu servidor contestó 410: dice que esa URL ya no existe. Si la volviste a habilitar, reanuda.",
    en: "Your server answered 410: it says that URL no longer exists. If you enabled it again, resume.",
  },
  "apiKeys.webhook.reason.receiver_failing": {
    es: "Falló 3 días seguidos sin contestar 2xx. Cuando el servidor vuelva, reanuda.",
    en: "It failed for 3 days in a row without answering 2xx. When the server is back, resume.",
  },
  "apiKeys.webhook.reason.key_revoked": {
    es: "La key fue revocada. Este webhook no vuelve: crea una key nueva y registra el webhook ahí.",
    en: "The key was revoked. This webhook won't come back: create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.key_expired": {
    es: "La key venció. Crea una key nueva y registra el webhook ahí.",
    en: "The key expired. Create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.scope_removed": {
    es: "La key ya no tiene el permiso de Messenger. Crea una key nueva y registra el webhook ahí.",
    en: "The key no longer has the Messenger permission. Create a new key and register the webhook there.",
  },
  "apiKeys.webhook.reason.person_inactive": {
    es: "La persona de la key fue dada de baja o ya no está en la agencia. Si la vuelven a activar, se puede reanudar.",
    en: "The key's person was offboarded or is no longer in the agency. If they're reactivated, it can be resumed.",
  },
  "apiKeys.webhook.reason.multi_agency": {
    es: "Hay más de una agencia en Maven: los webhooks quedan apagados hasta resolverlo.",
    en: "There's more than one agency in Maven: webhooks stay off until that's resolved.",
  },
  "apiKeys.webhook.reason.config_error": {
    es: "La URL ya no se acepta o hay un problema de configuración en Maven. Si reanudar no lo arregla, bórralo y regístralo de nuevo.",
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
    es: "El secreto no abre con la clave del servidor: avísale a quien administra Maven",
    en: "The secret can't be opened with the server's key: tell whoever runs Maven",
  },
  "apiKeys.webhook.err.maven_sesion": {
    es: "Maven no pudo leer como la persona de la key",
    en: "Maven couldn't read as the key's person",
  },
  "apiKeys.webhook.err.maven": {
    es: "Falla de Maven, no del integrador",
    en: "A Maven-side failure, not the integrator's",
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
  "apiKeys.webhook.test.maybe": { es: "No se sabe si llegó", en: "Delivery unconfirmed" },
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
  "apiKeys.webhook.drop.test_unconfirmed": { es: "la prueba no se confirmó", en: "the test wasn't confirmed" },
  "apiKeys.webhook.drop.other": { es: "otro motivo", en: "another reason" },

  "apiKeys.docs.webhooks": { es: "Webhooks (Messenger)", en: "Webhooks (Messenger)" },
  "apiKeys.docs.webhooks.what": {
    es: "Con una key de Messenger se puede registrar un webhook (columna **Webhook** de la tabla). Maven revisa cada 15 s y, si hay mensajes nuevos, le manda a tu URL un **aviso firmado sin contenido**: cuántos, en qué conversaciones y los cursores. El contenido se lee con `GET /messenger/feed`.",
    en: "A Messenger key can have a webhook (the table's **Webhook** column). Maven checks every 15 s and, if there are new messages, sends your URL a **signed notification with no content**: how many, in which conversations and the cursors. The content is read with `GET /messenger/feed`.",
  },
  "apiKeys.docs.webhooks.signature": {
    es: "Cada aviso lleva `webhook-id`, `webhook-timestamp` y `webhook-signature` (Standard Webhooks: HMAC-SHA256 con el secreto `whsec_…`). Verifica la firma sobre el cuerpo **tal cual llega**, compara en tiempo constante y rechaza timestamps de más de 5 minutos. Las librerías `standardwebhooks` (Node, Python, Go y otras) lo hacen solas.",
    en: "Each notification carries `webhook-id`, `webhook-timestamp` and `webhook-signature` (Standard Webhooks: HMAC-SHA256 with the `whsec_…` secret). Verify the signature over the body **exactly as received**, compare in constant time and reject timestamps more than 5 minutes off. The `standardwebhooks` libraries (Node, Python, Go and others) do it for you.",
  },
  "apiKeys.docs.webhooks.receiver": {
    es: "Tu servidor contesta **2xx enseguida (en 1 o 2 s)**: Maven espera como mucho 10 s, con la conexión incluida. El trabajo lo hace después: lee `GET /messenger/feed?after=<su último next_cursor>` (la primera vez, `data.after` del aviso) con el mismo `exclude_own` del aviso, sigue `next_cursor` hasta `caught_up = true` y guarda el cursor. Deduplica por `message.id` e ignora tipos de evento que no conozca.",
    en: "Your server answers **2xx right away (within 1 or 2 s)**: Maven waits 10 s at most, connection included. It does the work afterwards: it reads `GET /messenger/feed?after=<its last next_cursor>` (the first time, the notification's `data.after`) with the notification's same `exclude_own`, follows `next_cursor` until `caught_up = true` and saves the cursor. It deduplicates by `message.id` and ignores event types it doesn't know.",
  },
  "apiKeys.docs.webhooks.guarantees": {
    es: "Garantías: **al menos una vez** (un aviso puede repetirse, con el mismo `webhook-id`), sin orden entre avisos (el feed sí está ordenado) y un solo aviso de mensajes en vuelo por webhook (una prueba puede llegar a la vez). Si falla, se reintenta el mismo con esperas crecientes (30 s, 2 min, 10 min… hasta 8 h); si falla **3 días seguidos** o contesta **410**, el webhook se detiene. Un 3xx cuenta como fallo: no se siguen redirecciones.",
    en: "Guarantees: **at least once** (a notification may repeat, with the same `webhook-id`), no order between notifications (the feed is ordered) and only one message notification in flight per webhook (a test can arrive at the same time). If it fails, the same one is retried with growing waits (30 s, 2 min, 10 min… up to 8 h); if it fails **3 days in a row** or answers **410**, the webhook stops. A 3xx counts as a failure: redirects aren't followed.",
  },
  "apiKeys.docs.webhooks.fallback": {
    es: "**Obligatorio:** además del webhook, lee el feed con tu propio cursor **cada 15 minutos o menos**. Así un aviso perdido, una pausa o un webhook detenido solo demoran mensajes, nunca los pierden (son 4 pedidos por hora de los 1000 del límite).",
    en: "**Required:** besides the webhook, read the feed with your own cursor **every 15 minutes or less**. That way a lost notification, a pause or a stopped webhook only delays messages, never loses them (it's 4 requests per hour out of the 1000 limit).",
  },
  "apiKeys.docs.webhooks.limits": {
    es: "Maven no tiene IPs de salida fijas: la firma es la prueba de que el aviso viene de Maven. El webhook deja de funcionar cuando la key vence (90 días como máximo): renovar es crear una key nueva y registrar el webhook de nuevo.",
    en: "Maven has no fixed outgoing IPs: the signature is the proof that the notification comes from Maven. The webhook stops working when the key expires (90 days at most): renewing means creating a new key and registering the webhook again.",
  },
  "apiKeys.docs.webhooks.loops": {
    es: "**Bots que se contestan:** si tu integración responde lo que le llega, usa `exclude_own: true` (en el webhook y en `GET /messenger/feed`): así no recibe lo que manda su propia persona, tampoco por otra integración suya. No contestes mensajes con `via_api` sin una razón: si dos integraciones de personas distintas se responden entre sí, Maven corta la ronda a los 20 mensajes con `429 conversation_loop` durante una hora.",
    en: "**Bots answering each other:** if your integration replies to what it receives, use `exclude_own: true` (in the webhook and in `GET /messenger/feed`): that way it doesn't get what its own person sends, including through another of their integrations. Don't answer messages with `via_api` without a reason: if two integrations of different people answer each other, Maven cuts the loop at 20 messages with `429 conversation_loop` for one hour.",
  },
  "apiKeys.docs.webhooks.example": { es: "Ejemplo de aviso", en: "Example notification" },
} as const satisfies Record<string, { es: string; en: string }>;
