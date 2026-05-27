import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

// whatsapp-agent — el agente IA que responde preguntas en el grupo,
// hace tracking de casos, genera reportes y puede tomar acciones en
// Maven cuando se lo piden.
//
// Trigger:
//   - whatsapp-ingest invoca esta function cuando detecta @maven/@bot
//     en el mensaje (o el bot está configurado como always-listening).
//   - El panel admin puede invocarla manualmente ("preguntale al bot").
//   - Crons pueden pedirle un daily/weekly report.
//
// Loop: usa tool_use de Anthropic. Le damos tools para:
//   - search_messages: buscar en historial del grupo
//   - search_maven_leads: encontrar contactos en leadgen_contactos
//   - get_lead_details: detalle completo de un lead
//   - list_commitments: ver compromisos abiertos
//   - get_member_stats: performance de un closer/llg
//   - add_note_to_lead: escribir en Maven
//   - reply_to_group: mandar la respuesta al grupo
//   - resolve_commitment: cerrar un compromiso manualmente
//   - snooze_commitment: postergarlo
//
// Hard caps: max 8 iteraciones del loop, max 30s wall time, max 4000 output
// tokens. Si el modelo no llama reply_to_group al final, lo forzamos a que
// resuma su última respuesta como un mensaje.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
// Modelo según contexto:
//   - mention / audio_mention / image_mention / manual (panel admin) → Sonnet 4.6
//     Necesita razonamiento profundo cuando alguien CITÓ al bot.
//   - auto (modo always-listening) → Haiku 4.5
//     Solo decide "callar vs llamar tool". Haiku es 5× más barato y alcanza.
//   - report_kind → Sonnet (síntesis larga + multi-tool)
const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5";
function pickModel(invokedBy: string | undefined, hasReportKind: boolean): string {
  if (hasReportKind) return SONNET_MODEL;
  return invokedBy === "auto" ? HAIKU_MODEL : SONNET_MODEL;
}
const MAX_ITERATIONS = 8;
const MAX_WALL_MS = 30_000;

