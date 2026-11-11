// Ajustes → Conectar tu plataforma (agencias conectadas, 11/11/2026): la plataforma
// de RR. HH. de la agencia (Backstage u otra) manda el equipo a Maven y recibe de
// vuelta horas, notas y avisos.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
//
// Lo que va entre `acentos graves` se dibuja como código (ConFormato) y en las
// instrucciones que se copian queda tal cual, como en un documento de texto.
export const PREFIJOS_CONEXION_EQUIPO = ["conexionEquipo."] as const;

export const conexionEquipo = {
  // ── La fila en Ajustes → Administración ──
  "conexionEquipo.fila.titulo": { es: "Conectar tu plataforma", en: "Connect your platform" },
  "conexionEquipo.fila.desc": {
    es: "Tu sistema de RR. HH. manda el equipo a Maven y recibe horas, notas y avisos.",
    en: "Your HR system sends the team to Maven and gets hours, scores and notices back.",
  },

  // ── Encabezado ──
  "conexionEquipo.titulo": { es: "Conectar tu plataforma", en: "Connect your platform" },
  "conexionEquipo.subtitulo": {
    es: "Conecta la plataforma de RR. HH. de tu agencia (por ejemplo, Backstage) para que mande el equipo a Maven. Lo haces tú, sin escribirnos.",
    en: "Connect your agency's HR platform (Backstage, for example) so it sends the team to Maven. You do it yourself, no need to write to us.",
  },
  "conexionEquipo.fallo": {
    es: "No se pudo cargar. No quiere decir que esté vacío.",
    en: "Couldn't load it. That doesn't mean it's empty.",
  },
  "conexionEquipo.vacio": { es: "(vacío)", en: "(empty)" },

  // ── 1. Estado ──
  "conexionEquipo.estado.titulo": { es: "Estado", en: "Status" },
  "conexionEquipo.estado.para": {
    es: "Si tu plataforma está conectada, cuándo mandó por última vez y si Maven ya aplica lo que llega.",
    en: "Whether your platform is connected, when it last sent anything and whether Maven already applies what arrives.",
  },
  "conexionEquipo.estado.conectada": { es: "Conectada", en: "Connected" },
  "conexionEquipo.estado.sinConectar": { es: "Sin conectar", en: "Not connected" },
  "conexionEquipo.estado.noSe": { es: "Sin saber", en: "Unknown" },
  "conexionEquipo.estado.llave": { es: "Llave", en: "Key" },
  "conexionEquipo.estado.llaveActiva": { es: "Llave «{nombre}» activa", en: "Key “{nombre}” active" },
  "conexionEquipo.estado.sinLlave": {
    es: "Todavía no hay una llave con el permiso del equipo.",
    en: "There's no key with the team permission yet.",
  },
  "conexionEquipo.estado.llaveVencida": {
    es: "La llave «{nombre}» ya no sirve (venció o la revocaron). Crea otra.",
    en: "The key “{nombre}” no longer works (it expired or was revoked). Create another one.",
  },
  "conexionEquipo.estado.llaveNoSe": {
    es: "No se pudo saber si hay llave.",
    en: "Couldn't tell whether there's a key.",
  },
  "conexionEquipo.estado.ultimoEnvio": { es: "Último envío", en: "Last sync" },
  "conexionEquipo.estado.nunca": { es: "Nunca", en: "Never" },
  "conexionEquipo.estado.nuncaDetalle": {
    es: "Tu plataforma todavía no ha mandado nada.",
    en: "Your platform hasn't sent anything yet.",
  },
  "conexionEquipo.estado.resumenCorto": {
    es: "{recibidas} personas · {cambios} cambios",
    en: "{recibidas} people · {cambios} changes",
  },
  "conexionEquipo.estado.modo": { es: "Modo", en: "Mode" },

  "conexionEquipo.modo.ensayo": { es: "Ensayo", en: "Dry run" },
  "conexionEquipo.modo.aplicando": { es: "Aplicando", en: "Applying" },
  "conexionEquipo.modo.aplicar": { es: "Aplicar", en: "Apply" },
  "conexionEquipo.modo.ensayoDesc": {
    es: "Tu plataforma manda y Maven solo muestra qué cambiaría.",
    en: "Your platform sends and Maven only shows what would change.",
  },
  "conexionEquipo.modo.aplicandoDesc": {
    es: "Maven aplica lo que manda tu plataforma: roles, niveles, equipos, jefes, horarios y salidas.",
    en: "Maven applies what your platform sends: roles, levels, teams, managers, schedules and departures.",
  },
  "conexionEquipo.modo.ensayoCorto": { es: "Maven todavía no cambia nada.", en: "Maven doesn't change anything yet." },
  "conexionEquipo.modo.aplicandoCorto": { es: "Maven aplica lo que llega.", en: "Maven applies what arrives." },
  "conexionEquipo.modo.soloDueno": {
    es: "Solo el dueño de la agencia puede cambiar el modo.",
    en: "Only the agency owner can change the mode.",
  },
  "conexionEquipo.modo.duenoNoSe": {
    es: "No se pudo comprobar si eres el dueño de la agencia.",
    en: "Couldn't check whether you're the agency owner.",
  },
  "conexionEquipo.modo.sinFila": {
    es: "Tu agencia todavía no tiene la conexión preparada. Se prepara sola con el primer envío de tu plataforma.",
    en: "Your agency's connection isn't set up yet. It sets itself up with your platform's first sync.",
  },
  "conexionEquipo.modo.confirmarTitulo": { es: "¿Empezar a aplicar?", en: "Start applying?" },
  "conexionEquipo.modo.confirmarCuerpo": {
    es: "Desde el próximo envío, Maven cambia roles, niveles, equipos, jefes y horarios, y manda a la papelera (30 días) a quien llegue inactivo. Nunca toca a admins ni dueños y nunca crea cuentas solo.",
    en: "From the next sync on, Maven changes roles, levels, teams, managers and schedules, and moves whoever arrives inactive to the trash (30 days). It never touches admins or owners and never creates accounts on its own.",
  },
  "conexionEquipo.modo.confirmarSi": { es: "Sí, aplicar", en: "Yes, apply" },
  "conexionEquipo.modo.yaAplica": {
    es: "Listo: Maven ya aplica lo que manda tu plataforma.",
    en: "Done: Maven now applies what your platform sends.",
  },
  "conexionEquipo.modo.volvioAEnsayo": {
    es: "Volviste a ensayo: Maven no cambia nada.",
    en: "Back to dry run: Maven doesn't change anything.",
  },
  "conexionEquipo.modo.noSeGuardo": {
    es: "No se pudo cambiar el modo.",
    en: "Couldn't change the mode.",
  },

  // ── 2. Paso a paso ──
  "conexionEquipo.pasos.titulo": { es: "Paso a paso para conectar", en: "Step by step" },
  "conexionEquipo.pasos.para": {
    es: "Tres pasos. Los hace quien maneja la plataforma de tu agencia, sin depender de nosotros.",
    en: "Three steps. Whoever runs your agency's platform does them, without depending on us.",
  },
  "conexionEquipo.pasos.hecho": { es: "Hecho", en: "Done" },
  "conexionEquipo.pasos.1.titulo": { es: "Crea la llave", en: "Create the key" },
  "conexionEquipo.pasos.1.desc": {
    es: "En API keys, crea una llave con el permiso `equipo:write`. La llave va como variable de entorno, nunca por chat.",
    en: "In API keys, create a key with the `equipo:write` permission. The key goes in an environment variable, never over chat.",
  },
  "conexionEquipo.pasos.1.boton": { es: "Crear la llave", en: "Create the key" },
  "conexionEquipo.pasos.1.hecho": { es: "Llave «{nombre}» lista", en: "Key “{nombre}” ready" },
  "conexionEquipo.pasos.2.titulo": { es: "Copia las instrucciones", en: "Copy the instructions" },
  "conexionEquipo.pasos.2.desc": {
    es: "Pásaselas a quien maneja tu plataforma: direcciones, formato y avisos, todo en un texto.",
    en: "Hand them to whoever runs your platform: addresses, format and notices, all in one text.",
  },
  "conexionEquipo.pasos.2.ver": { es: "Ver instrucciones", en: "Show instructions" },
  "conexionEquipo.pasos.2.ocultar": { es: "Ocultar instrucciones", en: "Hide instructions" },
  "conexionEquipo.pasos.2.copiar": { es: "Copiar instrucciones", en: "Copy instructions" },
  "conexionEquipo.pasos.3.titulo": { es: "Prueba y activa", en: "Test, then turn it on" },
  "conexionEquipo.pasos.3.desc": {
    es: "Tu plataforma manda en ensayo, revisas abajo qué cambiaría y, si se ve bien, el dueño activa «Aplicar».",
    en: "Your platform sends a dry run, you check below what would change and, if it looks right, the owner turns on “Apply”.",
  },

  // ── Las instrucciones que se copian ──
  "conexionEquipo.instr.titulo": {
    es: "# Conectar la plataforma de equipo con Maven",
    en: "# Connecting your team platform to Maven",
  },
  "conexionEquipo.instr.base": { es: "Base del API: {base}", en: "API base: {base}" },
  "conexionEquipo.instr.auth": {
    es: "Cada pedido lleva el encabezado `Authorization: Bearer <llave>`. La llave tiene el permiso `equipo:write` y la crea en Maven el dueño o un admin de la agencia.",
    en: "Every request carries the `Authorization: Bearer <key>` header. The key has the `equipo:write` permission and is created in Maven by the agency owner or an admin.",
  },
  "conexionEquipo.instr.secreto": {
    es: "IMPORTANTE: la llave va como variable de entorno (por ejemplo `MAVEN_API_KEY`), nunca por chat, correo ni documento. Si se filtra, revócala en Maven y crea otra.",
    en: "IMPORTANT: the key goes in an environment variable (for example `MAVEN_API_KEY`), never over chat, email or in a document. If it leaks, revoke it in Maven and create another one.",
  },
  "conexionEquipo.instr.sync.titulo": {
    es: "## 1. Mandar el equipo: `POST /equipo/sync`",
    en: "## 1. Sending the team: `POST /equipo/sync`",
  },
  "conexionEquipo.instr.sync.cuando": {
    es: "Manda la lista completa cada vez que algo cambie (o una vez por hora). El cuerpo:",
    en: "Send the full list whenever something changes (or once an hour). The body:",
  },
  "conexionEquipo.instr.sync.reglas": {
    es: "- `correo`, `nombre` y `activo` van siempre; lo demás es opcional. Un campo que no viene no se toca; uno que viene en `null` se vacía.\n- `nivel`: `manager`, `supervisor` o `agente`. Nadie sube a admin ni a dueño por aquí.\n- `reporta_a`: el correo de su jefe.\n- `hora_entrada` y `hora_salida`: en 24 horas, como `08:00`.\n- `activo: false` manda a la persona a la papelera de Maven (30 días, se puede recuperar). Faltar en la lista no es irse: a quien no viene no se le toca.\n- `roles`: los roles de tu plataforma. Los que Maven no tiene se crean sin permisos y el dueño marca qué ve cada uno.\n- Quien no tiene cuenta en Maven queda pendiente hasta que el dueño o un admin la apruebe.\n- Con `ensayo: true`, Maven contesta qué cambiaría sin tocar nada. Mientras el dueño no active «Aplicar», todo es ensayo.",
    en: "- `correo`, `nombre` and `activo` are always sent; the rest is optional. A field that isn't sent is left alone; one sent as `null` is cleared.\n- `nivel`: `manager`, `supervisor` or `agente`. Nobody is promoted to admin or owner this way.\n- `reporta_a`: their manager's email.\n- `hora_entrada` and `hora_salida`: 24-hour time, like `08:00`.\n- `activo: false` moves the person to Maven's trash (30 days, can be restored). Missing from the list doesn't mean leaving: whoever isn't sent is left alone.\n- `roles`: your platform's roles. The ones Maven doesn't have are created with no permissions and the owner marks what each one sees.\n- Whoever has no Maven account stays pending until the owner or an admin approves them.\n- With `ensayo: true`, Maven answers what would change without touching anything. Until the owner turns on “Apply”, everything is a dry run.",
  },
  "conexionEquipo.instr.sync.respuesta": {
    es: "La respuesta dice qué cambió (o cambiaría), quién quedó pendiente, qué roles faltan y qué se rechazó y por qué.",
    en: "The response says what changed (or would change), who is pending, which roles are missing and what was rejected and why.",
  },
  "conexionEquipo.instr.leer.titulo": { es: "## 2. Leer de Maven", en: "## 2. Reading from Maven" },
  "conexionEquipo.instr.leer.equipo": {
    es: "`GET /equipo`: las personas y los roles como están en Maven.",
    en: "`GET /equipo`: people and roles as they are in Maven.",
  },
  "conexionEquipo.instr.leer.horas": {
    es: "`GET /equipo/horas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: horas y asistencia de Cowork (hasta 93 días por consulta).",
    en: "`GET /equipo/horas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: Cowork hours and attendance (up to 93 days per request).",
  },
  "conexionEquipo.instr.leer.notas": {
    es: "`GET /equipo/notas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: la nota de Argos y su desglose.",
    en: "`GET /equipo/notas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: the Argos score and its breakdown.",
  },
  "conexionEquipo.instr.avisos.titulo": { es: "## 3. Avisos de Maven (webhook)", en: "## 3. Notices from Maven (webhook)" },
  "conexionEquipo.instr.avisos.cuerpo": {
    es: "Registra la dirección de tu servidor en Maven (Ajustes → Conectar tu plataforma → Avisos). Maven avisa con un POST firmado (encabezados `webhook-id`, `webhook-timestamp` y `webhook-signature`; el secreto se ve una sola vez, al registrar). Los avisos:",
    en: "Register your server's address in Maven (Settings → Connect your platform → Notices). Maven notifies you with a signed POST (headers `webhook-id`, `webhook-timestamp` and `webhook-signature`; the secret is shown only once, when you register). The notices:",
  },
  "conexionEquipo.instr.ejemplo.titulo": { es: "## Ejemplo", en: "## Example" },

  // ── 3. Última sincronización ──
  "conexionEquipo.sync.titulo": { es: "Última sincronización", en: "Last sync" },
  "conexionEquipo.sync.para": {
    es: "Lo último que mandó tu plataforma y qué hizo Maven con eso.",
    en: "The last thing your platform sent and what Maven did with it.",
  },
  "conexionEquipo.sync.nada": {
    es: "Tu plataforma todavía no ha mandado nada. Cuando mande el primer ensayo, aquí ves qué cambiaría.",
    en: "Your platform hasn't sent anything yet. When it sends the first dry run, you'll see here what would change.",
  },
  "conexionEquipo.sync.enEnsayo": { es: "Ensayo: no se cambió nada", en: "Dry run: nothing was changed" },
  "conexionEquipo.sync.aplicado": { es: "Aplicado", en: "Applied" },
  "conexionEquipo.sync.repetido": {
    es: "Llegó igual {n} veces (la última, {fecha})",
    en: "Arrived unchanged {n} times (the last one, {fecha})",
  },
  "conexionEquipo.sync.n.recibidas": { es: "Personas recibidas", en: "People received" },
  "conexionEquipo.sync.n.cambios": { es: "Cambios", en: "Changes" },
  "conexionEquipo.sync.n.aplicados": { es: "Aplicados", en: "Applied" },
  "conexionEquipo.sync.n.seAplicarian": { es: "Se aplicarían", en: "Would apply" },
  "conexionEquipo.sync.n.rechazados": { es: "Rechazados", en: "Rejected" },
  "conexionEquipo.sync.n.pendientes": { es: "Sin cuenta", en: "No account" },
  "conexionEquipo.sync.n.roles": { es: "Roles desconocidos", en: "Unknown roles" },
  "conexionEquipo.sync.n.protegidos": { es: "Protegidos", en: "Protected" },
  "conexionEquipo.sync.det.cambios": { es: "Cambios", en: "Changes" },
  "conexionEquipo.sync.det.rechazados": { es: "Rechazados y por qué", en: "Rejected and why" },
  "conexionEquipo.sync.det.roles": { es: "Roles que Maven no tiene", en: "Roles Maven doesn't have" },
  "conexionEquipo.sync.det.pendientes": { es: "Personas sin cuenta en Maven", en: "People with no Maven account" },
  "conexionEquipo.sync.det.protegidos": {
    es: "Protegidos: admins y dueños no se tocan",
    en: "Protected: admins and owners are never touched",
  },
  "conexionEquipo.sync.det.noVienen": {
    es: "Están en Maven y no vinieron (no se tocan)",
    en: "In Maven but not sent (left alone)",
  },
  "conexionEquipo.sync.det.enPapelera": {
    es: "Vinieron activas pero están en la papelera (se restauran a mano)",
    en: "Sent as active but in the trash (restore them by hand)",
  },
  "conexionEquipo.sync.det.nada": { es: "Nada aquí.", en: "Nothing here." },
  "conexionEquipo.sync.det.todoElEnvio": { es: "Todo el envío", en: "The whole sync" },
  "conexionEquipo.sync.det.rolPersonas": { es: "{n} personas lo traen", en: "{n} people have it" },
  "conexionEquipo.sync.det.sale": {
    es: "Sale del equipo: va a la papelera (30 días).",
    en: "Leaves the team: goes to the trash (30 days).",
  },
  "conexionEquipo.sync.det.noSeAplicaria": { es: "No se aplicaría", en: "Wouldn't apply" },
  "conexionEquipo.sync.freno": {
    es: "Freno de salidas: el envío pedía sacar a {n} personas de una vez y el tope es {tope}. No se sacó a nadie.",
    en: "Departure brake: the sync asked to remove {n} people at once and the limit is {tope}. Nobody was removed.",
  },
  "conexionEquipo.sync.anteriores": { es: "Envíos anteriores", en: "Earlier syncs" },

  "conexionEquipo.campo.rol": { es: "Rol", en: "Role" },
  "conexionEquipo.campo.nivel": { es: "Nivel", en: "Level" },
  "conexionEquipo.campo.equipo": { es: "Equipo", en: "Team" },
  "conexionEquipo.campo.reporta_a": { es: "Jefe", en: "Manager" },
  "conexionEquipo.campo.hora_entrada": { es: "Entrada", en: "Start time" },
  "conexionEquipo.campo.hora_salida": { es: "Salida", en: "End time" },
  "conexionEquipo.campo.papelera": { es: "Salida del equipo", en: "Leaving the team" },
  "conexionEquipo.campo.persona": { es: "Persona", en: "Person" },
  "conexionEquipo.campo.correo": { es: "Correo", en: "Email" },
  "conexionEquipo.campo.nombre": { es: "Nombre", en: "Name" },
  "conexionEquipo.campo.activo": { es: "Activo", en: "Active" },

  // Por qué no se aplicó algo: los códigos de la edge (equipo-logica.ts) y de la base
  // (api_equipo_aplicar), cada uno en una frase.
  "conexionEquipo.motivo.no_es_un_objeto": { es: "Esa persona no vino con el formato correcto.", en: "That person wasn't sent in the right format." },
  "conexionEquipo.motivo.campo_desconocido": { es: "Trae un campo que Maven no conoce.", en: "It has a field Maven doesn't know." },
  "conexionEquipo.motivo.correo_invalido": { es: "El correo no tiene forma de correo.", en: "The email doesn't look like an email." },
  "conexionEquipo.motivo.correo_repetido": {
    es: "El mismo correo vino más de una vez: no se tocó a nadie con ese correo.",
    en: "The same email came more than once: nobody with that email was touched.",
  },
  "conexionEquipo.motivo.tipo_invalido": { es: "El valor no es del tipo esperado.", en: "The value isn't the expected type." },
  "conexionEquipo.motivo.texto_muy_largo": { es: "El texto es demasiado largo.", en: "The text is too long." },
  "conexionEquipo.motivo.nivel_invalido": { es: "El nivel no es manager, supervisor ni agente.", en: "The level isn't `manager`, `supervisor` or `agente`." },
  "conexionEquipo.motivo.nivel_de_admin": {
    es: "Nadie sube a admin ni a dueño desde tu plataforma: eso se hace a mano en Maven.",
    en: "Nobody is promoted to admin or owner from your platform: that's done by hand in Maven.",
  },
  "conexionEquipo.motivo.rol_de_admin": {
    es: "Ese rol es de administración: se asigna a mano en Maven.",
    en: "That's an admin role: it's assigned by hand in Maven.",
  },
  "conexionEquipo.motivo.hora_invalida": { es: "La hora no es válida (en 24 horas, como 08:00).", en: "The time isn't valid (24-hour time, like 08:00)." },
  "conexionEquipo.motivo.jefe_no_esta_en_maven": { es: "Su jefe no tiene cuenta en Maven.", en: "Their manager has no Maven account." },
  "conexionEquipo.motivo.jefe_es_la_misma_persona": { es: "Una persona no puede ser su propio jefe.", en: "A person can't be their own manager." },
  "conexionEquipo.motivo.jefe_en_papelera": { es: "Su jefe está en la papelera de Maven.", en: "Their manager is in Maven's trash." },
  "conexionEquipo.motivo.freno_de_bajas": {
    es: "No salió: el envío pedía más salidas de las permitidas de una vez.",
    en: "Not removed: the sync asked for more departures than allowed at once.",
  },
  "conexionEquipo.motivo.user_id_invalido": { es: "Maven no reconoció a esa persona.", en: "Maven didn't recognize that person." },
  "conexionEquipo.motivo.no_es_de_la_agencia": { es: "Esa persona no es de tu agencia.", en: "That person isn't part of your agency." },
  "conexionEquipo.motivo.protegido": {
    es: "Es admin o dueño: no se toca desde tu plataforma.",
    en: "They're an admin or owner: your platform can't change them.",
  },
  "conexionEquipo.motivo.en_papelera": {
    es: "Está en la papelera de Maven; se restaura a mano.",
    en: "They're in Maven's trash; restore them by hand.",
  },
  "conexionEquipo.motivo.valor_invalido": { es: "El valor no es válido.", en: "The value isn't valid." },
  "conexionEquipo.motivo.rol_desconocido": { es: "Maven no tiene ese rol.", en: "Maven doesn't have that role." },
  "conexionEquipo.motivo.nivel_no_permitido": {
    es: "Ese nivel no se puede poner desde tu plataforma.",
    en: "That level can't be set from your platform.",
  },
  "conexionEquipo.motivo.equipo_invalido": {
    es: "El nombre del equipo no es válido (de 1 a 80 letras).",
    en: "The team name isn't valid (1 to 80 characters).",
  },
  "conexionEquipo.motivo.jefe_invalido": { es: "No se reconoció a su jefe.", en: "Their manager wasn't recognized." },
  "conexionEquipo.motivo.jefe_no_esta_en_la_agencia": { es: "Su jefe no está en tu agencia.", en: "Their manager isn't part of your agency." },
  "conexionEquipo.motivo.error_de_base": {
    es: "Maven no lo pudo guardar. Se vuelve a intentar en el próximo envío.",
    en: "Maven couldn't save it. It will try again on the next sync.",
  },
  "conexionEquipo.motivo.otro": { es: "Maven no lo aceptó ({motivo}).", en: "Maven didn't accept it ({motivo})." },

  // ── 4. Roles nuevos sin permisos ──
  "conexionEquipo.roles.titulo": { es: "Roles nuevos sin permisos", en: "New roles with no permissions" },
  "conexionEquipo.roles.para": {
    es: "Roles que llegaron de tu plataforma. Hasta que marques qué ve cada uno, quien tenga ese rol no ve nada en Maven.",
    en: "Roles that came from your platform. Until you mark what each one sees, anyone with that role sees nothing in Maven.",
  },
  "conexionEquipo.roles.ninguno": {
    es: "Todos los roles tienen sus permisos marcados.",
    en: "Every role has its permissions marked.",
  },
  "conexionEquipo.roles.llego": { es: "Llegó el {fecha} · todavía no ve nada", en: "Arrived on {fecha} · sees nothing yet" },
  "conexionEquipo.roles.marcar": { es: "Marcar qué ve", en: "Mark what it sees" },

  // ── 5. Personas pendientes ──
  "conexionEquipo.pend.titulo": { es: "Personas pendientes", en: "Pending people" },
  "conexionEquipo.pend.para": {
    es: "Vinieron de tu plataforma y no tienen cuenta en Maven. Apruébalas para crearles la cuenta, o descártalas.",
    en: "They came from your platform and have no Maven account. Approve them to create their account, or discard them.",
  },
  "conexionEquipo.pend.ninguna": { es: "No hay nadie esperando.", en: "Nobody is waiting." },
  "conexionEquipo.pend.aprobar": { es: "Aprobar", en: "Approve" },
  "conexionEquipo.pend.descartar": { es: "Descartar", en: "Discard" },
  "conexionEquipo.pend.acceso": {
    es: "Al aprobar, Maven crea la cuenta y manda el acceso a {correo}.",
    en: "When you approve, Maven creates the account and sends the sign-in details to {correo}.",
  },
  "conexionEquipo.pend.veces": { es: "Llegó {n} veces · la última, {fecha}", en: "Arrived {n} times · the last one, {fecha}" },
  "conexionEquipo.pend.unaVez": { es: "Llegó el {fecha}", en: "Arrived on {fecha}" },
  "conexionEquipo.pend.rol": { es: "Rol: {v}", en: "Role: {v}" },
  "conexionEquipo.pend.nivel": { es: "Nivel: {v}", en: "Level: {v}" },
  "conexionEquipo.pend.equipo": { es: "Equipo: {v}", en: "Team: {v}" },
  "conexionEquipo.pend.jefe": { es: "Jefe: {v}", en: "Manager: {v}" },
  "conexionEquipo.pend.aprobada": {
    es: "Cuenta creada para {nombre}. El acceso llegó a {correo}.",
    en: "Account created for {nombre}. The sign-in details went to {correo}.",
  },
  "conexionEquipo.pend.aprobadaSinCorreo": {
    es: "Cuenta creada para {nombre}, pero el correo de acceso no salió. En Usuarios, usa «Restablecer contraseña» para mandárselo.",
    en: "Account created for {nombre}, but the sign-in email didn't go out. In Users, use “Reset password” to send it.",
  },
  "conexionEquipo.pend.equipoDespues": {
    es: "Su equipo y su jefe se ponen con el próximo envío de tu plataforma.",
    en: "Their team and manager are set with your platform's next sync.",
  },
  "conexionEquipo.pend.creadaSinMarcar": {
    es: "La cuenta de {nombre} se creó, pero no se pudo marcar como aprobada. Toca Reintentar: no se crea otra.",
    en: "{nombre}'s account was created, but it couldn't be marked as approved. Tap Retry: no second account is created.",
  },
  "conexionEquipo.pend.noSeCreo": {
    es: "No se pudo crear la cuenta de {nombre}: {error}",
    en: "Couldn't create {nombre}'s account: {error}",
  },
  "conexionEquipo.pend.sinId": {
    es: "Maven no devolvió la cuenta nueva.",
    en: "Maven didn't return the new account.",
  },
  "conexionEquipo.pend.descartada": { es: "{nombre} quedó descartada.", en: "{nombre} was discarded." },
  "conexionEquipo.pend.noSeDescarto": {
    es: "No se pudo descartar a {nombre}: {error}",
    en: "Couldn't discard {nombre}: {error}",
  },

  // ── 6. Avisos (webhook) ──
  "conexionEquipo.avisos.titulo": { es: "Avisos a tu plataforma (webhook)", en: "Notices to your platform (webhook)" },
  "conexionEquipo.avisos.para": {
    es: "Maven le avisa a tu plataforma cuando algo cambia en el equipo, sin que tenga que preguntar.",
    en: "Maven tells your platform when something changes in the team, without it having to ask.",
  },
  "conexionEquipo.avisos.primeroLlave": {
    es: "Primero crea la llave (paso 1): el aviso se registra en esa llave.",
    en: "Create the key first (step 1): the notice is registered on that key.",
  },
  "conexionEquipo.avisos.noSe": {
    es: "No se pudo saber si la llave tiene aviso.",
    en: "Couldn't tell whether the key has a notice set up.",
  },
  "conexionEquipo.avisos.quien": {
    es: "Lo registra la persona de la llave; cualquier admin lo puede pausar o borrar.",
    en: "The key's person registers it; any admin can pause or delete it.",
  },
  "conexionEquipo.evento.persona_entro": {
    es: "Alguien entró al equipo (cuenta nueva o recuperada).",
    en: "Someone joined the team (new or restored account).",
  },
  "conexionEquipo.evento.persona_salio": {
    es: "Alguien salió del equipo (fue a la papelera).",
    en: "Someone left the team (moved to the trash).",
  },
  "conexionEquipo.evento.rol_cambio": {
    es: "A alguien le cambiaron el rol.",
    en: "Someone's role changed.",
  },
  // El alta del webhook en una llave del equipo (ApiKeyWebhook): lo que recibe.
  "conexionEquipo.webhook.intro": {
    es: "Maven le avisa a tu servidor cuando alguien entra o sale del equipo, o le cambian el rol (`equipo.persona_entro`, `equipo.persona_salio` y `equipo.rol_cambio`). Cada aviso va firmado: tu servidor lo verifica con el secreto.",
    en: "Maven notifies your server when someone joins or leaves the team, or their role changes (`equipo.persona_entro`, `equipo.persona_salio` and `equipo.rol_cambio`). Every notice is signed: your server checks it with the secret.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
