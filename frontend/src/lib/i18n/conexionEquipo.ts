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
    es: "- `roles` (opcional) va primero y Maven lo procesa antes que a las personas: los roles que no tiene se crean con el mismo nombre y sin permisos, y el dueño marca qué ve cada uno. En ensayo no se crea nada, y quien tenga un rol por crear sale en `roles_desconocidos`.\n- `correo`, `nombre` y `activo` van siempre; lo demás es opcional. Un campo que no viene no se toca; uno que viene en `null` se vacía.\n- `nivel`: `manager`, `supervisor` o `agente`. Nadie sube a admin ni a dueño por aquí.\n- `reporta_a`: el correo de su jefe.\n- `hora_entrada` y `hora_salida`: en 24 horas, como `08:00`.\n- `horario_semana` (opcional): el turno de cada día, con las claves `lun`, `mar`, `mie`, `jue`, `vie`, `sab` y `dom`, cada una `[\"08:00\", \"16:00\"]` o `null`. Un día en `null` o que no viene es descanso (ese día Maven no le exige estar en Cowork), y un turno puede cruzar la medianoche (`[\"22:00\", \"06:00\"]`). `null` en todo el campo quita el horario por semana y vuelve a valer `hora_entrada`/`hora_salida`.\n- `activo: false` manda a la persona a la papelera de Maven (30 días, se puede recuperar). Faltar en la lista no es irse: a quien no viene no se le toca.\n- Quien no tiene cuenta en Maven queda pendiente hasta que el dueño o un admin la apruebe.\n- Con `ensayo: true`, Maven contesta qué cambiaría sin tocar nada. Mientras el dueño no active «Aplicar», todo es ensayo.",
    en: "- `roles` (optional) goes first and Maven handles it before the people: the roles it doesn't have are created with the same name and no permissions, and the owner marks what each one sees. In a dry run nothing is created, and anyone with a role still to be created shows up under `roles_desconocidos`.\n- `correo`, `nombre` and `activo` are always sent; the rest is optional. A field that isn't sent is left alone; one sent as `null` is cleared.\n- `nivel`: `manager`, `supervisor` or `agente`. Nobody is promoted to admin or owner this way.\n- `reporta_a`: their manager's email.\n- `hora_entrada` and `hora_salida`: 24-hour time, like `08:00`.\n- `horario_semana` (optional): the shift for each day, with the keys `lun`, `mar`, `mie`, `jue`, `vie`, `sab` and `dom`, each one `[\"08:00\", \"16:00\"]` or `null`. A day that is `null` or missing is a day off (Maven doesn't require Cowork that day), and a shift can cross midnight (`[\"22:00\", \"06:00\"]`). `null` for the whole field removes the weekly schedule and `hora_entrada`/`hora_salida` apply again.\n- `activo: false` moves the person to Maven's trash (30 days, can be restored). Missing from the list doesn't mean leaving: whoever isn't sent is left alone.\n- Whoever has no Maven account stays pending until the owner or an admin approves them.\n- With `ensayo: true`, Maven answers what would change without touching anything. Until the owner turns on “Apply”, everything is a dry run.",
  },
  "conexionEquipo.instr.sync.respuesta": {
    es: "La respuesta (200) dice qué cambió (o cambiaría), quién quedó pendiente, qué roles faltan y qué se rechazó y por qué:",
    en: "The response (200) says what changed (or would change), who is pending, which roles are missing and what was rejected and why:",
  },
  "conexionEquipo.instr.sync.respuestaNotas": {
    es: "- `roles`: los que se crearon (en ensayo, los que se crearían) en `creados`, los que ya estaban y los rechazados con su `motivo` (`rol_de_admin`, `nombre_muy_largo`, `nombre_invalido`, `rol_inactivo`). `null` si el envío no trajo `roles`.\n- `pendientes`: cuántas personas sin cuenta quedaron pendientes (`registradas`, `actualizadas`) y cuáles se ignoraron (`ignoradas`, con `motivo` `correo_invalido` o `ya_tiene_cuenta`). `null` en ensayo o si no hubo nadie sin cuenta; en ensayo, `pendientes_de_crear` igual dice quiénes quedarían pendientes.\n- `cambios[].aplicado`: se hizo en este envío; `se_aplicaria`: la base lo validó.",
    en: "- `roles`: the ones created (in a dry run, the ones that would be) under `creados`, the ones that already existed and the rejected ones with their `motivo` (`rol_de_admin`, `nombre_muy_largo`, `nombre_invalido`, `rol_inactivo`). `null` if the sync had no `roles`.\n- `pendientes`: how many people with no account were left pending (`registradas`, `actualizadas`) and which were skipped (`ignoradas`, with `motivo` `correo_invalido` or `ya_tiene_cuenta`). `null` in a dry run or if everybody had an account; in a dry run, `pendientes_de_crear` still says who would be pending.\n- `cambios[].aplicado`: done in this sync; `se_aplicaria`: the database validated it.",
  },
  "conexionEquipo.instr.leer.titulo": { es: "## 2. Leer de Maven", en: "## 2. Reading from Maven" },
  "conexionEquipo.instr.leer.equipo": {
    es: "`GET /equipo`: las personas y los roles como están en Maven (cada rol con su `origen` y si ya tiene permisos; cada persona con `activo` y el correo de su jefe).",
    en: "`GET /equipo`: people and roles as they are in Maven (each role with its `origen` and whether it already has permissions; each person with `activo` and their manager's email).",
  },
  "conexionEquipo.instr.leer.rango": {
    es: "`desde` y `hasta` van como `YYYY-MM-DD` (días de Bogotá). Sin fechas, los últimos 7 días hasta hoy; con una sola, la otra se completa a 7 días. Hasta 93 días por consulta (si no, `400 invalid_range`).",
    en: "`desde` and `hasta` go as `YYYY-MM-DD` (Bogota days). With no dates, the last 7 days up to today; with only one, the other is filled in to make 7 days. Up to 93 days per request (otherwise `400 invalid_range`).",
  },
  "conexionEquipo.instr.leer.horas": {
    es: "`GET /equipo/horas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: horas y asistencia de Cowork por persona y día. Cada día trae `fecha`, `minutos_trabajados` (lo que se paga), `minutos_en_meet`, `minutos_pausa`, `minutos_en_sala`, `sesiones`, `primera_entrada`, `ultima_salida`, `llego_tarde`, `minutos_tarde`, `hora_asignada` y `turno`. Un día que no aparece es un día sin conexión a Cowork.",
    en: "`GET /equipo/horas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: Cowork hours and attendance per person and day. Each day has `fecha`, `minutos_trabajados` (what gets paid), `minutos_en_meet`, `minutos_pausa`, `minutos_en_sala`, `sesiones`, `primera_entrada`, `ultima_salida`, `llego_tarde`, `minutos_tarde`, `hora_asignada` and `turno`. A missing day is a day with no Cowork connection.",
  },
  "conexionEquipo.instr.leer.notas": {
    es: "`GET /equipo/notas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: la nota de Argos (0 a 100) por persona y día: `fecha`, `nota`, `desglose` (`pantalla`, `camara`, `foco`), `maximos` y `crudo` (los segundos y las capturas de donde sale).",
    en: "`GET /equipo/notas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: the Argos score (0 to 100) per person and day: `fecha`, `nota`, `desglose` (`pantalla`, `camara`, `foco`), `maximos` and `crudo` (the seconds and captures it comes from).",
  },
  "conexionEquipo.instr.leer.argos": {
    es: "`GET /equipo/argos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: lo que Argos vio en cada turno, por persona (`vigilado`, `expediente_url`) y por turno (un día sin turno no aparece): `fecha`, `turno` (`inicio`, `fin`), `en_curso`, `entro`, `sin_pantalla_min` contra `permitido_min`, `fuera_de_cowork_veces`, `fuera_de_cowork_min`, `llamados_fuera`, `reportado_fuera`, `no_entro_llamados`, `no_entro_reportado`, `reportes_en_sala` (`camara_apagada`, `fuera_cuadro`, `sin_pantalla`), `faltas` y `fotos`.",
    en: "`GET /equipo/argos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`: what Argos saw on each shift, per person (`vigilado`, `expediente_url`) and per shift (a day with no shift doesn't show up): `fecha`, `turno` (`inicio`, `fin`), `en_curso`, `entro`, `sin_pantalla_min` against `permitido_min`, `fuera_de_cowork_veces`, `fuera_de_cowork_min`, `llamados_fuera`, `reportado_fuera`, `no_entro_llamados`, `no_entro_reportado`, `reportes_en_sala` (`camara_apagada`, `fuera_cuadro`, `sin_pantalla`), `faltas` and `fotos`.",
  },
  "conexionEquipo.instr.avisos.titulo": { es: "## 3. Avisos de Maven (webhook)", en: "## 3. Notices from Maven (webhook)" },
  "conexionEquipo.instr.avisos.cuerpo": {
    es: "Registra la dirección de tu servidor en Maven (Ajustes → Conectar tu plataforma → Avisos). Maven avisa con un POST firmado (encabezados `webhook-id`, `webhook-timestamp` y `webhook-signature`; el secreto se ve una sola vez, al registrar). Los avisos:",
    en: "Register your server's address in Maven (Settings → Connect your platform → Notices). Maven notifies you with a signed POST (headers `webhook-id`, `webhook-timestamp` and `webhook-signature`; the secret is shown only once, when you register). The notices:",
  },
  "conexionEquipo.instr.avisos.reglas": {
    es: "Cada aviso trae `id`, `type`, `created_at`, `agency_id` y `data` (`correo`, `nombre`, `rol`, `via`: `api` si lo hizo tu plataforma, `maven` si se hizo en la app).\n- Verifica la firma con la librería `standardwebhooks` y el secreto `whsec_…`; rechaza lo que no verifica.\n- Contesta 2xx en menos de 10 segundos y procesa después. Usa `webhook-id` para no procesar dos veces el mismo aviso: un reintento trae el mismo id.\n- Si no contesta 2xx, Maven reintenta (30 s, 2 min, 10 min, 30 min…). 72 horas fallando lo detiene, y un 410 lo detiene en el acto.",
    en: "Every notice has `id`, `type`, `created_at`, `agency_id` and `data` (`correo`, `nombre`, `rol`, `via`: `api` if your platform did it, `maven` if it was done in the app).\n- Check the signature with the `standardwebhooks` library and the `whsec_…` secret; reject anything that doesn't verify.\n- Answer 2xx in under 10 seconds and process afterwards. Use `webhook-id` to avoid handling the same notice twice: a retry carries the same id.\n- Without a 2xx, Maven retries (30 s, 2 min, 10 min, 30 min…). Failing for 72 hours stops it, and a 410 stops it right away.",
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
  "conexionEquipo.campo.horario_semana": { es: "Horario por semana", en: "Weekly schedule" },
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
  "conexionEquipo.motivo.dia_desconocido": {
    es: "El horario por semana trae un día que Maven no conoce (van lun, mar, mie, jue, vie, sab y dom).",
    en: "The weekly schedule has a day Maven doesn't know (use lun, mar, mie, jue, vie, sab and dom).",
  },
  "conexionEquipo.motivo.entrada_igual_salida": {
    es: "Un día del horario por semana entra y sale a la misma hora.",
    en: "A day in the weekly schedule starts and ends at the same time.",
  },
  "conexionEquipo.motivo.horario_invalido": {
    es: "El horario por semana no es válido: no se cambió nada del horario.",
    en: "The weekly schedule isn't valid: nothing in the schedule was changed.",
  },
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
  // De los roles (api_equipo_roles) y de los pendientes (api_equipo_pendientes).
  "conexionEquipo.motivo.nombre_muy_largo": { es: "El nombre del rol es demasiado largo (más de 60 letras).", en: "The role name is too long (over 60 characters)." },
  "conexionEquipo.motivo.nombre_invalido": { es: "El rol vino vacío o sin forma de nombre.", en: "The role came empty or isn't a name." },
  "conexionEquipo.motivo.rol_inactivo": {
    es: "Ese rol existe pero está apagado en Maven; prenderlo lo decide una persona.",
    en: "That role exists but is turned off in Maven; a person decides whether to turn it back on.",
  },
  "conexionEquipo.motivo.ya_tiene_cuenta": { es: "Ya tiene cuenta en Maven: no queda pendiente.", en: "They already have a Maven account: not left pending." },
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
  "conexionEquipo.pend.equipoPuesto": {
    es: "Ya quedó con el equipo y el jefe que mandó tu plataforma.",
    en: "They're already set with the team and manager your platform sent.",
  },
  "conexionEquipo.pend.creadaSinMarcar": {
    es: "La cuenta de {nombre} se creó, pero no se pudo marcar como aprobada ({motivo}). Toca Reintentar: no se crea otra.",
    en: "{nombre}'s account was created, but it couldn't be marked as approved ({motivo}). Tap Retry: no second account is created.",
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
    es: "Lo registran, lo prueban y lo pausan el dueño o un admin de la agencia.",
    en: "The agency owner or an admin registers, tests and pauses it.",
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
  "conexionEquipo.evento.prueba": { es: "La prueba de «Enviar prueba».", en: "The “Send test” notice." },

  // El alta del aviso: qué recibe.
  "conexionEquipo.webhook.intro": {
    es: "Maven le avisa a tu servidor cuando alguien entra o sale del equipo, o le cambian el rol. Cada aviso va firmado: tu servidor lo verifica con el secreto.",
    en: "Maven notifies your server when someone joins or leaves the team, or their role changes. Every notice is signed: your server checks it with the secret.",
  },
  "conexionEquipo.wh.alta.titulo": { es: "Registrar la dirección de tu plataforma", en: "Register your platform's address" },
  "conexionEquipo.wh.alta.url": { es: "Dirección (https)", en: "Address (https)" },
  "conexionEquipo.wh.alta.urlEjemplo": { es: "https://tuplataforma.com/maven/avisos", en: "https://yourplatform.com/maven/notices" },
  "conexionEquipo.wh.alta.urlAyuda": {
    es: "Una dirección pública con https y un dominio (nada de red interna). Maven le manda un POST firmado.",
    en: "A public https address with a domain name (no internal network). Maven sends it a signed POST.",
  },
  "conexionEquipo.wh.alta.urlMala": {
    es: "La dirección tiene que empezar con https:// y tener un dominio.",
    en: "The address must start with https:// and have a domain name.",
  },
  "conexionEquipo.wh.alta.eventos": { es: "Qué avisos quiere recibir", en: "Which notices it wants" },
  "conexionEquipo.wh.alta.sinEventos": { es: "Elige al menos un aviso.", en: "Pick at least one notice." },
  "conexionEquipo.wh.alta.boton": { es: "Registrar", en: "Register" },
  "conexionEquipo.wh.secreto.titulo": { es: "Guarda el secreto de firma", en: "Save the signing secret" },
  "conexionEquipo.wh.secreto.cuerpo": {
    es: "Con él tu plataforma comprueba que cada aviso viene de Maven. Se ve UNA sola vez: cópialo y guárdalo como variable de entorno de tu plataforma, nunca por chat.",
    en: "Your platform uses it to check that every notice comes from Maven. It's shown ONLY once: copy it and keep it in an environment variable on your platform, never over chat.",
  },
  "conexionEquipo.wh.secreto.copiar": { es: "Copiar secreto", en: "Copy secret" },
  "conexionEquipo.wh.secreto.listo": { es: "Ya lo guardé", en: "I saved it" },
  "conexionEquipo.wh.estado.activo": { es: "Activo", en: "Active" },
  "conexionEquipo.wh.estado.pausado": { es: "En pausa", en: "Paused" },
  "conexionEquipo.wh.estado.detenido": { es: "Detenido", en: "Stopped" },
  "conexionEquipo.wh.estado.fallando": { es: "Fallando", en: "Failing" },
  "conexionEquipo.wh.dato.direccion": { es: "Dirección", en: "Address" },
  "conexionEquipo.wh.dato.avisos": { es: "Avisos", en: "Notices" },
  "conexionEquipo.wh.dato.secreto": { es: "Secreto", en: "Secret" },
  "conexionEquipo.wh.dato.ultimaEntrega": { es: "Última entrega", en: "Last delivery" },
  "conexionEquipo.wh.dato.ultimoIntento": { es: "Último intento", en: "Last attempt" },
  "conexionEquipo.wh.dato.porSalir": { es: "Por salir", en: "Queued" },
  "conexionEquipo.wh.dato.fallas": { es: "Fallas seguidas", en: "Failures in a row" },
  "conexionEquipo.wh.dato.fallasDesde": { es: "{n} desde {fecha}", en: "{n} since {fecha}" },
  "conexionEquipo.wh.todavia": { es: "Todavía no", en: "Not yet" },
  "conexionEquipo.wh.probar": { es: "Enviar prueba", en: "Send test" },
  "conexionEquipo.wh.probarEspera": { es: "Espera {s} s", en: "Wait {s} s" },
  "conexionEquipo.wh.pausar": { es: "Pausar", en: "Pause" },
  "conexionEquipo.wh.reanudar": { es: "Reanudar", en: "Resume" },
  "conexionEquipo.wh.borrar": { es: "Borrar", en: "Delete" },
  "conexionEquipo.wh.entregas.ver": { es: "Ver entregas", en: "Show deliveries" },
  "conexionEquipo.wh.entregas.ocultar": { es: "Ocultar entregas", en: "Hide deliveries" },
  "conexionEquipo.wh.entregas.titulo": { es: "Últimas entregas", en: "Latest deliveries" },
  "conexionEquipo.wh.entregas.vacio": { es: "Todavía no salió ningún aviso.", en: "No notice has gone out yet." },
  "conexionEquipo.wh.confirmar.pausar.titulo": { es: "¿Pausar los avisos?", en: "Pause the notices?" },
  "conexionEquipo.wh.confirmar.pausar.cuerpo": {
    es: "Mientras esté en pausa no sale nada, y lo que pase en ese tiempo no se avisa después. Lo que estaba por salir se descarta.",
    en: "While paused nothing goes out, and what happens in the meantime isn't notified later. Whatever was queued is dropped.",
  },
  "conexionEquipo.wh.confirmar.pausar.si": { es: "Sí, pausar", en: "Yes, pause" },
  "conexionEquipo.wh.confirmar.borrar.titulo": { es: "¿Borrar el aviso?", en: "Delete the notice?" },
  "conexionEquipo.wh.confirmar.borrar.cuerpo": {
    es: "Tu plataforma deja de recibir avisos y el secreto deja de servir. Para volver hay que registrarlo de nuevo, con un secreto nuevo.",
    en: "Your platform stops getting notices and the secret stops working. To come back you register it again, with a new secret.",
  },
  "conexionEquipo.wh.confirmar.borrar.si": { es: "Sí, borrar", en: "Yes, delete" },
  "conexionEquipo.wh.ok.registrado": { es: "Aviso registrado.", en: "Notice registered." },
  "conexionEquipo.wh.ok.prueba": {
    es: "Prueba enviada: sale en menos de 30 segundos. Mírala en las entregas.",
    en: "Test sent: it goes out in under 30 seconds. Check it in the deliveries.",
  },
  "conexionEquipo.wh.ok.pausado": { es: "Avisos en pausa.", en: "Notices paused." },
  "conexionEquipo.wh.ok.reanudado": { es: "Avisos activos otra vez.", en: "Notices active again." },
  "conexionEquipo.wh.ok.borrado": { es: "Aviso borrado.", en: "Notice deleted." },
  "conexionEquipo.wh.detenido.receiver_gone": {
    es: "Tu plataforma contestó 410 (ya no existe): Maven dejó de mandar. Revisa la dirección y reanuda.",
    en: "Your platform answered 410 (gone): Maven stopped sending. Check the address and resume.",
  },
  "conexionEquipo.wh.detenido.receiver_failing": {
    es: "Tu plataforma falló 72 horas seguidas y Maven dejó de mandar. Cuando esté bien, reanuda.",
    en: "Your platform failed for 72 hours straight and Maven stopped sending. Once it's fixed, resume.",
  },
  "conexionEquipo.wh.detenido.key_revoked": { es: "La llave fue revocada. Crea una llave nueva y registra el aviso ahí.", en: "The key was revoked. Create a new key and register the notice there." },
  "conexionEquipo.wh.detenido.key_expired": { es: "La llave venció. Crea una llave nueva y registra el aviso ahí.", en: "The key expired. Create a new key and register the notice there." },
  "conexionEquipo.wh.detenido.scope_removed": {
    es: "La llave ya no tiene el permiso `equipo:write`. Crea una llave nueva y registra el aviso ahí.",
    en: "The key no longer has the `equipo:write` permission. Create a new key and register the notice there.",
  },
  "conexionEquipo.wh.detenido.person_inactive": {
    es: "La persona de la llave ya no está activa como admin o dueño. Si vuelve, se puede reanudar.",
    en: "The key's person is no longer active as admin or owner. If they come back, it can be resumed.",
  },
  "conexionEquipo.wh.detenido.config_error": {
    es: "La dirección apunta a un lugar no permitido (de Maven o de red interna). Bórralo y registra otra.",
    en: "The address points somewhere not allowed (Maven's own or an internal network). Delete it and register another one.",
  },
  "conexionEquipo.wh.detenido.otro": { es: "Maven dejó de mandar avisos.", en: "Maven stopped sending notices." },
  "conexionEquipo.wh.entrega.entregada": { es: "Entregada ({codigo})", en: "Delivered ({codigo})" },
  "conexionEquipo.wh.entrega.esperando": { es: "Por salir", en: "Queued" },
  "conexionEquipo.wh.entrega.reintentando": { es: "Reintentando ({n} intentos)", en: "Retrying ({n} attempts)" },
  "conexionEquipo.wh.entrega.descartada": { es: "Descartada", en: "Dropped" },
  "conexionEquipo.wh.descarte.receiver_gone": { es: "Descartada: tu plataforma contestó 410", en: "Dropped: your platform answered 410" },
  "conexionEquipo.wh.descarte.receiver_failing": { es: "Descartada: 72 horas fallando", en: "Dropped: 72 hours failing" },
  "conexionEquipo.wh.descarte.endpoint_paused": { es: "Descartada: el aviso estaba en pausa", en: "Dropped: the notice was paused" },
  "conexionEquipo.wh.descarte.endpoint_disabled": { es: "Descartada: el aviso estaba detenido", en: "Dropped: the notice was stopped" },
  "conexionEquipo.wh.descarte.test_failed": { es: "La prueba no llegó", en: "The test didn't arrive" },

  // Los errores de las RPC (el código va al principio del mensaje de la base).
  "conexionEquipo.err.sin_permiso": { es: "Solo el dueño o un admin de la agencia puede hacer esto.", en: "Only the agency owner or an admin can do this." },
  "conexionEquipo.err.llave_no_existe": { es: "Esa llave no existe en tu agencia.", en: "That key doesn't exist in your agency." },
  "conexionEquipo.err.llave_no_vigente": { es: "La llave ya no sirve (revocada o vencida). Crea otra.", en: "The key no longer works (revoked or expired). Create another one." },
  "conexionEquipo.err.llave_sin_equipo": { es: "La llave no tiene el permiso `equipo:write`.", en: "The key doesn't have the `equipo:write` permission." },
  "conexionEquipo.err.eventos_invalidos": { es: "Elige avisos de la lista: entrar, salir o cambio de rol.", en: "Pick notices from the list: joining, leaving or role change." },
  "conexionEquipo.err.url_invalida": {
    es: "Esa dirección no sirve: tiene que ser https, con un dominio público (puerto 443) y no de Maven ni de red interna.",
    en: "That address won't work: it must be https, with a public domain (port 443), and not Maven's own or an internal network.",
  },
  "conexionEquipo.err.ya_tiene_webhook": { es: "Esta llave ya tiene un aviso registrado.", en: "This key already has a notice registered." },
  "conexionEquipo.err.webhook_no_existe": { es: "Ese aviso ya no existe (quizás otra persona lo borró).", en: "That notice no longer exists (maybe someone else deleted it)." },
  "conexionEquipo.err.accion_invalida": { es: "Esa acción no existe.", en: "That action doesn't exist." },
  "conexionEquipo.err.webhook_no_activo": { es: "Reanúdalo antes de mandar una prueba.", en: "Resume it before sending a test." },
  "conexionEquipo.err.prueba_muy_seguida": { es: "Espera unos segundos entre pruebas.", en: "Wait a few seconds between tests." },
  "conexionEquipo.err.pendiente_no_existe": { es: "Esa persona ya no está entre los pendientes de tu agencia.", en: "That person is no longer among your agency's pending people." },
  "conexionEquipo.err.ya_resuelta": { es: "Otra persona ya la aprobó o la descartó.", en: "Someone else already approved or discarded them." },
  "conexionEquipo.err.falta_user_id": { es: "Falta la cuenta nueva para poder aprobar.", en: "The new account is missing, so it can't be approved." },
  "conexionEquipo.err.cuenta_no_coincide": {
    es: "La cuenta creada no es de tu agencia o no tiene el correo del pendiente.",
    en: "The created account isn't in your agency or doesn't have the pending person's email.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