const SYSTEM_PROMPT = `Sos Maven Asistente, un asistente IA que vive en grupos de WhatsApp de equipos de agencias de OnlyFans (closers, LLGs, owners). Tu trabajo es:

1. RESPONDER preguntas del equipo sobre leads, casos, performance, conversaciones pasadas
2. RECORDARLES compromisos pendientes ("¿se hizo X?")
3. AYUDAR a tomar acciones concretas en Maven CRM (agregar notas, marcar leads, etc)
4. GENERAR reportes cuando se lo pidan

Estilo:
- Hablás en español argentino, casual pero profesional
- Sos breve y directo. Nada de respuestas largas tipo essay
- Usás bullets cuando la info lo amerita
- Si necesitás datos, llamás las tools — no inventes números
- Si una pregunta no la podés responder con tus tools, decílo y proponé una alternativa

Reglas:
- Antes de tomar una acción que ESCRIBE (add_note_to_lead, resolve_commitment), confirmá con el usuario o asegurate de que la pidió explícito
- Solo respondé en el grupo via reply_to_group al FINAL del razonamiento, una sola vez
- Si necesitás info que no tenés, primero usá search_*/get_* tools, después respondé
- Si te preguntan algo de moderación o que viola privacidad, declinás amablemente
- Si te preguntan por horarios del equipo ("¿a qué hora empezamos?", "¿quién trabaja hoy?", "¿hasta qué hora estás?"), usá get_team_schedule. Los horarios están en zona horaria de Bogotá (UTC-5). NO inventes horarios — usá siempre el field "effective_schedule" que ya combina horario base + descansos anunciados. Si effective_schedule trae {status: "day_off" | "sick" | "vacation"} ese día no trabaja.

ANUNCIOS DE DESCANSO / AUSENCIAS:
- Cuando alguien anuncia en el grupo que NO va a trabajar un día (descanso mensual, día personal, enfermedad, vacaciones) o que va a llegar tarde / irse temprano, registralo con register_day_off para que el bot sea consciente.
- Patrones típicos: "mañana me tomo el día", "el viernes no entro", "hoy estoy enfermo", "llego a las 11", "salgo temprano hoy a las 4", "el sábado descanso".
- Antes de llamar register_day_off:
  · Resolvé la fecha a YYYY-MM-DD concreto. Hoy en Bogotá es la fecha que aparece en "Hora actual". "Mañana" = hoy + 1. "El viernes" = próximo viernes a partir de hoy. "El sábado" = próximo sábado.
  · Si la fecha es ambigua ("la próxima semana", "más adelante"), pedile confirmación al grupo ANTES de registrar.
  · El display_name es de quien se toma el día — puede ser el que escribió ("yo mañana descanso" → quien escribe) o un tercero ("Daniel mañana no entra" → Daniel).
- Después de registrar, confirmá brevemente en el grupo: "✓ Daniel marcado como día libre el viernes 30/5". No te extiendas.
- Tipos:
  · day_off → día libre personal (descanso random mensual)
  · partial → llega tarde o se va temprano (pasá partial_start_time y/o partial_end_time)
  · sick → enfermedad
  · vacation → vacaciones

DUEÑO DE LA EMPRESA:
- Si el initial user message incluye el marcador "[OWNER_MESSAGE]" significa que el mensaje vino del DUEÑO de la agencia. Cuando le respondas:
  · Sé ULTRA breve. Bullets siempre que se pueda, sin párrafos largos.
  · Datos concretos, números directos, cero relleno. Cero "te cuento que…", "claro!", "por supuesto".
  · Si te pide un resumen de algo, dale 3-5 bullets máx, no explicación corrida.
  · Prioridad de respuesta: si hay backlog de tools por llamar, primero las que dan info para él.
- El tono sigue siendo profesional pero con cero verborragia. El dueño valora su tiempo más que cualquier otra cosa.

RESPONDIENDO "QUÉ PENDIENTES HAY":
- Llamá list_commitments({ status: "pending" }) sin filtro de kind para traer TODO.
- La respuesta viene con field "by_kind" que agrupa por tipo. Mostralo organizado al equipo:
  📅 *Reuniones agendadas* (kind=meeting) — con fecha-hora y target
  📋 *Tareas asignadas* (kind=task) — con quién
  ✅ *Compromisos* (kind=promise) — con quién prometió y deadline
  👁️ *En seguimiento* (kind=tracking) — items con estado evolutivo
  ⏳ *Por chequear* (kind=followup)
- Si una categoría está vacía, OMITILA del output. No mostres "📋 Tareas: ninguna".
- Si TODAS están vacías, no inventes — decí que no hay nada registrado Y sugerí "@maven audita el grupo" para detectar items que se perdieron.

ASISTENTE DE WHATSAPP CON MEMORIA PROPIA:
- Cosas importantes del trabajo (leads, modelos, closers, QAs) viven en Maven CRM.
- PERO hay cosas operativas que NO viven en Maven y aun así el equipo necesita rastrear: cuentas de IG compradas para spam, tareas asignadas a Juan Pachas, items en seguimiento, deadlines internos.
- Estas viven en whatsapp_commitments con item_kind apropiado. Las captura el extractor automáticamente o las podés crear vos via las tools del agent.
- Cuando alguien menciona algo operativo (compra de cuentas, distribución, tareas internas), trackealo aunque no esté en Maven. El bot es la "memoria del grupo".

CUANDO HAY AMBIGÜEDAD — PREGUNTÁ CONTEXTO:

Aplica TANTO cuando recibís un mensaje del grupo (extracción) COMO cuando te están preguntando algo y la respuesta queda pobre por falta de info. Antes de quedarte callado o dar una respuesta inservible, PREGUNTÁ.

CASO A — Ambigüedad al INGESTAR un mensaje del grupo:
- "Compré 4 cuentas nuevas" → ¿para quién? ¿cuándo se entregan?
- "Hay una reunión pendiente" → ¿con quién? ¿cuándo?
- "Daniel tiene un tema con X" → ¿qué tipo de tema?
- "Hablamos con la modelo" → ¿qué modelo (handle)? ¿qué cerraron?

CASO B — Cuando te HACEN UNA PREGUNTA y no encontrás data suficiente:
- Antes de decir "no encuentro nada", DETERMINÁ si una pregunta clarificadora podría destrabar la búsqueda.
- Ejemplos:
  · "@maven cómo va daniela" → no aparece en search_maven_leads ni search_messages →
    "Daniela ¿qué? Tenés más info — handle de IG, teléfono, cuándo la contactamos, qué closer la trabajaba?"
  · "@maven cómo va el caso" → cero contexto →
    "¿Cuál caso? Dame el handle de la modelo o el nombre del closer y lo busco."
  · "@maven cuántas confirmadas tuvimos" → ambiguo en periodo →
    "¿Hoy, esta semana o el mes entero?"
  · "@maven cuándo es la próxima llamada" → varias agendadas →
    "Hay 3 reuniones próximas: @X (mañana 10AM), @Y (mañana 4PM), @Z (jueves). ¿Cuál te interesa?"
  · Múltiples matches en una búsqueda (ej. 2 modelos con nombre parecido) →
    "Encontré dos: @camila_xx (Modelo B, Miguel) y @camila_yy (Modelo A, Julieth). ¿Cuál?"

CASO C — Cuando NO hay forma humana de saberlo (data realmente no existe):
- Decílo claro Y sugerí dónde buscar afuera:
  "No la veo en Maven ni en chats recientes. ¿Estás seguro del nombre? Si la tenés en otro grupo o en un screenshot, mostrame."

REGLAS:
- Pregunta UNA cosa por vez, corto, sin spam (máx 1-2 oraciones).
- Si la respuesta llega después, usala para crear/actualizar el item o reintentar la búsqueda con el nuevo input.
- NO pidas aclaración si la pregunta es respondible con tools — buscá primero, preguntá solo si la búsqueda fue pobre.
- Si el OWNER te pregunta y te falta info, igual respondé lo que puedas + decí qué te falta. Owner valora info accionable más que preguntas perfectas.

REPORTES DE JORNADA:
- Cuando alguien manda un reporte de fin de día con métricas (contactados, respuestas, números, confirmadas, cerradas, etc), llamá register_daily_report.
- Patrones LLG: "Reporte Daniel: Total contactados 70, Respuestas 1, Números 0" / "Numeros contactados 47, Respuestas 4, Numeros obtenidos 4" / "✅Total escritos 49 ✅Respuestas 2 ✅Números obtenidos 3"
- Patrones Closer Supervisor: "*RECHAZADA:* link... *CONFIRMADA:* link... Contactados 12, Respuestas 5, Cerrados 0" / "reuniones confirmadas 2... seguimientos 10... mensajes enviados 5" / "reuniones hoy rechazada: link\\nseguimientos: 30\\nmensajes enviados nuevos contactos: 2\\nRespuestas: 3\\nrechazo 1\\npendiente de Firma 2"
- Si display_name ambiguo, el bot debería intentar inferir del context — si dice "Reporte Daniel" → Daniel; si dice "Gislaine LG" al final → Gislaine; si no está claro, usá el sender_display_name del que escribe.
- report_date = hoy en Bogotá salvo que diga "reporte de ayer" o similar.
- Después de registrar, confirmá breve: "✓ Reporte de [nombre] registrado: [resumen 1 línea de las métricas clave]". No te extiendas.

REPORTE FIN DE TURNO (cuando recibís report_kind="eod_summary"):

Tu misión es producir UN mensaje completo y útil al grupo con el cierre del día. NO hagas ronda de saludos, no preguntes nada — solo investigá y respondé via reply_to_group.

PROCESO (en este orden):
1. Llamá search_messages({query: "reporte", since_days: 1}) para juntar reportes de jornada del grupo de hoy.
2. Llamá search_messages({query: "@", since_days: 1, limit: 50}) para captar mensajes con handles de Instagram (closers anuncian modelos).
3. Llamá get_team_schedule({}) para saber quiénes trabajaron hoy y quiénes están de día libre.
4. Para cada LLG con schedule hoy, llamá get_member_maven_activity({display_name, since_hours: 14}) para tener leadgen_entries_created + closers_contacts_created.
5. Llamá list_commitments({status: "pending"}) y filtrá por due_at ≤ +24h para "Mañana".
6. Si algún closer reportó "CONFIRMADA: @handle" en el día, llamá validate_report_vs_maven({display_name, role_kind: "closer", claimed_confirmadas: N}) para detectar gaps.
7. Llamá reply_to_group con el mensaje final.

FORMATO EXACTO del mensaje (respetá secciones + emojis):

📊 *Cierre del día — <día de la semana> <DD/M>*

*LLGs* (meta: 3 números/día)
  <emoji> <nombre> · <X> números · <detalle del trabajo>
       (Maven coincide ✓ | gap con Maven: <texto>)
  🏖️ <nombre> · día libre  [si aplica]

*Closers* (basado en reportes del grupo)
  <nombre> · <resumen 1 línea>
       Modelos del día:
         · @<handle> (<quality>, <factura si la hay>) → <estado>
         · ...
       <X> cerradas hoy (con o sin llamadas a QA)

*🎯 Por actualizar en Maven*  [solo si hay gaps]
  · <persona> — instrucción concreta de qué hacer en Maven y dónde

*🎯 Estado IG operativo*  [si los LLGs mencionaron cuentas IG en el día]
  · <persona>: <estado de sus cuentas IG>
  · cuentas compradas/testadas/en apelación

*⏳ Mañana*
  · <hora> · <evento> (<responsable>)
  · ...

*🎯 Avances del día*
  · <persona>: <logro concreto>

<emoji_final> <conclusión breve, sin exagerar>

REGLAS DE ESTILO PARA EL EOD:
- Saluda con datos, no con "hola equipo".
- Para LLGs: usá los counts REALES de Maven (no del reporte verbal). Si el reporte verbal y Maven coinciden, decí "(Maven coincide ✓)". Si difieren, decí el gap.
- Para closers: usá lo reportado en WhatsApp (los closers no usan Maven activo todavía). Si reportaron una CONFIRMADA y Maven no la tiene marcada, agregá en "Por actualizar en Maven" la instrucción específica.
- Para "Modelos del día" del closer: sacalos parseando los handles de IG mencionados por ese closer en el día. Pone quality (B, A, etc) si está mencionado.
- "Estado IG operativo": solo si los LLGs hablaron explícito de sus cuentas. Si no, omití toda la sección.
- "Mañana": solo items con due_at en próximas 24h. Si no hay, omití la sección.
- "Avances del día": logros REALES (confirmadas nuevas, metas cumplidas, cierres). Si no hay nada notable, decí "Día sin avances grandes pero con pipeline avanzando" o similar.
- NUNCA mencionar problemas técnicos del bot, ni decir "no tengo info de X". Si te falta data, omití la sección.
- Si el día fue un día libre del equipo entero o muy poca actividad, mandá un mensaje corto: "📊 Día calmado en Marketing/Ventas. Sin reportes de cierre — descanse el equipo."

VALIDACIÓN CONTRA MAVEN (TU TRABAJO PRINCIPAL DE SUPERVISIÓN):

Este es uno de los aportes más valiosos del bot: cuando el equipo reporta métricas en el grupo de WhatsApp, vos chequeás si esa info también está cargada en Maven. Si NO está, **PEDÍ QUE LA ACTUALICEN** — con respeto pero firme, con instrucciones concretas de a dónde ir en Maven.

CUÁNDO validar:
- DESPUÉS de register_daily_report en reportes FINALES del día (cierre de jornada, después de las 18:00 Bogotá).
- Cuando el owner pregunta "cuánto se hizo hoy" o "cómo va X".
- NO valides en reportes parciales del medio del día — espera al final.

CÓMO validar:
- Llamá validate_report_vs_maven con TODOS los claimed_* del reporte y role_kind correcto (llg o closer).
- Si gaps.length === 0 → felicitá si cumplió meta (ver RECONOCIMIENTO DE LOGROS), o solo confirmá recepción si no.
- Si HAY gaps → respondé claro con UNA línea por gap + el update_hint que devuelve la tool:

  LLG ejemplo:
  > Yeison, reportaste 3 números pero en Maven veo 1. **Faltan 2 por cargar** — andá a *LeadGen → Agregar Contactos* y subí los teléfonos faltantes 🙏 (importante para tener trackeado el funnel real).

  Closer ejemplo:
  > Miguel, gran cierre 🎉. Reportaste 1 confirmada (@catalinaofficer) pero en Maven aún no veo el stage actualizado. **Andá a *Closers → @catalinaofficer* y marcala como *Confirmada*** así queda registrada en el pipeline.
  > Julieth, reportaste 1 rechazada hoy pero no la veo marcada en Maven. **Si fue @cotearayaa_ que cancelaste, marcala como *No interesada* en *Closers → @handle*** así el contador del pipeline queda correcto.

TONO:
- Respetuoso, no acusador. "Faltan 2" mejor que "¿por qué no cargaste?"
- Recordá que Maven es la SOURCE OF TRUTH del pipeline. El bot no sirve si la data está incompleta.
- Sé persistente: si el día siguiente alguien reporta lo mismo sin haber actualizado el día anterior, mencionalo: "Yeison, vi que ayer también reportaste 3 y solo había 1 cargado. ¿Querés que revisemos en algún meet?"
- NUNCA cargues data en Maven por ellos (no hay tool para crear leads/contactos). Solo pedís que ellos lo hagan.

CUÁNDO NO ES UN GAP REAL:
- Si reportó MENOS de lo que hay en Maven, eso es bueno (cargaron todo + más). Confirmá sin alarmar: "Daniel, reportaste 8 contactados, Maven tiene 12 — perfecto, todo cargado y un poco más."
- Si el reporte trae 0/0/0 con justificación en el thread (manejo de cuentas, meet, día libre) → NO valides, solo confirmá el reporte con la razón anotada.

ACCIÓN SOBRE LEADS (cuando hay decisión explícita en el grupo):
- Si el OWNER dice "cancelar @handle" / "rechazar X" / "no nos sirve":
  1. lookup_lead_history(handle) primero
  2. Si está → mark_lead_stage(handle, "rechazado" o "Rechazada", reason="Owner canceló: [contexto del thread]")
  3. Confirmá UNA línea: "✓ Marqué @handle como Rechazada en Maven · razón: [resumen]"
- Si un closer dice "CONFIRMADA: @handle" o "cerré con @handle Modelo X":
  1. lookup_lead_history(handle)
  2. Si NO está en stage Confirmada → mark_lead_stage(handle, "Confirmada", reason="Closer reportó cierre: [Modelo X · $monto si está]")
  3. Felicitá al closer Y confirmá la actualización en una sola línea: "🎉 Buen cierre [Nombre]! Marqué @handle como Confirmada en Maven."
- NUNCA marques sin un trigger explícito en el thread. No infieras "talvez la rechazaron".

MODO AUTO-LISTENING (cuando invoked_by="auto"):
- El bot está escuchando el grupo y NO fue mencionado explícitamente. Por defecto el bot debe quedarse CALLADO.
- Solo respondé via reply_to_group si el mensaje cae claramente en uno de estos casos de alto valor:
  · Pregunta de horarios del equipo (a qué hora empieza X, quién trabaja hoy)
  · Anuncio de día libre / parcial / enfermedad / vacaciones → llamá register_day_off Y confirmá brevemente
  · Pregunta directa al equipo que ya pudiste responder con datos de Maven (lead, contacto, status)
  · Reporte de jornada con métricas (contactados/respuestas/números/confirmadas/cerradas) → llamá register_daily_report Y confirmá con resumen 1-línea
  · CIERRE CONFIRMADO de un closer ("CONFIRMADA: @handle Modelo X $monto") → ver "RECONOCIMIENTO DE LOGROS" abajo
  · CUMPLIMIENTO DE META de un LLG (3+ números obtenidos en un día laboral) → felicitar (ver abajo)
  · BAJO RENDIMIENTO sin explicación previa (LLG con 0 escritos sin razón en thread) → pedir contexto (ver abajo)
  · DECISIÓN DEL OWNER que requiere acción ("cancelar X", "rechazar Y", "asignar a Z") → ejecutar (ver abajo)
  · LINK DE INSTAGRAM en mensaje (handle visible) → llamá lookup_lead_history para dar contexto del lead
- Si NO entra en estos casos (saludos, chistes, "ok", "listo", links de meet, etc) → NO llames reply_to_group, simplemente no respondas (terminá el loop sin tool calls).
- Cuando dudes si vale la pena hablar, NO hables. Mejor pasarse de prudente que ser ruidoso.

RECONOCIMIENTO DE LOGROS (achievement detection):
- CUANDO un closer reporta "CONFIRMADA: @handle Modelo X $monto" o "cerré con @handle" o "firmó contrato":
  1. Llamá lookup_lead_history para chequear si ya está en closer_creators
  2. Felicitá al closer en el grupo: "🎉 ¡Buen cierre [Nombre]! @handle Modelo X confirmada · $monto"
  3. Si NO está en closer_creators con stage CONFIRMADA, agregá UNA línea: "Recordá marcarla CONFIRMADA en *Closers → @handle* para que entre al pipeline de Maven."
- CUANDO un LLG cumple su meta diaria (3+ números obtenidos en un día lun-vie, 2+ en sábado) según el reporte de jornada:
  · Felicitá: "🔥 ¡Bien [Nombre]! [N] números hoy, cumpliste meta."
  · Si va por arriba (5+) → enfatizar: "💪 [N] números, sobrecumpliste la meta. Crack."
- CUANDO alguien tiene racha (3+ días consecutivos cumpliendo meta), reconocelo: "[Nombre], 3 días seguidos cumpliendo meta. 👏"
- Tono: corto, genuino, sin exageración. UN mensaje, sin spam de emojis.

BAJO RENDIMIENTO — PEDIR CONTEXTO (no juzgar, indagar):
- CUANDO un LLG reporta 0 escritos / 0 números, O lejos de meta sin haberlo justificado YA en el thread del día:
  1. Antes de preguntar, llamá search_messages({query: "<nombre_llg> cuentas", since_days: 1}) y mirá si hay context (estuvo con cuentas IG, en meet, etc).
  2. Si HAY justificación clara en el thread → registralo SIN molestar: "Reporte [N] registrado. Veo que estuviste con [tema]. ¿Querés que lo anote en el reporte?"
  3. Si NO HAY justificación → pregunta SUAVE: "[Nombre], ví que reportaste 0 escritos hoy. ¿Hubo algún inconveniente con las cuentas o se te complicó algo? Te leo."
- CUANDO un closer reporta 0 cerrados varios días seguidos → preguntá UNA vez al día sobre el blocker.
- NO hagas esto si:
  · La persona ya explicó la razón en el mismo mensaje del reporte
  · Hay un meet/event registrado en el thread que justifica el downtime
  · Es el primer día de la persona en el equipo

DECISIONES DEL OWNER (cuando habla [OWNER_MESSAGE] o quien tiene profiles.is_owner):
- Si el owner dice algo como "cancelar @handle", "rechazar X", "no nos sirve Y", "cancelá esa reunión":
  1. Identificá el target (handle de IG, nombre de modelo, ID de reunión).
  2. Llamá lookup_lead_history(handle) para encontrarla en closer_creators o leadgen_entries.
  3. Llamá add_note_to_lead con texto resumiendo la decisión del owner ("Owner cancelo la propuesta el [fecha]: [razón si la hay]").
  4. Confirmá UNA línea en el grupo: "✓ Anoté en Maven el rechazo de @handle (decisión del owner)."
  5. Si la modelo NO está en Maven, simplemente confirmá la decisión: "✓ Cancelado. No la veo en Maven, no hace falta tocar nada ahí."
- Si el owner asigna tarea a alguien ("Miguel, encargate de X"), eso lo capta el extractor como item_kind=task — no hace falta que el agent haga nada extra.

LINK DE INSTAGRAM (auto-lookup proactivo):
- CUANDO veas un link de IG (https://www.instagram.com/<handle> o instagram.com/<handle>) en cualquier mensaje del grupo, ANTES de hacer cualquier otra cosa:
  1. Extraé el handle del URL.
  2. Llamá lookup_lead_history(handle).
  3. Si overall_status no es "nueva" (o sea, está en Maven en algún lado), trae 1-2 datos clave al grupo: stage actual / quality / si ya fue rechazada antes / si está en pipeline activo. UNA línea, corto.
  4. Si está en "ya_contactada" o "no_interesada" → AVISO claro al grupo ANTES de que el closer la trabaje al pedo.
  5. Si está en "nueva" → silencio (solo recordá llamarla cuando alguien pregunte por ella). NO spamees.

Contexto: el equipo trabaja con cuentas de IG, captan modelos (llamadas "creators") y luego las venden a fans en OF. Los "leads" son contactos de IG que se filtran como potenciales modelos. Los "spammer accounts" son cuentas que mandan DMs masivos para captar. Las "QAs" son revisiones de llamadas de los closers. Los LLGs cargan leads (meta diaria 3 lun-vie, 2 sáb); los Closer Supervisors hacen llamadas QA (sin meta numérica).

PIPELINE END-TO-END DEL EQUIPO (esto es central, mantenelo siempre presente):

  Fase 1 — LLG (Lead Generator):
    a) LLG busca modelos en Instagram.
    b) Cuando contacta una nueva → la carga en *LeadGen → Agregar Lead* (crea row en tabla leadgen_entries).
    c) Puede contactar varias veces a la misma — el sistema admite leads repetidos para mismo handle si ya pasaron 24h del último entry.
    d) Cuando obtiene el TELÉFONO de la modelo → va a *LeadGen → Agregar Contactos* (actualiza leadgen_entries.phone_e164, status pasa a "contactado" / "replied").
    Meta diaria LLG: 3 NÚMEROS obtenidos lun-vie, 2 los sábados. NO es "3 contactos texteados". Si reporta "3 números", validá contra leadgen_entries WHERE lg_user_id=X AND phone_e164 IS NOT NULL AND entry_date=hoy.

  Fase 2 — Closer (toma la posta cuando hay teléfono):
    a) El closer (o un supervisor) se asigna a sí mismo o asigna a otro la modelo desde *Closers → Asignar*. Eso crea row en closer_creators con stage='Asignada'.
    b) Tiene 6 OPORTUNIDADES de contacto, con cadencia fija desde el día de asignación (passed_date):
       · Contacto 1 → día 1
       · Contacto 2 → día 3
       · Contacto 3 → día 5
       · Contacto 4 → día 8
       · Contacto 5 → día 15
       · Contacto 6 → día 29
       Cada intento se registra en closer_contact_history. El sistema le notifica overdue automáticamente.
    c) Si la modelo ACEPTA una llamada oficial → closer marca stage='Confirmada' (confirmed_date queda timestamp).
    d) Si la modelo FIRMA el contrato/acuerdo → stage='Completada'. Eso convierte automáticamente la row en un creator (tabla creators).
    e) Si la modelo dice que no o no responde después de los 6 → stage='No interesada' (no_interesada_date queda timestamp). Después de 3 meses, su lead puede re-aparecer en leadgen para reintentar.

  Fase 3 — Creator activo:
    Una vez stage='Completada' y se crea el creator, la modelo entra al funnel de monetización (Blu, Piclink, Content Protector). De ahí en adelante NO la trabajan más closers; pasa a operaciones.

LO QUE EL BOT DEBE TRACKEAR (siempre):
  - LLGs: cuántos números obtuvieron hoy vs meta. Avisar gaps cuando reporten números no cargados en Maven (validate_report_vs_maven).
  - Closers: cuántas leads con contactos overdue tiene cada closer. Cuántas confirmadas/completadas del día. Si alguien lleva muchos días en stage='Asignada' sin contactos, flag.
  - Cierres: cuando un closer reporta "CONFIRMADA: @handle", felicitar Y mark_lead_stage. Cuando reporta "COMPLETADA" o "firmó", celebrar fuerte (es el holy grail) Y mark_lead_stage('Completada').
  - Rechazos por owner: cuando Alvaro dice "cancelar X" o "no nos sirve Y", mark_lead_stage('No interesada') con add_note de la razón.
  - Leads re-eligible: si en el grupo aparece un handle que tuvo no_interesada_date hace 3+ meses, avisar que se puede reintentar.

EMPRESA + PORTFOLIO:
- KASH es la compañía madre y dueña del CRM. Los LLGs humanos están dedicados a KASH (la principal). El "scouter assist" es la herramienta de scrapeo automático que puede operar para múltiples compañías del portfolio.
- Productos del portfolio que SÍ podemos ofrecer a una modelo:
  · **Blu app** → principal, alta monetización, modelos A+/A con buen potencial OF
  · **piclink.me** → modelos más soft o con perfil de contenido más light (B+/B)
  · **Content Protector** → anti-leaks. No es alternativa: se ofrece COMPLEMENTARIO si la modelo tiene riesgo de filtraciones (ya leakeada, contenido caro, paywall fuerte)
  · **UNLOK, Pagomundo, Exchange, KASH Agency** → otros productos del grupo, ofrecer según contexto
- Productos que NO ofrecer NUNCA: **Trafix**, **Ora Miami** (instrucción explícita del dueño)
- Productos legacy ignorables: "alvaroletshoot" (cuenta vieja, no es producto activo)

CRITERIO DE CALIDAD KASH (lo asigna el LLG/supervisor en leadgen_entries.quality basado en monetización potencial en OF):
- A+ → Excelente. Look + perfil top. Monetización alta esperada. Producto sugerido: Blu.
- A  → Alta. Perfil sólido. Blu.
- B+ → Buena. Pasa pero requiere más trabajo del closer. Piclink o Blu según caso.
- B  → Regular. Más esfuerzo de conversión. Piclink.
- C  → Básica. Difícil monetización. Solo si hay capacidad.

INTELIGENCIA SOBRE LEADS (F2 — usar cuando aparezca un handle de IG en el grupo, sea en captions de imágenes, links sueltos, reportes de cierre, etc):
- ANTES de que el closer llame a una modelo nueva, si ves su @ o link de IG en el grupo, llamá lookup_lead_history(handle). Te dice si ya pasó por la agencia, qué quality le dieron, si la rechazaron, si estuvo en pipeline, si es modelo activa.
  · Si overall_status="active_creator" → AVISÁ: ya es modelo activa, NO recontactar.
  · Si overall_status="no_interesada" → AVISÁ: ya dijo que no antes, revisar rejection_reason. Posiblemente saltear o reformular pitch.
  · Si overall_status="in_pipeline" → AVISÁ: hay un closer ya trabajándola. Coordinar para no duplicar.
  · Si overall_status="ya_contactada" → mencionar historial breve.
  · Si overall_status="kash_lead_known" → traer datos relevantes del LLG (quality, notas).
  · Si overall_status="scouter_known" → la encontró el scouter pero NO está en pipeline del closer todavía. Ver ai_status del scouter para guía, sugerí cargarla.
  · Si overall_status="nueva" (todas las listas vacías) → la modelo NO está en Maven todavía. Decílo CLARO + explicá cómo cargarla (ver abajo).

PROHIBIDO ALUCINAR DATOS DE MAVEN:
- Si la tool lookup_lead_history devuelve overall_status="nueva" o arrays vacíos, NUNCA inventes cosas como "está en pipeline", "quality B", "cargada ayer", "stage Nuevo", etc. Esos datos NO existen.
- En ese caso decí EXPLÍCITAMENTE: "No la veo en Maven todavía".
- Tampoco inferir quality desde el contexto del thread del grupo. Si Miguel dijo "modelo B" en SU mensaje, eso es opinión de Miguel — no es la quality del LLG en Maven. Citá la fuente: "Miguel la categoriza como B" — pero aclará "no está cargada en Maven aún".

CÓMO CARGAR UNA MODELO EN MAVEN (instrucciones para el equipo cuando la modelo no está cargada):
- Decirles literalmente algo como: "@<sender>, @<handle> no está en Maven. Para arrancar el pipeline: andá a *Closers → botón Asignar* → buscá el handle → si no aparece, se crea desde ahí con la quality (A+/A/B+/B/C) y stage inicial. Ahí queda en pipeline y yo la rastreo de ahora en más."
- Si la modelo viene de un reporte de LLG (quality ya asignada en mensaje), recordales que en realidad el LLG primero debería cargarla en *LeadGen → Nueva entrada* para que pase al pipeline. Si ya está en LeadGen, el closer la asigna desde Closers.

ANALYZE_INSTAGRAM_LEAD:
- Llamala SOLO si overall_status="nueva" o "scouter_known" sin data fresca. Te trae followers/AI score del scouter cache, o encola un scrape si no hay cache.
- Si devuelve source="queued" → contale al equipo: "encolé un scrape, en ~1 min tengo followers/AI score reales".

REGLAS DE ESTILO PARA LEAD INTELLIGENCE:
- Sé conciso: "Daniel, larola_a ya estuvo: la rechazó Miguel el 25/5 porque quería ser cantante. Saltala." es mejor que un párrafo.
- Si todas las tools devolvieron datos → presentá hechos, no inferencias.
- Si las tools devolvieron poco/nada → reconocelo y proponé pasos concretos (cargar en Maven, esperar scrape, preguntar al equipo).`;

interface AgentRequest {
  // Modo conversación: el bot responde a un mensaje específico del grupo
  message_id?: string;
  group_id?: string;
  user_question?: string;
  // Modo report: pedirle un resumen daily/weekly
  report_kind?: "daily" | "weekly" | "eod_summary";
  // Override del group_id cuando se invoca desde supervisor-tick sin un message_id.
  group_id?: string;
  // Quien pidió (para auditoría).
  invoked_by?: string;
}

// ----------------------------------------------------------------------------
// Tools — schema en formato Anthropic
// ----------------------------------------------------------------------------
const TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "search_messages",
    description:
      "Busca mensajes en el historial del grupo actual por texto. Devuelve hasta 20 matches con timestamp, sender y body. Usalo para responder '¿qué dijo X sobre Y?' o '¿cuándo se habló de Z?'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "texto a buscar (case insensitive)" },
        since_days: { type: "number", description: "limitar a últimos N días (default 30)" },
        limit: { type: "number", description: "máx resultados (default 20, max 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_maven_leads",
    description:
      "Busca leads en Maven (leadgen_entries) por handle de IG, número de teléfono, ticket, o company. Devuelve hasta 10 matches con id, model_handle, phone, status, quality, notes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "handle, teléfono, ticket o company" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_lead_details",
    description: "Detalle completo de un lead por id (de Maven leadgen_entries).",
    input_schema: {
      type: "object",
      properties: { lead_id: { type: "string", description: "uuid del lead" } },
      required: ["lead_id"],
    },
  },
  {
    name: "list_commitments",
    description:
      "Lista items operativos rastreados del grupo (compromisos, reuniones, tareas, items de tracking, followups). Útil para responder '¿qué pendientes hay?', '¿qué tareas se asignaron?', '¿qué reuniones hay esta semana?'. Si querés TODO lo pendiente, no filtres por item_kind. La respuesta viene agrupada por kind para que puedas mostrar al usuario por categorías (📅 Reuniones, 📋 Tareas, 👁️ En seguimiento, etc).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "overdue", "done", "stale", "cancelled", "all"],
          description: "default 'pending'",
        },
        committed_by_text: { type: "string", description: "filtrar por quien prometió/asignado" },
        days_ahead: { type: "number", description: "items con due_at en los próximos N días" },
        item_kind: {
          type: "string",
          enum: ["promise", "meeting", "task", "tracking", "followup", "all"],
          description: "tipo de item. default 'all' — devuelve todos los kinds agrupados.",
        },
        limit: { type: "number", description: "default 30" },
      },
    },
  },
  {
    name: "get_member_stats",
    description:
      "Stats básicas de un miembro del grupo: cuántos compromisos creó, cuántos cumplió, cuántos vencidos, % de cumplimiento en los últimos N días.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro" },
        since_days: { type: "number", description: "default 30" },
      },
      required: ["display_name"],
    },
  },
  {
    name: "get_member_maven_activity",
    description:
      "Dado el nombre como aparece en el grupo, devuelve la ACTIVIDAD REAL del usuario en Maven en las últimas N horas: leads cargados (si es LLG), contactos creados/asignados (si es closer), creators abiertos/asignados, entradas en historial de contacto, llamadas QA. Usar para responder preguntas tipo '¿Miguel ya cargó los 2 contactos que prometió?' o '¿qué hizo Sofi hoy en Maven?'. Requiere que el wpp_member esté linkeado a un user de Maven via el panel admin — si no está linkeado, devuelve {error:'member_not_linked'} y la respuesta debe sugerir mapear al admin.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro tal como aparece en el grupo (ilike, podés pasar solo el nombre)" },
        since_hours: { type: "number", description: "ventana de tiempo en horas, default 24" },
      },
      required: ["display_name"],
    },
  },
  {
    name: "get_team_schedule",
    description:
      "Devuelve los horarios del equipo (LLGs y Closer Supervisors) para una FECHA específica en zona horaria America/Bogota. Combina el horario base (whatsapp_user_schedules) con los días libres/parciales/enfermedad/vacaciones anunciados (whatsapp_user_time_off). Sin args, retorna el horario de TODOS los miembros linkeados para HOY. Pasá display_name para filtrar a una persona. Pasá target_date (YYYY-MM-DD) para consultar otro día específico — usalo cuando el usuario pregunta por mañana, el viernes, etc. NO inventes horarios — el field `effective_schedule` ya tiene en cuenta si la persona se tomó el día.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "filtrar por nombre de un miembro del grupo (ilike)" },
        target_date: { type: "string", description: "fecha YYYY-MM-DD en Bogotá. Default = hoy." },
      },
    },
  },
  {
    name: "register_day_off",
    description:
      "Registra que un miembro del equipo NO trabajará un día específico (descanso mensual random, día personal, enfermedad, vacaciones, o llega tarde / se va temprano). Llamala cuando alguien anuncia en el grupo cosas como 'mañana me tomo el día', 'el viernes no entro', 'hoy estoy enfermo', 'llego a las 11'. Antes de llamarla, necesitás: (1) el display_name del miembro (puede ser quien escribió, o un tercero si lo anunció por otro), (2) la fecha en YYYY-MM-DD ya resuelta a fecha concreta (NO 'mañana', sino la fecha calculada), (3) tipo (day_off/partial/sick/vacation). Si es partial, también start/end_time. Si la fecha es ambigua, primero confirmá con el usuario en el grupo. Idempotente: re-llamar con el mismo (user, date) actualiza el registro.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro que se toma el día (no necesariamente el que escribió)" },
        off_date: { type: "string", description: "fecha YYYY-MM-DD (zona Bogotá) — ya resuelta, no 'mañana'" },
        off_type: { type: "string", enum: ["day_off", "partial", "sick", "vacation"], description: "tipo de ausencia" },
        partial_start_time: { type: "string", description: "HH:MM, solo para partial — hora real de entrada ese día" },
        partial_end_time: { type: "string", description: "HH:MM, solo para partial — hora real de salida ese día" },
        reason: { type: "string", description: "razón corta (opcional, máx 200 chars)" },
      },
      required: ["display_name", "off_date", "off_type"],
    },
  },
  {
    name: "lookup_lead_history",
    description:
      "Dado un handle de Instagram (sin @, o URL completa), busca el historial completo de esa modelo en Maven: si pasó por LLG (leadgen_entries), si algún closer la trabajó (closer_creators con stage/rejection/no_interesada), si está como modelo activa (creators), historial de contacto (closer_contact_history), y si el scouter la encontró antes (scouter_leads). Usalo ANTES de que el closer la llame para saber: (1) es lead nueva o repetida?, (2) ya la rechazaron por algo?, (3) qué quality le dio el LLG?, (4) qué monetización estimaron?. Devuelve un summary estructurado.",
    input_schema: {
      type: "object",
      properties: {
        instagram_handle: { type: "string", description: "handle de IG sin @ (ej: 'catalinaofficer') o URL completa (la parseamos)" },
      },
      required: ["instagram_handle"],
    },
  },
  {
    name: "analyze_instagram_lead",
    description:
      "Devuelve datos de scraping de una modelo de Instagram desde el cache de scouter_leads (followers, ai_score, ai_status A+/A/B+/B/C, monetization_usd, target_companies sugeridas, look_score, recent_posts). Si el handle no existe en cache, encola un job de scraping fresh al scouter-worker y devuelve 'queued' — el dato estará disponible en ~30s-2min. Usar para enriquecer el contexto cuando un closer va a llamar a una modelo cuyo perfil no conocemos. Solo Instagram (no TikTok/X todavía).",
    input_schema: {
      type: "object",
      properties: {
        instagram_handle: { type: "string", description: "handle de IG sin @ o URL completa" },
        force_refresh: { type: "boolean", description: "si true, encola un job fresh aunque haya cache (uso raro, solo si el cache está stale)" },
      },
      required: ["instagram_handle"],
    },
  },
  {
    name: "register_daily_report",
    description:
      "Registra el reporte de jornada de un miembro del equipo cuando manda métricas en el grupo. Llamala cuando detectes patrones tipo 'Reporte Daniel: contactados 70, respuestas 1, números 0' (LLG) o 'rechazadas 1, confirmadas 1, contactados 12, cerrados 0' (Closer Supervisor). Idempotente: si ya hay un reporte para ese user y fecha, lo actualiza (típicamente el último wins). Después de registrar, confirmá breve en el grupo con un ✓ y un mini-summary.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro (de quien es el reporte)" },
        report_date: { type: "string", description: "fecha YYYY-MM-DD (zona Bogotá) — generalmente HOY si lo manda al final del día" },
        role_kind: { type: "string", enum: ["llg", "closer"], description: "LLG si es reporte de contactos (números), closer si es reporte de calls/closings" },
        contactados: { type: "number", description: "cantidad de contactados (LLG: nuevos perfiles texteados; closer: contactos+seguimientos)" },
        respuestas: { type: "number", description: "respuestas recibidas" },
        numeros_obtenidos: { type: "number", description: "solo LLG: cuántos números nuevos obtuvo" },
        confirmadas: { type: "number", description: "solo closer: reuniones confirmadas" },
        rechazadas: { type: "number", description: "solo closer: rechazadas/descartadas" },
        canceladas: { type: "number", description: "solo closer: canceladas" },
        cerradas: { type: "number", description: "solo closer: cierres formales" },
        seguimientos: { type: "number", description: "solo closer: seguimientos hechos" },
        links: { type: "array", items: { type: "string" }, description: "URLs de IG u otros que aparezcan en el reporte" },
        raw_text: { type: "string", description: "texto crudo del reporte para auditoría" },
      },
      required: ["display_name", "report_date", "role_kind"],
    },
  },
  {
    name: "add_note_to_lead",
    description:
      "Agrega una nota a un lead de Maven. ATENCIÓN: solo usar si el usuario lo pidió explícito.",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        note: { type: "string", description: "texto de la nota, máx 500 chars" },
      },
      required: ["lead_id", "note"],
    },
  },
  {
    name: "resolve_commitment",
    description:
      "Cierra un compromiso manualmente. outcome: done | cancelled. Solo usar si el usuario confirmó.",
    input_schema: {
      type: "object",
      properties: {
        commitment_id: { type: "string" },
        outcome: { type: "string", enum: ["done", "cancelled"] },
        note: { type: "string" },
      },
      required: ["commitment_id", "outcome"],
    },
  },
  {
    name: "snooze_commitment",
    description: "Postpone un compromiso N horas (default 24). El follow-up se reagenda.",
    input_schema: {
      type: "object",
      properties: {
        commitment_id: { type: "string" },
        hours: { type: "number", description: "default 24" },
      },
      required: ["commitment_id"],
    },
  },
  {
    name: "get_closer_pipeline_status",
    description:
      "Devuelve el estado del pipeline de leads asignadas a un closer (o de TODO el equipo si no se pasa closer). Útil para responder '¿cómo va Miguel?', '¿cuántas leads tiene atrasadas Julieth?', '¿qué pipeline tiene el equipo?'. Trae: counts por stage (Asignada, Confirmada, Completada, No interesada), leads con contactos overdue (cadencia 1-3-5-8-15-29 días), y leads stale (asignadas hace >30d sin tocar). NO uses esta tool si solo te preguntan por un lead específico — usá lookup_lead_history para eso.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del closer (opcional, si omitís devuelve total del equipo)" },
      },
    },
  },
  {
    name: "validate_report_vs_maven",
    description:
      "Después de register_daily_report, compará las métricas reportadas contra lo que realmente está cargado en Maven (leadgen_entries para LLGs, closer_creators para closers) para el mismo user + fecha. Devuelve un diff: si el LLG reportó '3 números' pero solo hay 1 cargado en leadgen, o si el closer reportó '1 confirmada' pero no hay closer_creators con stage='Confirmada' hoy, te avisa. Útil para detectar trabajo no registrado y pedirle al equipo que actualice Maven. NO lo llames si solo te pidieron eco del reporte — solo cuando vale la pena validar (reporte final del día, owner pregunta cuánto se hizo).",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro (el del reporte)" },
        report_date: { type: "string", description: "fecha YYYY-MM-DD a chequear (default hoy Bogotá)" },
        role_kind: { type: "string", enum: ["llg", "closer"], description: "si es reporte de LLG (numeros, contactados) o closer (confirmadas, cerradas/completadas)" },
        claimed_numeros: { type: "number", description: "números reportados (LLG)" },
        claimed_contactados: { type: "number", description: "contactados reportados" },
        claimed_respuestas: { type: "number", description: "respuestas reportadas" },
        claimed_confirmadas: { type: "number", description: "confirmadas reportadas (closer)" },
        claimed_cerradas: { type: "number", description: "cerradas/completadas reportadas (closer)" },
      },
      required: ["display_name"],
    },
  },
  {
    name: "mark_lead_stage",
    description:
      "Cambia el status de un lead en Maven (leadgen_entries o closer_creators). Útil cuando el OWNER decide cancelar/rechazar una modelo, o cuando un closer confirma cierre. Busca por handle de IG (lo encuentra en cualquiera de las dos tablas). status válidos en leadgen_entries: 'no_response', 'contactado', 'replied', 'meeting_set', 'interested', 'rechazado'. stage válidos en closer_creators (texto libre, comunes): 'Nuevo', 'Contactado', 'Confirmada', 'Rechazada', 'No interesada'. SOLO usá cuando hay decisión explícita en el grupo — nunca infieras por tu cuenta.",
    input_schema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "handle de IG sin @ (ej. 'catalinaofficer')" },
        new_status: { type: "string", description: "nuevo status/stage" },
        reason: { type: "string", description: "razón de la actualización (queda en notes con timestamp + autor)" },
      },
      required: ["handle", "new_status"],
    },
  },
  {
    name: "reply_to_group",
    description:
      "Manda la respuesta final al grupo de WhatsApp. Llamala UNA SOLA VEZ al final del razonamiento. El cuerpo debe ser corto (idealmente <500 chars), en español argentino, conciso.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string", description: "el mensaje que se manda al grupo" },
      },
      required: ["body"],
    },
  },
];

// ----------------------------------------------------------------------------
// Tool implementations
// ----------------------------------------------------------------------------
type ToolInput = Record<string, unknown>;

// Extrae el handle de IG dado un input que puede ser:
//   - "catalinaofficer"
//   - "@catalinaofficer"
//   - "https://www.instagram.com/catalinaofficer/"
//   - "https://www.instagram.com/catalinaofficer?igsh=xxx"
//   - "instagram.com/catalinaofficer"
// Devuelve el handle limpio (sin @, sin URL) o null si no parsea.
function parseInstagramHandle(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // URL → quedarnos con el path
  const urlMatch = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  // Sino, limpiamos @ y validamos chars permitidos
  const cleaned = s.replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]+$/.test(cleaned)) return null;
  return cleaned;
}

async function executeTool(
  name: string,
  input: ToolInput,
  ctx: { groupId: string; tenantId: string },
): Promise<Record<string, unknown>> {
  const sb = adminClient();

  switch (name) {
    case "search_messages": {
      const query = String(input.query ?? "").trim();
      const sinceDays = Number(input.since_days ?? 30);
      const limit = Math.min(Number(input.limit ?? 20), 50);
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();
      // Buscamos en body Y en transcribed_text — un texto puede aparecer
      // en cualquiera de los dos según si el mensaje era texto o audio.
      // Postgres OR sobre dos ILIKE con escaping correcto del wildcard.
      const safe = query.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await sb
        .from("whatsapp_messages")
        .select("id, sender_display_name, body, transcribed_text, msg_type, sent_at")
        .eq("group_id", ctx.groupId)
        .gte("sent_at", since)
        .or(`body.ilike.%${safe}%,transcribed_text.ilike.%${safe}%`)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      // Devolvemos un texto unificado por mensaje (el que tenga contenido).
      const matches = (data ?? []).map((m) => {
        let text: string | null;
        if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
          const prefix = m.msg_type === "audio" ? "[audio]" : "[imagen]";
          text = `${prefix} ${m.transcribed_text}`;
        } else {
          text = m.body;
        }
        return {
          id: m.id,
          sender: m.sender_display_name,
          sent_at: m.sent_at,
          text,
        };
      });
      return { matches };
    }

    case "search_maven_leads": {
      const q = String(input.query ?? "").trim();
      if (!q) return { error: "empty_query" };
      const { data, error } = await sb
        .from("leadgen_entries")
        .select(
          "id, model_handle, platform, phone_e164, status, quality, ticket_number, company, city, state, notes, created_at",
        )
        .eq("tenant_id", ctx.tenantId)
        .or(
          `model_handle.ilike.%${q}%,phone_e164.ilike.%${q}%,ticket_number.ilike.%${q}%,company.ilike.%${q}%`,
        )
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return { error: error.message };
      return { leads: data ?? [] };
    }

    case "get_lead_details": {
      const id = String(input.lead_id ?? "");
      if (!id) return { error: "missing_lead_id" };
      const { data, error } = await sb
        .from("leadgen_entries")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "not_found" };
      return { lead: data };
    }

    case "list_commitments": {
      const status = String(input.status ?? "pending");
      const itemKind = String(input.item_kind ?? "all");
      const limit = Math.min(Number(input.limit ?? 30), 80);
      let q = sb
        .from("whatsapp_commitments")
        .select(
          "id, subject, target_subject, due_at, status, committed_by_text, followup_count, item_kind, created_at",
        )
        .eq("group_id", ctx.groupId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (status !== "all") q = q.eq("status", status);
      if (itemKind !== "all") q = q.eq("item_kind", itemKind);
      if (input.committed_by_text) {
        q = q.ilike("committed_by_text", `%${input.committed_by_text}%`);
      }
      if (input.days_ahead) {
        const until = new Date(Date.now() + Number(input.days_ahead) * 24 * 3600 * 1000).toISOString();
        q = q.lte("due_at", until);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      const rows = data ?? [];

      // Agrupamos por item_kind para que el agent pueda renderizar por categoría.
      const grouped: Record<string, typeof rows> = {
        promise: [], meeting: [], task: [], tracking: [], followup: [],
      };
      for (const r of rows) {
        const k = r.item_kind ?? "promise";
        if (grouped[k]) grouped[k].push(r);
        else grouped.promise.push(r);
      }
      return {
        total: rows.length,
        commitments: rows, // flat list (compat anterior)
        by_kind: grouped,  // agrupado para mostrar al usuario por categoría
      };
    }

    case "get_member_maven_activity": {
      const displayName = String(input.display_name ?? "").trim();
      const sinceHours = Math.min(Math.max(Number(input.since_hours ?? 24), 1), 24 * 30);
      if (!displayName) return { error: "missing_display_name" };
      const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

      // 1. Buscar el wpp_member por display_name (ilike) en el grupo
      //    actual. Si hay varios matches preferimos el que tenga user_id
      //    seteado (link explícito de un admin). Esto cubre el caso "Mike"
      //    y "Mike (closer)" coexistiendo.
      const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
      const { data: members } = await sb
        .from("whatsapp_members")
        .select("id, display_name, user_id, role")
        .eq("group_id", ctx.groupId)
        .ilike("display_name", `%${safe}%`)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(5);

      if (!members || members.length === 0) {
        return { error: "wpp_member_not_found", display_name: displayName };
      }
      const member = members.find((m) => m.user_id) ?? members[0];
      if (!member.user_id) {
        return {
          error: "member_not_linked",
          hint:
            "El miembro existe en el grupo pero no está linkeado a un user de Maven. Pediles al admin que lo mapeé desde Panel de Control → WhatsApp Bot.",
          member: {
            id: member.id,
            display_name: member.display_name,
            role_in_group: member.role,
          },
        };
      }

      // 2. Profile + roles del user.
      const [{ data: profile }, { data: roles }] = await Promise.all([
        sb.from("profiles").select("id, full_name").eq("id", member.user_id).maybeSingle(),
        sb.from("user_roles").select("role").eq("user_id", member.user_id),
      ]);

      // 3. Count exact por tabla. HEAD request — no traemos rows, solo el
      //    count. RLS pasa porque usamos service_role.
      const head = (q: { count: number | null; error: { message: string } | null }) => q.count ?? 0;
      const [
        leadsAdded,
        contactsCreated,
        contactsAssigned,
        creatorsCreated,
        creatorsAssigned,
        historyLogged,
        qaCalls,
      ] = await Promise.all([
        sb.from("leadgen_entries").select("id", { count: "exact", head: true })
          .eq("lg_user_id", member.user_id).gte("created_at", since).then(head),
        sb.from("closers_contacts").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("closers_contacts").select("id", { count: "exact", head: true })
          .eq("assigned_to", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("assigned_to", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_contact_history").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("qa_calls").select("id", { count: "exact", head: true })
          .eq("closer_id", member.user_id).gte("created_at", since).then(head),
      ]);

      return {
        member: {
          id: member.id,
          display_name: member.display_name,
          role_in_group: member.role,
        },
        maven_user: {
          id: member.user_id,
          full_name: profile?.full_name ?? null,
          roles: (roles ?? []).map((r) => r.role),
        },
        window: {
          since_hours: sinceHours,
          since_iso: since,
        },
        activity: {
          leadgen_entries_created: leadsAdded,
          closers_contacts_created: contactsCreated,
          closers_contacts_assigned: contactsAssigned,
          closer_creators_created: creatorsCreated,
          closer_creators_assigned: creatorsAssigned,
          contact_history_logged: historyLogged,
          qa_calls: qaCalls,
        },
      };
    }

    case "get_member_stats": {
      const displayName = String(input.display_name ?? "").trim();
      const sinceDays = Number(input.since_days ?? 30);
      if (!displayName) return { error: "missing_display_name" };
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();

      const { data: rows } = await sb
        .from("whatsapp_commitments")
        .select("status, due_at")
        .eq("group_id", ctx.groupId)
        .gte("created_at", since)
        .ilike("committed_by_text", `%${displayName}%`);

      const total = rows?.length ?? 0;
      const done = rows?.filter((r) => r.status === "done").length ?? 0;
      const overdue = rows?.filter((r) => r.status === "overdue" || r.status === "stale").length ?? 0;
      const pending = rows?.filter((r) => r.status === "pending").length ?? 0;
      const compliance = total > 0 ? Math.round((done / total) * 100) : null;

      return {
        member: displayName,
        since_days: sinceDays,
        total_commitments: total,
        done,
        overdue,
        pending,
        compliance_pct: compliance,
      };
    }

    case "get_team_schedule": {
      // Resolvemos la fecha objetivo en Bogotá (UTC-5, sin DST).
      const nowUtcMs = Date.now();
      const bogotaTodayIso = new Date(nowUtcMs - 5 * 3600 * 1000).toISOString().slice(0, 10);
      const targetDate = input.target_date && /^\d{4}-\d{2}-\d{2}$/.test(String(input.target_date))
        ? String(input.target_date)
        : bogotaTodayIso;

      // weekday de esa fecha. Construyo Date desde el string para evitar
      // que el browser interprete TZ — uso medio día UTC para ser explícito.
      const targetDateObj = new Date(`${targetDate}T12:00:00Z`);
      const weekday = targetDateObj.getUTCDay(); // 0=domingo
      const displayName = input.display_name ? String(input.display_name).trim() : null;

      // 1. Miembros del grupo linkeados a un user. Filtramos por display si vino.
      let memberQ = sb
        .from("whatsapp_members")
        .select("display_name, user_id, role")
        .eq("group_id", ctx.groupId)
        .not("user_id", "is", null);
      if (displayName) {
        const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
        memberQ = memberQ.ilike("display_name", `%${safe}%`);
      }
      const { data: members } = await memberQ;
      if (!members || members.length === 0) {
        return { error: "no_linked_members", target_date: targetDate, weekday };
      }

      const userIds = members.map((m) => m.user_id).filter(Boolean) as string[];

      // 2. Schedules base para esos users en ese weekday + time_off para esa fecha.
      const [{ data: schedules }, { data: timeOffs }] = await Promise.all([
        sb.from("whatsapp_user_schedules")
          .select("user_id, weekday, start_time, end_time, daily_goal, role_kind")
          .in("user_id", userIds)
          .eq("weekday", weekday),
        sb.from("whatsapp_user_time_off")
          .select("user_id, off_type, partial_start_time, partial_end_time, reason")
          .in("user_id", userIds)
          .eq("off_date", targetDate),
      ]);

      const scheduleByUser = new Map<string, {
        start_time: string;
        end_time: string;
        daily_goal: number | null;
        role_kind: string;
      }>();
      for (const s of schedules ?? []) {
        scheduleByUser.set(s.user_id, {
          start_time: String(s.start_time).slice(0, 5),
          end_time: String(s.end_time).slice(0, 5),
          daily_goal: s.daily_goal,
          role_kind: s.role_kind,
        });
      }

      const timeOffByUser = new Map<string, {
        off_type: string;
        partial_start_time: string | null;
        partial_end_time: string | null;
        reason: string | null;
      }>();
      for (const t of timeOffs ?? []) {
        timeOffByUser.set(t.user_id, {
          off_type: t.off_type,
          partial_start_time: t.partial_start_time ? String(t.partial_start_time).slice(0, 5) : null,
          partial_end_time: t.partial_end_time ? String(t.partial_end_time).slice(0, 5) : null,
          reason: t.reason,
        });
      }

      const dayNames = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
      const rows = members.map((m) => {
        const base = scheduleByUser.get(m.user_id!) ?? null;
        const off = timeOffByUser.get(m.user_id!) ?? null;

        // effective_schedule: lo que aplica HOY combinando base + off.
        let effective: typeof base | { status: string; reason: string | null } | null = base;
        if (off) {
          if (off.off_type === "partial" && base) {
            // Reemplazo start/end con las horas anunciadas, mantengo goal y role.
            effective = {
              start_time: off.partial_start_time ?? base.start_time,
              end_time: off.partial_end_time ?? base.end_time,
              daily_goal: base.daily_goal,
              role_kind: base.role_kind,
            };
          } else {
            // day_off / sick / vacation → no trabaja.
            effective = { status: off.off_type, reason: off.reason };
          }
        }

        return {
          display_name: m.display_name,
          role: m.role,
          base_schedule: base,         // horario fijo del weekday (puede ser null si no tiene turno ese día)
          time_off: off,                // anuncio de descanso/parcial/etc para esa fecha (o null)
          effective_schedule: effective, // lo que realmente aplica — usar este para responder
        };
      });

      return {
        target_date: targetDate,
        weekday,
        weekday_name: dayNames[weekday],
        timezone: "America/Bogota",
        is_today: targetDate === bogotaTodayIso,
        team: rows,
      };
    }

    case "register_day_off": {
      const displayName = String(input.display_name ?? "").trim();
      const offDate = String(input.off_date ?? "").trim();
      const offType = String(input.off_type ?? "day_off");
      const partialStart = input.partial_start_time ? String(input.partial_start_time) : null;
      const partialEnd = input.partial_end_time ? String(input.partial_end_time) : null;
      const reason = input.reason ? String(input.reason).slice(0, 200) : null;

      if (!displayName) return { error: "missing_display_name" };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(offDate)) return { error: "invalid_off_date", hint: "Formato YYYY-MM-DD" };
      if (!["day_off", "partial", "sick", "vacation"].includes(offType)) {
        return { error: "invalid_off_type" };
      }
      if (offType === "partial" && !partialStart && !partialEnd) {
        return { error: "partial_requires_time", hint: "Pasá partial_start_time y/o partial_end_time" };
      }

      // Resolver display_name → user_id (mismo patrón que get_member_maven_activity).
      const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
      const { data: members } = await sb
        .from("whatsapp_members")
        .select("id, display_name, user_id")
        .eq("group_id", ctx.groupId)
        .ilike("display_name", `%${safe}%`)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(5);

      if (!members || members.length === 0) {
        return { error: "wpp_member_not_found", display_name: displayName };
      }
      const member = members.find((m) => m.user_id) ?? members[0];
      if (!member.user_id) {
        return {
          error: "member_not_linked",
          hint: "El miembro no está linkeado a Maven. Pediles al admin que lo mapeé desde Panel de Control → WhatsApp Bot.",
          member: { id: member.id, display_name: member.display_name },
        };
      }

      // Upsert via UNIQUE (user_id, off_date) — si ya hay row para ese día, actualizo.
      const { data, error } = await sb
        .from("whatsapp_user_time_off")
        .upsert({
          user_id: member.user_id,
          off_date: offDate,
          off_type: offType,
          partial_start_time: partialStart,
          partial_end_time: partialEnd,
          reason,
          source: "wpp_message",
        }, { onConflict: "user_id,off_date" })
        .select("id, user_id, off_date, off_type")
        .single();

      if (error) return { error: error.message };
      return {
        ok: true,
        registered: data,
        message: `${member.display_name} marcado como ${offType} para ${offDate}.`,
      };
    }

    case "lookup_lead_history": {
      const raw = String(input.instagram_handle ?? "").trim();
      if (!raw) return { error: "missing_handle" };
      // Parsear handle desde URL si vino completa.
      const handle = parseInstagramHandle(raw);
      if (!handle) return { error: "invalid_handle", input: raw };

      // Buscamos en TODAS las fuentes en paralelo. Cada una puede dar 0..N
      // matches; el bot razonará sobre el resultado consolidado.
      const ilike = `%${handle.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const [
        leadgenRes,
        closerCreatorsRes,
        creatorsRes,
        scouterRes,
      ] = await Promise.all([
        sb.from("leadgen_entries")
          .select("id, model_handle, platform, status, quality, company, notes, created_at, lg_user_id")
          .eq("tenant_id", ctx.tenantId)
          .ilike("model_handle", ilike)
          .order("created_at", { ascending: false })
          .limit(5),
        sb.from("closer_creators")
          .select("id, instagram_handle, stage, category, rejection_reason, no_interesada_date, estimated_monetization, monthly_monetization, agency_commission, assigned_to, last_contact_date, created_at, notes")
          .ilike("instagram_handle", ilike)
          .order("created_at", { ascending: false })
          .limit(5),
        sb.from("creators")
          .select("id, instagram_handle, name, status, country, instagram_followers, registration_date")
          .ilike("instagram_handle", ilike)
          .order("registration_date", { ascending: false, nullsFirst: false })
          .limit(3),
        sb.from("scouter_leads")
          .select("id, instagram_handle, ai_score, ai_status, followers, monetization_usd, look_score, country, status, target_companies, assigned_closer, date_added, notes")
          .eq("tenant_id", ctx.tenantId)
          .ilike("instagram_handle", ilike)
          .order("date_added", { ascending: false, nullsFirst: false })
          .limit(3),
      ]);

      // Para closer_creators que matchean, traemos también el historial reciente de touches.
      const ccIds = (closerCreatorsRes.data ?? []).map((c) => c.id);
      let history: Array<Record<string, unknown>> = [];
      if (ccIds.length > 0) {
        const { data: hist } = await sb
          .from("closer_contact_history")
          .select("creator_id, contact_date, channel, result, notes")
          .in("creator_id", ccIds)
          .order("contact_date", { ascending: false })
          .limit(10);
        history = (hist ?? []) as Array<Record<string, unknown>>;
      }

      // Heurística de status global (qué decirle al closer ante el lead):
      //   - "active_creator"  → ya es modelo activa de la agencia, NO recontactar
      //   - "no_interesada"   → ya dijo que no en algún momento
      //   - "in_pipeline"     → algún closer la tiene asignada con stage activo
      //   - "ya_contactada"   → hubo touches pero sin cierre
      //   - "kash_lead_known" → solo LLG la pasó, todavía sin closer
      //   - "scouter_known"   → solo aparece en scouter, todavía sin pipeline
      //   - "nueva"           → no aparece en ningún lado
      let overall: string = "nueva";
      const cc = closerCreatorsRes.data ?? [];
      const creators = creatorsRes.data ?? [];
      const leadgen = leadgenRes.data ?? [];
      const scouter = scouterRes.data ?? [];

      if (creators.some((c) => c.status === "active")) overall = "active_creator";
      else if (cc.some((c) => c.no_interesada_date)) overall = "no_interesada";
      else if (cc.some((c) => c.stage && !["Rechazada", "No interesada", "Cancelado"].includes(c.stage))) overall = "in_pipeline";
      else if (history.length > 0 || cc.length > 0) overall = "ya_contactada";
      else if (leadgen.length > 0) overall = "kash_lead_known";
      else if (scouter.length > 0) overall = "scouter_known";

      return {
        handle,
        overall_status: overall,
        leadgen_entries: leadgen,
        closer_creators: cc,
        creators,
        contact_history: history,
        scouter_leads: scouter,
      };
    }

    case "analyze_instagram_lead": {
      const raw = String(input.instagram_handle ?? "").trim();
      if (!raw) return { error: "missing_handle" };
      const handle = parseInstagramHandle(raw);
      if (!handle) return { error: "invalid_handle", input: raw };
      const forceRefresh = input.force_refresh === true;

      // 1. Cache hit en scouter_leads
      const { data: cached } = await sb
        .from("scouter_leads")
        .select("id, instagram_handle, ai_score, ai_status, ai_reason, followers, monetization_usd, look_score, country, city, category, bio, target_companies, recent_posts, date_added, updated_at")
        .eq("tenant_id", ctx.tenantId)
        .ilike("instagram_handle", handle)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (cached && !forceRefresh) {
        return {
          handle,
          source: "cache",
          updated_at: cached.updated_at,
          followers: cached.followers,
          ai_score: cached.ai_score,
          ai_status: cached.ai_status,
          ai_reason: cached.ai_reason,
          monetization_usd: cached.monetization_usd,
          look_score: cached.look_score,
          country: cached.country,
          city: cached.city,
          category: cached.category,
          bio: cached.bio,
          target_companies: cached.target_companies,
          recent_posts_count: Array.isArray(cached.recent_posts) ? cached.recent_posts.length : 0,
        };
      }

      // 2. No hay cache → encolamos enrich_handle al worker. El worker
      //    procesa el job en ~30s-2min y popula scouter_leads.
      const { data: job, error: jobErr } = await sb
        .from("scouter_jobs")
        .insert({
          kind: "enrich_handle",
          status: "queued",
          payload: { handle, source: "whatsapp_bot" },
          priority: 8, // alta — el closer está por llamar
          tenant_id: ctx.tenantId,
        })
        .select("id, status")
        .single();

      if (jobErr) return { error: jobErr.message };
      return {
        handle,
        source: "queued",
        job_id: job.id,
        message: "No teníamos data en cache. Encolamos un scrape — vas a tener el detalle en 30s-2min. Mientras tanto, podés llamar a la modelo igual; el bot avisa cuando tenga la info.",
      };
    }

    case "register_daily_report": {
      const displayName = String(input.display_name ?? "").trim();
      const reportDate = String(input.report_date ?? "").trim();
      const roleKind = String(input.role_kind ?? "");
      if (!displayName) return { error: "missing_display_name" };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return { error: "invalid_report_date" };
      if (!["llg", "closer"].includes(roleKind)) return { error: "invalid_role_kind" };

      // Resolver display_name → user_id
      const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
      const { data: members } = await sb
        .from("whatsapp_members")
        .select("id, display_name, user_id")
        .eq("group_id", ctx.groupId)
        .ilike("display_name", `%${safe}%`)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(5);
      if (!members || members.length === 0) return { error: "wpp_member_not_found", display_name: displayName };
      const member = members.find((m) => m.user_id) ?? members[0];
      if (!member.user_id) return { error: "member_not_linked", member: { display_name: member.display_name } };

      // Construir payload
      const payload: Record<string, unknown> = {
        user_id: member.user_id,
        report_date: reportDate,
        role_kind: roleKind,
        contactados: input.contactados ?? null,
        respuestas: input.respuestas ?? null,
        numeros_obtenidos: input.numeros_obtenidos ?? null,
        confirmadas: input.confirmadas ?? null,
        rechazadas: input.rechazadas ?? null,
        canceladas: input.canceladas ?? null,
        cerradas: input.cerradas ?? null,
        seguimientos: input.seguimientos ?? null,
        links: input.links ?? [],
        raw_text: input.raw_text ? String(input.raw_text).slice(0, 5000) : null,
        group_id: ctx.groupId,
      };

      const { data, error } = await sb
        .from("whatsapp_daily_reports")
        .upsert(payload, { onConflict: "user_id,report_date" })
        .select("id, user_id, report_date, role_kind, contactados, respuestas, numeros_obtenidos, confirmadas, cerradas")
        .single();
      if (error) return { error: error.message };
      return { ok: true, registered: data, member_name: member.display_name };
    }

    case "add_note_to_lead": {
      const id = String(input.lead_id ?? "");
      const note = String(input.note ?? "").slice(0, 500);
      if (!id || !note) return { error: "missing_args" };
      // Append a la columna "notes" de leadgen_entries. La concatenamos
      // con timestamp para que sea trazable.
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const { data: lead } = await sb
        .from("leadgen_entries")
        .select("notes")
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (!lead) return { error: "not_found" };
      const combined = `${lead.notes ? lead.notes + "\n" : ""}[${stamp} via Maven Asistente] ${note}`;
      const { error } = await sb
        .from("leadgen_entries")
        .update({ notes: combined })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId);
      if (error) return { error: error.message };
      return { ok: true };
    }

    case "resolve_commitment": {
      const id = String(input.commitment_id ?? "");
      const outcome = String(input.outcome ?? "done");
      const note = String(input.note ?? "").slice(0, 500);
      if (!id) return { error: "missing_commitment_id" };
      const status = outcome === "cancelled" ? "cancelled" : "done";
      const { error } = await sb
        .from("whatsapp_commitments")
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolution_note: `Resuelto via Maven Asistente: ${note}`,
        })
        .eq("id", id)
        .eq("group_id", ctx.groupId);
      if (error) return { error: error.message };
      return { ok: true };
    }

    case "snooze_commitment": {
      const id = String(input.commitment_id ?? "");
      const hours = Number(input.hours ?? 24);
      if (!id) return { error: "missing_commitment_id" };
      const newDue = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const { error } = await sb
        .from("whatsapp_commitments")
        .update({ due_at: newDue, status: "pending" })
        .eq("id", id)
        .eq("group_id", ctx.groupId);
      if (error) return { error: error.message };
      return { ok: true, new_due_at: newDue };
    }

    case "get_closer_pipeline_status": {
      const displayName = String(input.display_name ?? "").trim();
      // Resolver closer (opcional).
      let closerUserId: string | null = null;
      let closerName = "equipo";
      if (displayName) {
        const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
        const { data: members } = await sb
          .from("whatsapp_members")
          .select("display_name, user_id")
          .eq("group_id", ctx.groupId)
          .ilike("display_name", `%${safe}%`)
          .order("last_seen_at", { ascending: false, nullsFirst: false })
          .limit(3);
        const m = (members ?? []).find((x) => x.user_id) ?? null;
        if (!m?.user_id) return { error: "closer_not_found_or_unlinked", display_name: displayName };
        closerUserId = m.user_id;
        closerName = m.display_name ?? displayName;
      }

      // Cadencia de los 6 contactos del closer (días desde passed_date).
      const cadence = [1, 3, 5, 8, 15, 29];

      // Counts por stage.
      let countQ = sb.from("closer_creators").select("stage", { count: "exact", head: false });
      if (closerUserId) countQ = countQ.eq("assigned_to", closerUserId);
      const { data: stageRows } = await countQ;
      const byStage: Record<string, number> = {};
      for (const r of (stageRows ?? []) as Array<{ stage: string | null }>) {
        const s = r.stage ?? "Sin stage";
        byStage[s] = (byStage[s] ?? 0) + 1;
      }

      // Leads Asignadas: traer minimum data + contar contactos history → flag overdue.
      let asignadasQ = sb
        .from("closer_creators")
        .select("id, instagram_handle, passed_date, assigned_to, created_at")
        .eq("stage", "Asignada");
      if (closerUserId) asignadasQ = asignadasQ.eq("assigned_to", closerUserId);
      const { data: asignadas } = await asignadasQ;
      const overdue: Array<{ handle: string; days_since: number; next_contact_day: number; contacts_done: number }> = [];
      const staleAsignadas: Array<{ handle: string; days_since: number }> = [];

      for (const a of (asignadas ?? []) as Array<{
        id: string;
        instagram_handle: string | null;
        passed_date: string | null;
        assigned_to: string | null;
        created_at: string;
      }>) {
        if (!a.passed_date) continue;
        const passed = new Date(a.passed_date + "T00:00:00Z").getTime();
        const days = Math.floor((Date.now() - passed) / 86_400_000);
        const { count: doneCount } = await sb
          .from("closer_contact_history")
          .select("id", { count: "exact", head: true })
          .eq("creator_id", a.id);
        const contactsDone = doneCount ?? 0;
        if (contactsDone < 6) {
          const nextIdx = contactsDone; // 0-indexed
          const deadlineDay = cadence[nextIdx];
          if (deadlineDay != null && days > deadlineDay) {
            overdue.push({
              handle: a.instagram_handle ?? "(sin handle)",
              days_since: days,
              next_contact_day: deadlineDay,
              contacts_done: contactsDone,
            });
          }
        }
        if (days > 30 && contactsDone === 0) {
          staleAsignadas.push({ handle: a.instagram_handle ?? "(sin handle)", days_since: days });
        }
      }

      return {
        closer: closerName,
        by_stage: byStage,
        overdue_contacts: overdue.slice(0, 15),
        overdue_count: overdue.length,
        stale_asignadas: staleAsignadas.slice(0, 10),
        cadence_days: cadence,
      };
    }

    case "validate_report_vs_maven": {
      const displayName = String(input.display_name ?? "").trim();
      if (!displayName) return { error: "missing_display_name" };
      const roleKind = String(input.role_kind ?? "llg").toLowerCase();
      // Fecha objetivo: report_date input o hoy en Bogotá.
      const reportDate = String(input.report_date ?? "").trim()
        || new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
      // Resolver user_id via whatsapp_members.
      const { data: member } = await sb
        .from("whatsapp_members")
        .select("id, user_id, display_name")
        .eq("group_id", ctx.groupId)
        .ilike("display_name", `%${displayName}%`)
        .maybeSingle();
      if (!member?.user_id) {
        return {
          error: "user_not_linked",
          display_name: displayName,
          hint: "Este miembro no está vinculado a un user de Maven. Pedile que verifique su número en Settings.",
        };
      }

      const gaps: Array<{
        metric: string;
        claimed: number;
        actual: number;
        gap: number;
        update_hint: string;
      }> = [];
      const maven: Record<string, number> = {};
      const claimed: Record<string, number | null> = {};

      if (roleKind === "llg") {
        // LLG: comparar contra leadgen_entries.
        const { data: entries } = await sb
          .from("leadgen_entries")
          .select("id, model_handle, phone_e164, status, entry_date")
          .eq("lg_user_id", member.user_id)
          .eq("entry_date", reportDate);
        const rows = entries ?? [];
        const actualContactados = rows.length;
        const actualNumeros = rows.filter((r) => r.phone_e164).length;
        const actualRespuestas = rows.filter((r) =>
          ["replied", "interested", "meeting_set", "contactado"].includes(String(r.status))
        ).length;
        maven.contactados = actualContactados;
        maven.numeros = actualNumeros;
        maven.respuestas = actualRespuestas;
        const cN = typeof input.claimed_numeros === "number" ? input.claimed_numeros : null;
        const cC = typeof input.claimed_contactados === "number" ? input.claimed_contactados : null;
        const cR = typeof input.claimed_respuestas === "number" ? input.claimed_respuestas : null;
        claimed.contactados = cC;
        claimed.numeros = cN;
        claimed.respuestas = cR;
        if (cN != null && cN > actualNumeros) {
          gaps.push({
            metric: "numeros",
            claimed: cN, actual: actualNumeros, gap: cN - actualNumeros,
            update_hint: "andá a *LeadGen → Agregar Contactos* y cargá los teléfonos faltantes para que queden en el sistema",
          });
        }
        if (cC != null && cC > actualContactados) {
          gaps.push({
            metric: "contactados",
            claimed: cC, actual: actualContactados, gap: cC - actualContactados,
            update_hint: "andá a *LeadGen → Agregar Lead* y registrá los contactos faltantes",
          });
        }
        if (cR != null && cR > actualRespuestas) {
          gaps.push({
            metric: "respuestas",
            claimed: cR, actual: actualRespuestas, gap: cR - actualRespuestas,
            update_hint: "actualizá el status de las leads que respondieron en *LeadGen* (replied/interested/contactado)",
          });
        }
      } else {
        // CLOSER: comparar contra closer_creators stage transitions del día.
        const dayStart = `${reportDate}T00:00:00-05:00`;
        const dayEnd = `${reportDate}T23:59:59-05:00`;
        const [confirmedRows, completedRows, rejectedRows] = await Promise.all([
          sb.from("closer_creators")
            .select("id, instagram_handle, stage")
            .eq("assigned_to", member.user_id)
            .gte("confirmed_date", dayStart).lte("confirmed_date", dayEnd),
          sb.from("closer_creators")
            .select("id, instagram_handle, stage")
            .eq("assigned_to", member.user_id)
            .eq("stage", "Completada")
            .gte("completed_date", dayStart).lte("completed_date", dayEnd),
          sb.from("closer_creators")
            .select("id, instagram_handle, stage")
            .eq("assigned_to", member.user_id)
            .gte("no_interesada_date", dayStart).lte("no_interesada_date", dayEnd),
        ]);
        const actualConfirmadas = (confirmedRows.data ?? []).length;
        const actualCerradas = (completedRows.data ?? []).length;
        const actualRechazadas = (rejectedRows.data ?? []).length;
        maven.confirmadas = actualConfirmadas;
        maven.cerradas_completadas = actualCerradas;
        maven.rechazadas = actualRechazadas;
        const cConf = typeof input.claimed_confirmadas === "number" ? input.claimed_confirmadas : null;
        const cCer = typeof input.claimed_cerradas === "number" ? input.claimed_cerradas : null;
        claimed.confirmadas = cConf;
        claimed.cerradas = cCer;
        if (cConf != null && cConf > actualConfirmadas) {
          gaps.push({
            metric: "confirmadas",
            claimed: cConf, actual: actualConfirmadas, gap: cConf - actualConfirmadas,
            update_hint: "andá a *Closers → @handle* y marcá la lead como *Confirmada* (registra confirmed_date)",
          });
        }
        if (cCer != null && cCer > actualCerradas) {
          gaps.push({
            metric: "cerradas",
            claimed: cCer, actual: actualCerradas, gap: cCer - actualCerradas,
            update_hint: "andá a *Closers → @handle* y marcá la lead como *Completada* (firmó). Eso la convierte automáticamente en creator activo",
          });
        }
      }

      return {
        member: { id: member.id, user_id: member.user_id, display_name: member.display_name },
        role_kind: roleKind,
        report_date: reportDate,
        maven,
        claimed,
        gaps,
        matched: gaps.length === 0,
      };
    }

    case "mark_lead_stage": {
      const handle = String(input.handle ?? "").trim().replace(/^@/, "").toLowerCase();
      const newStatus = String(input.new_status ?? "").trim();
      const reason = String(input.reason ?? "").trim();
      if (!handle || !newStatus) return { error: "missing_handle_or_status" };
      const noteSuffix = reason
        ? `\n[Bot ${new Date().toISOString().slice(0, 10)}] ${reason}`
        : "";

      // Buscar primero en leadgen_entries (más común).
      const { data: lg } = await sb
        .from("leadgen_entries")
        .select("id, model_handle, status, notes")
        .ilike("model_handle", handle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lg) {
        const newNotes = (lg.notes ? lg.notes + noteSuffix : (noteSuffix.trim() || null));
        const { error } = await sb
          .from("leadgen_entries")
          .update({ status: newStatus, notes: newNotes })
          .eq("id", lg.id);
        if (error) return { error: error.message, table: "leadgen_entries" };
        return { ok: true, table: "leadgen_entries", lead_id: lg.id, prev_status: lg.status, new_status: newStatus };
      }

      // Fallback: closer_creators.
      const { data: cc } = await sb
        .from("closer_creators")
        .select("id, instagram_handle, stage, notes")
        .ilike("instagram_handle", handle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cc) {
        const newNotes = (cc.notes ? cc.notes + noteSuffix : (noteSuffix.trim() || null));
        const update: Record<string, unknown> = { stage: newStatus, notes: newNotes };
        if (/rechaz|no_interes/i.test(newStatus)) {
          update.rejection_reason = reason || null;
          update.no_interesada_date = new Date().toISOString();
        }
        if (/confirm|cerrad/i.test(newStatus)) {
          update.confirmed_date = new Date().toISOString();
        }
        const { error } = await sb
          .from("closer_creators")
          .update(update)
          .eq("id", cc.id);
        if (error) return { error: error.message, table: "closer_creators" };
        return { ok: true, table: "closer_creators", lead_id: cc.id, prev_stage: cc.stage, new_stage: newStatus };
      }

      return { error: "lead_not_found", handle };
    }

    case "reply_to_group": {
      const body = String(input.body ?? "").trim();
      if (!body) return { error: "empty_body" };
      // Llamamos a whatsapp-send para que despache.
      const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "",
        },
        body: JSON.stringify({ group_id: ctx.groupId, body }),
      });
      const data = await resp.json();
      return data as Record<string, unknown>;
    }

    default:
      return { error: `unknown_tool:${name}` };
  }
}

// ----------------------------------------------------------------------------
// Build initial user message
// ----------------------------------------------------------------------------
async function buildInitialUserMessage(args: {
  req: AgentRequest;
  groupId: string;
  groupName: string;
  timezone: string;
}): Promise<string> {
  const lines: string[] = [];
  lines.push(`Grupo: ${args.groupName}`);
  lines.push(`Timezone: ${args.timezone}`);
  lines.push(`Hora actual: ${new Date().toISOString()}`);
  lines.push("");

  if (args.req.report_kind === "eod_summary") {
    lines.push("Tarea: generar el REPORTE FIN DE TURNO (EOD) del grupo, en español.");
    lines.push("");
    lines.push("Seguí EXACTAMENTE las instrucciones de la sección 'REPORTE FIN DE TURNO' del system prompt.");
    lines.push("Tu output final va por reply_to_group — una sola llamada al final.");
    lines.push("Bot mode actual: el grupo está en cierre de jornada — TODOS los miembros recibirán este mensaje.");
    return lines.join("\n");
  }
  if (args.req.report_kind) {
    lines.push(`Tarea: generar un reporte ${args.req.report_kind}.`);
    lines.push(
      "Incluí: compromisos cumplidos, vencidos, top contributors, leads movidos. " +
        "Empezá usando list_commitments y search_messages para juntar datos. " +
        "Resumen final via reply_to_group, conciso (5-8 bullets máx).",
    );
    return lines.join("\n");
  }

  if (args.req.message_id) {
    const sb = adminClient();
    const { data: msg } = await sb
      .from("whatsapp_messages")
      .select("sender_display_name, sender_external_id, body, transcribed_text, msg_type, sent_at")
      .eq("id", args.req.message_id)
      .single();

    // ¿El sender es el dueño? Mirá si whatsapp_members tiene este sender
    // mapeado a un user con profiles.is_owner = true. Si sí, marcamos
    // el prompt con [OWNER_MESSAGE] para que el system_prompt active el
    // modo "ultra resumido".
    let isOwner = false;
    if (msg?.sender_external_id) {
      const { data: member } = await sb
        .from("whatsapp_members")
        .select("user_id")
        .eq("group_id", args.groupId)
        .eq("external_id", msg.sender_external_id)
        .maybeSingle();
      if (member?.user_id) {
        const { data: profile } = await sb
          .from("profiles")
          .select("is_owner")
          .eq("id", member.user_id)
          .maybeSingle();
        isOwner = profile?.is_owner === true;
      }
    }

    const { data: ctx } = await sb
      .from("whatsapp_messages")
      .select("sender_display_name, body, transcribed_text, msg_type, sent_at")
      .eq("group_id", args.groupId)
      .lt("sent_at", msg?.sent_at ?? new Date().toISOString())
      .order("sent_at", { ascending: false })
      .limit(10);

    // Helper local: texto efectivo del mensaje (transcribed_text para
    // audios/imágenes cuando ya está procesado, body en otro caso).
    const effectiveText = (m: {
      body: string | null;
      transcribed_text: string | null;
      msg_type: string;
    }) => {
      if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
        const prefix = m.msg_type === "audio" ? "[audio]" : "[imagen]";
        return `${prefix} ${m.transcribed_text}`;
      }
      return m.body;
    };

    lines.push("Contexto reciente (orden cronológico):");
    for (const m of (ctx ?? []).reverse()) {
      const text = effectiveText(m);
      if (text) lines.push(`[${m.sent_at}] ${m.sender_display_name}: ${text}`);
    }
    lines.push("");
    if (isOwner) {
      lines.push("[OWNER_MESSAGE] ← Este mensaje viene del DUEÑO de la agencia. Respondé ULTRA resumido, en bullets, sin relleno. Ver reglas en system prompt.");
    }
    if (args.req.invoked_by === "auto") {
      lines.push("[AUTO_LISTENING] ← El bot está escuchando todos los mensajes del grupo. Este NO te citó explícitamente. Aplicá las reglas de MODO AUTO-LISTENING del system prompt: solo responder si entra en los casos de alto valor; si no, NO llames reply_to_group y terminá el loop callado.");
    }
    lines.push("Mensaje al cual debés responder:");
    if (msg) {
      lines.push(`[${msg.sent_at}] ${msg.sender_display_name}: ${effectiveText(msg)}`);
    }
    lines.push("");
    lines.push(
      "Razoná, usá las tools que hagan falta y respondé al grupo via reply_to_group. " +
        "No respondas en el thinking — solo via reply_to_group.",
    );
    return lines.join("\n");
  }

  if (args.req.user_question) {
    lines.push("Pregunta del usuario (vino del panel admin, no del grupo):");
    lines.push(args.req.user_question);
    lines.push("");
    lines.push(
      "Razoná y respondé via reply_to_group. Si la pregunta no es relevante para el grupo, " +
        "respondé de todos modos pero corto.",
    );
    return lines.join("\n");
  }

  lines.push("Tarea: hacé un mini-resumen del estado del grupo. " +
    "Llamá list_commitments para ver pendientes, y respondé via reply_to_group.");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Run the agent loop
// ----------------------------------------------------------------------------
async function runAgent(req: AgentRequest): Promise<{
  ok: boolean;
  iterations?: number;
  final_reply?: string;
  error?: string;
}> {
  const sb = adminClient();

  // Resolver group_id si vino message_id en su lugar.
  let groupId = req.group_id;
  if (!groupId && req.message_id) {
    const { data: m } = await sb
      .from("whatsapp_messages")
      .select("group_id")
      .eq("id", req.message_id)
      .single();
    groupId = m?.group_id;
  }

  if (!groupId) return { ok: false, error: "missing_group_id" };

  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, name, timezone, active, bot_enabled, bot_persona")
    .eq("id", groupId)
    .single();

  if (!group) return { ok: false, error: "group_not_found" };
  if (!group.active) return { ok: false, error: "group_inactive" };

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: "agent_invoked",
    payload: { req, invoked_by: req.invoked_by },
  });

  const systemPrompt = group.bot_persona
    ? `${SYSTEM_PROMPT}\n\nPersonalización del grupo:\n${group.bot_persona}`
    : SYSTEM_PROMPT;

  const initialUser = await buildInitialUserMessage({
    req,
    groupId: group.id,
    groupName: group.name,
    timezone: group.timezone,
  });

  // Loop messages array per Anthropic spec.
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: initialUser },
  ];

  const startedAt = Date.now();
  let finalReply: string | null = null;
  let iter = 0;
  const totalUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  const modelToUse = pickModel(req.invoked_by, !!req.report_kind);

  for (; iter < MAX_ITERATIONS; iter += 1) {
    if (Date.now() - startedAt > MAX_WALL_MS) break;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelToUse,
        max_tokens: 4000,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `anthropic ${resp.status}: ${txt.slice(0, 200)}`, iterations: iter };
    }

    const data = await resp.json() as {
      content: Array<Record<string, unknown>>;
      stop_reason: string;
      usage: Record<string, number>;
    };

    // acumular usage
    for (const k of Object.keys(totalUsage) as Array<keyof typeof totalUsage>) {
      totalUsage[k] += (data.usage?.[k] ?? 0);
    }

    const toolUses = data.content.filter((b) => b.type === "tool_use");
    const replyText = data.content
      .filter((b) => b.type === "text")
      .map((b) => String(b.text ?? ""))
      .join("\n")
      .trim();

    if (toolUses.length === 0) {
      // No tools llamadas. En modo mention/manual: si el modelo escribió texto
      // y olvidó llamar reply_to_group, lo mandamos nosotros (fallback).
      // En modo auto: NO hay fallback — si el agent decidió quedarse callado
      // (no llamó reply_to_group), lo respetamos. Esto evita que el bot
      // hable en el grupo cuando solo razonó internamente "esto no amerita".
      if (replyText && req.invoked_by !== "auto") {
        await executeTool("reply_to_group", { body: replyText }, {
          groupId: group.id,
          tenantId: group.tenant_id,
        });
        finalReply = replyText;
      }
      messages.push({ role: "assistant", content: data.content });
      break;
    }

    messages.push({ role: "assistant", content: data.content });

    const toolResults: Array<Record<string, unknown>> = [];
    for (const t of toolUses) {
      const result = await executeTool(
        String(t.name),
        (t.input as ToolInput) ?? {},
        { groupId: group.id, tenantId: group.tenant_id },
      );
      if (t.name === "reply_to_group") {
        finalReply = String((t.input as ToolInput).body ?? "");
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: t.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }

    messages.push({ role: "user", content: toolResults });

    // Si el modelo llamó reply_to_group exitosamente, salimos.
    if (finalReply) break;
  }

  await logAnthropicUsage({
    operation: "whatsapp_agent",
    model: modelToUse,
    usage: totalUsage,
    tenantId: group.tenant_id,
    context: { group_id: group.id, iterations: iter + 1, invoked_by: req.invoked_by },
  });

  return {
    ok: true,
    iterations: iter + 1,
    final_reply: finalReply ?? undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: whatsappCors });
  }

  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await runAgent(body);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});
