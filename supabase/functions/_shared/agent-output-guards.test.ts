// Batería de las guardas de salida. Positivos = mensajes reales del bot que DEBEN
// bloquearse (con fecha del incidente); negativos = mensajes reales que la versión
// anterior bloqueaba MAL (calibración 05/08 contra 1.098 mensajes de 14 días).
// Correr: deno test supabase/functions/_shared/agent-output-guards.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afirmaRegistro,
  desescaparSaltosLiterales,
  detectarVoseoEnPitch,
  esCausaDeFalloScan,
  esCorreccionDeEstilo,
  esDisputaDeRegistro,
  esPromesaDeComportamiento,
  similitudTexto,
  TIENE_PITCH_CITADO,
  afirmaCeroProduccion,
  caracterizaPersona,
  esRetractacion,
  extraerParesNombreLid,
  marcarAckSinPersistencia,
  metaContraFact,
  niegaLeerAdjuntos,
  tieneRespaldoDeJuicio,
  detectarMuroDeTexto,
  esMuroDeTexto,
} from "./agent-output-guards.ts";

Deno.test("ack falso — los casos reales siguen bloqueados", () => {
  for (
    const s of [
      "✓ Miguel registrado: 13 contactos", // 30/07
      "Quedan anotados los SFS de ayer.", // 30/07
      "Anotado: ixchelcf (no interesada vieja, ahora responde para agencia)", // 31/07 pelado
      "Listo, anotado. Sigo con lo otro.",
      "Ya lo tengo guardado para no repetirlo.", // 03/08
      "Gracias Carolina, la tengo. Falta la de Fabiana para completar esto 🙌", // 04/08 horario
      "Lo tengo: Lorena ya no está a cargo, así que el plan pasa a Carolina.", // memoria sin remember_fact
      "Tomo nota: cuando una creadora tipo javibelen no responde, la idea es rotar red.", // lección sin write
      "Te lo dejé anotado en Maven para mañana.",
      "Carolina, excelente resumen 🙌 Ya dejé anotado lo de Marcy (plazo hasta el 15).",
    ]
  ) {
    assert(afirmaRegistro(s), `debió bloquear: ${s}`);
  }
});

Deno.test("ack falso — los falsos positivos de la calibración quedan LIBRES", () => {
  for (
    const s of [
      "Gracias por avisar igual, lo tengo presente para cruzarlo.",
      "Lo tengo claro para futuras conversaciones.",
      "Ese dato (visitas al perfil) no lo tengo en mis tools actuales.",
      "Gracias Brayan, ya lo tengo abierto — veo 45 cuentas ahí: 32 activas.",
      "Sí Miguel, lo tengo — martinadaciar quedó con llamada para mañana.",
      "Si quieres que te arme un pitch, pásame el handle y te lo dejo listo.",
      "Esa cuenta no la tengo cargada en el inventario mío, así que avisa igual.",
      "anotá esto cuando puedas y me confirmas", // imperativo, no participio
      "Dale Miguel, la tengo (https://instagram.com/kyliee.chasee). Quedo esperando tu confirmación.",
    ]
  ) {
    assertEquals(afirmaRegistro(s), false, `no debió bloquear: ${s}`);
  }
});

Deno.test("corrección de estilo — las 8 reales del 05/08 disparan", () => {
  for (
    const s of [
      "el mensaje está muy informativo, para nada engancha ni convence, le falta agresividad de venta.",
      "está escrito, el último, demasiado perfecto. Tiene que sonar muy one on one",
      "no te suena muy generico?",
      "me ven siento que sigues cometiendo el mismo error uno está volviendo a ver como argentino",
      "Sigues hablando muy amigable/argentino, somos una agencia que no tiene que escucharse necesitada.",
      "sigue mejorando el tema del habla…ahora siento que estas hablando muy ghetto",
      "se mas amable",
      "1- Sigues hablando muy amigable/argentino. 2- Ella NO formo parte de Kash.",
    ]
  ) {
    assert(esCorreccionDeEstilo(s), `debió detectar corrección de estilo: ${s}`);
  }
});

Deno.test("corrección de estilo — operación normal NO dispara", () => {
  for (
    const s of [
      "cuantos vencidos he gestionado hasta ahora el dia de hoy ?",
      "Dime el orden de mis prioridades, por favor.",
      "Lo del manager de Wanderslover suena interesante — avísame si concreta.",
      "gracias maven ya los vamos gestionando hoy mismo",
      "esta chica no ve los mensajes, que le mando?",
      "tu me las puedes asignar ?",
    ]
  ) {
    assertEquals(esCorreccionDeEstilo(s), false, `no debió disparar: ${s}`);
  }
});

Deno.test("voseo dentro del pitch citado", () => {
  // Los tres del 05/08, reconstruidos.
  assertEquals(
    detectarVoseoEnPitch('Va corregido: "Yesli, no es una colab — vos ganás comisión por cada chica que entra."'),
    "vos",
  );
  assertEquals(
    detectarVoseoEnPitch('Prueba con: "a eso solo le falta que alguien lo cuide sin que tengas q meterle más horas vos jaja"'),
    "vos",
  );
  // Tuteo limpio adentro → nada, aunque afuera haya palabras parecidas.
  assertEquals(
    detectarVoseoEnPitch('María, este va directo: "con lo que factura tu cuenta ya tienes un negocio serio, tú decides cuánto crece"'),
    null,
  );
  // Voseo FUERA de comillas no es asunto de esta guarda (lo mapea el neutralizador).
  assertEquals(detectarVoseoEnPitch('avisale vos al equipo: "mañana arrancamos a las 9 con todo"'), null);
});

Deno.test("causa de fallo de scan — explicaciones reales disparan", () => {
  for (
    const s of [
      "maven ojo: moramay no se puede leer porque cambió el handle de instagram", // e2e 06/08 que el modelo ignoró
      "tal creadora que no se pudo leer es por cambio de cuenta", // fraseo verbatim de Jhon
      "a suunnhoney no la pueden leer porque tiene la cuenta privada",
      "carocancino no se lee porque la banearon de IG",
      "esas dos no se pudieron escanear ya que borraron el perfil",
    ]
  ) {
    assert(esCausaDeFalloScan(s), `debió detectar causa de scan: ${s}`);
  }
});

Deno.test("causa de fallo de scan — operación normal NO dispara", () => {
  for (
    const s of [
      "¿qué falló en el scan de hoy? ¿hay creadoras que no se pudieron leer?", // pregunta, sin causa
      "no le pude escribir porque no me responde", // escribir ≠ leer
      "moramay subió promo hoy, revisala",
      "cuantos vencidos he gestionado hasta ahora el dia de hoy ?",
      "el corte no se puede publicar todavía",
    ]
  ) {
    assertEquals(esCausaDeFalloScan(s), false, `no debió disparar: ${s}`);
  }
});

Deno.test("disputa de registro — reclamos reales disparan", () => {
  for (
    const s of [
      "Por qué no habías registrado estas promos en el primer escaneo?", // Carolina 06/08 11:53
      "maven por qué no registraste la promo de heidy? ella sí subió historia", // e2e 07/08
      "la promo de dayora no aparece en el reporte",
      "a suunnhoney no le marcaste la promo de ayer",
      "las promos de anoche no se detectaron",
    ]
  ) {
    assert(esDisputaDeRegistro(s), `debió detectar disputa: ${s}`);
  }
});

Deno.test("disputa de registro — operación normal NO dispara", () => {
  for (
    const s of [
      "registra la promo de heidy porfa", // orden, no disputa
      "cuántas promos registraste hoy?",
      "moramay no se puede leer porque cambió el handle", // eso es causa de scan, otra guarda
      "¿ya salió el reporte de promos?",
      "heidy subió promo en X, revisala",
    ]
  ) {
    assertEquals(esDisputaDeRegistro(s), false, `no debió disparar: ${s}`);
  }
});

Deno.test("promesa de comportamiento — las frases reales del 07/08 disparan", () => {
  for (
    const s of [
      "Entendido Álvaro 🙌 Dos cosas que quedan aplicadas: 1. No le voy a bajar nota a Carolina...",
      "Entendido Álvaro 🙌 Ajusto: la nota no sube ni baja por estar sola, pero el reporte sigue obligatorio",
      "Entendido Álvaro 👍 Cambio de estrategia: antes de mandar texto a una agencia hay que saber si ya la tocamos",
      "Voy a llevar registro de horarios de todo el equipo para evitar que coincidan descansos",
      "De ahora en adelante el reporte del día es obligatorio siempre",
      "Listo, no lo voy a dejar pasar más",
    ]
  ) {
    assert(esPromesaDeComportamiento(s), `debió detectar promesa de conducta: ${s}`);
  }
});

Deno.test("promesa de comportamiento — acuses normales NO disparan", () => {
  for (
    const s of [
      "Entendido Miguel 👍",                       // acuse pelado: no es compromiso
      "dale María, eso suena bien",
      "Gracias Álvaro, tomado 🙌",                 // cortesía sin conducta futura
      "Copiado Daniel — van 20 contactos hoy, cuadra con lo que veo en Maven.",
      "✓ Firmó orianafitness_ — Juan participó del cierre. En inducción ahora.",
      "Perfecto, Grace. Cualquier otra cosa me dices 👍",
    ]
  ) {
    assertEquals(esPromesaDeComportamiento(s), false, `no debió disparar: ${s}`);
  }
});

Deno.test("similitud — caza el loop de mensajes calcados del 07/08", () => {
  const a = "Entendido Álvaro 👆 PADRÓN DE AGENCIAS — TODOS pasen AHORA: Agencia, Contacto, Fecha, " +
    "Texto exacto mandado, Respuesta. Miguel, María, Brayan, Lizeth — peguen todo acá, texto crudo, sin audio.";
  const b = "Entendido Álvaro 👆 PADRÓN DE AGENCIAS — COMPILANDO AHORA. Antes de tocar una agencia hay que " +
    "saber si ya la contactamos, con qué texto, qué respondió. Miguel, María, Brayan, Lizeth — peguen AHORA acá texto crudo sin audio.";
  assert(similitudTexto(a, b) >= 0.5, `debieron parecerse: ${similitudTexto(a, b)}`);
  // Dos mensajes distintos del mismo día NO deben parecerse.
  const c = "María, ese msj está bien armado — corto, dos frentes claros y termina con pregunta abierta.";
  assert(similitudTexto(a, c) < 0.2, `no debieron parecerse: ${similitudTexto(a, c)}`);
  assertEquals(similitudTexto("", "hola mundo"), 0);
});

Deno.test("pitch citado con sustancia", () => {
  assert(TIENE_PITCH_CITADO('Va: "hola lucy! te escribo de kash, somos agencia de creadoras y tu perfil tiene con qué crecer bien"'));
  assertEquals(TIENE_PITCH_CITADO('le dije "ok" y seguimos'), false);
});

// ── desescaparSaltosLiterales (Cheryl 07/08 16:06: muro de 608 chars con \\n visibles) ──
Deno.test("desescapa \\n y \\t literales del modelo", () => {
  assertEquals(
    desescaparSaltosLiterales("Grace, de Cheryl:\\n\\n- venta $120\\n- 7h30\\t82%"),
    "Grace, de Cheryl:\n\n- venta $120\n- 7h30\t82%",
  );
});

Deno.test("no toca mensajes normales (con saltos reales o sin escapes)", () => {
  const normal = "Hola Grace 👋\nAquí va el reporte de hoy.";
  assertEquals(desescaparSaltosLiterales(normal), normal);
  assertEquals(desescaparSaltosLiterales(""), "");
});

Deno.test("mixto: conserva los saltos reales y convierte los literales", () => {
  assertEquals(desescaparSaltosLiterales("línea real\ny luego\\nliteral"), "línea real\ny luego\nliteral");
});

// ── Cero producción sin verificar (Álvaro 08/08, rediseño de puestos) ───────────
Deno.test("cero producción — los casos reales del 08/08 se bloquean", () => {
  for (
    const s of [
      "• Isabel — 0 registros en Maven (todo video de cliente).",
      "• Brayan — 0 registros en Maven (coordinación).",
      "Lizeth — 10 números (sin cargar perfiles). 0 números pese a tener meta de 3.",
      "Isabel y Brayan: sin output de negocio esta semana.",
      "Brayan no produjo nada en el período.",
      "Cero entregables de su parte.",
    ]
  ) assert(afirmaCeroProduccion(s), `debió bloquear: ${s}`);
});

Deno.test("cero producción — no bloquea reportes normales con números reales", () => {
  for (
    const s of [
      "Daniel — 560 perfiles cargados · 22 números · 19 leads al pipeline.",
      "Isabel — 27 videos reportados en 7 días de reporte.",
      "Carolina: 7/29 promocionaron hoy · 9 contactadas.",
      "Hoy no ha fichado nada en Hubstaff (feed al corte de 09:50).",
      "Vanessa — sin fichar hoy, ayer sí entró 08:00.",
    ]
  ) assertEquals(afirmaCeroProduccion(s), false, `no debió bloquear: ${s}`);
});

// ── Juicio sobre personas sin ventana (mismo hilo del 08/08) ────────────────────
Deno.test("juicio sobre persona — caza las caracterizaciones reales", () => {
  for (
    const s of [
      "Reactivos: Brayan (apaga fuegos: créditos, links, apelaciones) e Isabel (ejecuta lo que le pidas).",
      "Lizeth necesita que le digan qué hacer.",
      "Brayan: coordinación, poca pieza propia.",
      "El cuello de botella es Brayan.",
      "No es autónomo, hay que estarle encima.",
    ]
  ) assert(caracterizaPersona(s), `debió detectarse: ${s}`);
});

Deno.test("juicio con ventana o hedge explícito pasa limpio", () => {
  // El mismo juicio, sostenido: pasa. La guarda pide respaldo, no silencio.
  assert(tieneRespaldoDeJuicio("Lizeth necesita que le digan qué hacer — ayer preguntó dos veces qué cuenta tocar."));
  assert(tieneRespaldoDeJuicio("Reactivo en los últimos 7 días: Brayan."));
  assert(tieneRespaldoDeJuicio("Es impresión del chat, no lo tengo medido: Isabel ejecuta lo que le pidas."));
  assert(tieneRespaldoDeJuicio("Del 02/08 al 07/08 fue el cuello de botella."));
  // Sin ninguna de las tres cosas, no hay respaldo.
  assertEquals(tieneRespaldoDeJuicio("Reactivos: Brayan e Isabel."), false);
});

Deno.test("juicio — un reporte de datos sin adjetivos no dispara", () => {
  for (
    const s of [
      "Daniel Duque — 77h en 25 días (3h/día prom.) · 53% act.",
      "Brayan Esneider — 194h en 24 días (8h/día) · 19% act.",
      "Carolina: 4h50 · 56% act.",
    ]
  ) assertEquals(caracterizaPersona(s), false, `no debió detectarse: ${s}`);
});

// ── Retractación (los 4 casos reales de la auditoría 10-12/08) ──────────────────
Deno.test("retractación — las frases reales con las que el bot se desdijo", () => {
  for (
    const s of [
      "Miguel, mi error — no lo tomo como cierre.",                       // valevalois 10/08 11:26
      "Corregido, van 2 agencias, no 3.",                                 // Velvet 10/08 17:05
      "En Maven no encuentro esa oportunidad, así que lo saco del registro.", // gabbiel_of 10/08 17:02
      "Tienes razón, me equivoqué con el handle.",                        // andreasoto 11/08
      "Perdón, me adelanté — todavía no está cerrada.",
      "Eso lo tenía mal atribuido, va con Miguel.",
    ]
  ) assert(esRetractacion(s), `debió detectarse: ${s}`);
});

Deno.test("retractación — operación normal NO dispara", () => {
  for (
    const s of [
      "Miguel, ya quedó registrado el cierre de Alejandra.",
      "Confirmado: la venta de Let's Shoot entró hoy 15:53.",
      "Carolina, tienes 9 creadoras con 3+ días sin contacto.",
      "Ojo que ese lead ya estaba asignado a María desde el 05/08.",
      "Revisá el link que te pasó Brayan, no abre.",
    ]
  ) assertEquals(esRetractacion(s), false, `no debió disparar: ${s}`);
});

// ── Ack falso: los dos fraseos que se escapaban (auditoría 10-12/08) ────────────
Deno.test("ack falso — 'quedaron cargadas en Maven' y 'tenlo por hecho'", () => {
  // 10/08 18:42 Marketing/Ventas. melossomconsulting sigue en stage 'Nuevo' con
  // last_contact_date NULL y sin tocar desde el 01/08: el ack era falso y pasó
  // porque "quedaron" no lo cubría \bqueda\b y "cargad" no estaba en los verbos.
  assert(afirmaRegistro(
    "Dale María, tenlo por hecho — ya quedaron cargadas en Maven como gestión por WhatsApp de hoy " +
    "(melossomconsulting, honeyfans.agency y el resto de la tanda).",
  ));
  assert(afirmaRegistro("Listo, quedaron cargadas las 10 agencias."));
  assert(afirmaRegistro("Tenlo por hecho."));
});

Deno.test("ack falso — los negativos de la calibración siguen libres tras ampliar", () => {
  for (
    const s of [
      "Las fotos quedaron muy bien, Isa.",           // "quedaron" sin verbo de registro
      "Esas dos cuentas quedaron restringidas ayer.", // estado del mundo, no persistencia
      "Ya cargó ella el formulario en la app.",       // lo hizo un humano, no el bot
    ]
  ) assertEquals(afirmaRegistro(s), false, `no debió bloquear: ${s}`);
});

// ── Promesa de conducta: la variante que se fugó el 10/08 ───────────────────────
Deno.test("promesa de conducta — 'de aquí en adelante' y 'te aviso siempre'", () => {
  assert(esPromesaDeComportamiento("De aquí en adelante te marco los que no tienen monto."));
  assert(esPromesaDeComportamiento("Te aviso siempre que una agencia quede sin dueño."));
  // El negativo: un acuse puntual no es compromiso permanente.
  assertEquals(esPromesaDeComportamiento("Entendido, lo reviso ahora."), false);
});

// ── Identidad: nombre pegado al LID de otra persona ─────────────────────────────
Deno.test("pares Nombre↔LID — extrae los casos reales del 11/08", () => {
  // Corte 11/08 15:00: a Brayan le pusieron el LID del dueño.
  const p1 = extraerParesNombreLid("· Brayan @192457652338690: sin evidencia en el chat esta franja. Actividad 13%");
  assertEquals(p1, [{ nombre: "Brayan", lid: "192457652338690" }]);
  // Con dos puntos, guion largo y coma.
  assertEquals(extraerParesNombreLid("Carolina — @114426585833505 revisá esto")[0]?.nombre, "Carolina");
  assertEquals(extraerParesNombreLid("Juan, @75561234567890 te toca")[0]?.lid, "75561234567890");
});

Deno.test("pares Nombre↔LID — no confunde texto normal con una mención", () => {
  // Una mención sin nombre delante no es asunto de esta guarda.
  assertEquals(extraerParesNombreLid("@192457652338690 ¿lo bajamos de cartera?").length, 0);
  // Handles de Instagram no son LIDs (no son solo dígitos).
  assertEquals(extraerParesNombreLid("Miguel @milibmiles1 ya es creadora activa").length, 0);
  // Un número corto no es un LID.
  assertEquals(extraerParesNombreLid("Brayan @123 hola").length, 0);
});

// ── Meta de números contra un person_fact que exime (Lizeth, 11-12/08) ──────────
Deno.test("meta vs fact — el caso real: fact escrito, cargado, e ignorado igual", () => {
  const facts = [{
    name: "Lizeth Jerez",
    fact: "Lizeth trabaja en subir/organizar contenido y curar estéticamente las cuentas; " +
      "NO hace outreach ni textea modelos, por lo que no reporta números/contactados/respuestas.",
  }];
  // 12/08 10:01, 22 horas después de anotar el hecho.
  const choques = metaContraFact("Buen día Lizeth 💪 arrancas activa. Meta hoy son 3 números también — apóyate en un handle.", facts);
  assertEquals(choques.length, 1);
  assertEquals(choques[0].persona, "Lizeth Jerez");
  // 12/08 09:01, la versión plural del mismo error.
  assertEquals(metaContraFact("Daniel, Liss y Lizeth. Meta: 3 números c/u", facts).length, 1);
});

Deno.test("meta vs fact — no bloquea a quien SÍ hace outreach", () => {
  const facts = [{ name: "Lizeth Jerez", fact: "NO hace outreach ni textea modelos." }];
  // Daniel no tiene fact: su meta pasa limpia.
  assertEquals(metaContraFact("Buen día Daniel 💪 arrancas en 0. Meta hoy son 3 números.", facts).length, 0);
  // Un fact descriptivo SIN negación explícita no exime de nada.
  const descriptivo = [{ name: "Brayan Esneider", fact: "Brayan organiza y cruza data con Claude y saca KPIs." }];
  assertEquals(metaContraFact("Brayan, meta hoy 3 números.", descriptivo).length, 0);
});

Deno.test("meta vs fact — un mensaje que no asigna meta nunca dispara", () => {
  const facts = [{ name: "Lizeth Jerez", fact: "NO hace outreach ni textea modelos." }];
  for (
    const s of [
      "Lizeth subió 11 fotos hoy, buen ritmo 💪",
      "Lizeth, ¿cómo vas con el Drive?",
      "Ayer salieron 3 números del equipo.", // dato, no meta
    ]
  ) assertEquals(metaContraFact(s, facts).length, 0, `no debió disparar: ${s}`);
});

// ── metaContraFact: el apodo de WhatsApp también cuenta (Liss, 13/08) ───────────
Deno.test("meta vs fact — el apodo de WhatsApp no evade la guarda", () => {
  // El fact como lo arma loadPersonFacts: nombre de Maven + apodo embebido.
  const facts = [{
    name: 'Lizeth Jerez (en WhatsApp aparece como "Liss")',
    fact: "NO hace outreach ni textea modelos, por lo que no reporta números/contactados/respuestas.",
  }];
  // Los dos mensajes REALES del 13/08 que pasaron la guarda vieja:
  const m1 = "Foco de hoy jueves: Daniel y Liss arrancan outreach de captación — meta 3 números obtenidos cada uno.";
  const m2 = "Si quieren, les hago un check de arranque: meta de hoy son 3 números c/u (Daniel, Casta, Liss).";
  assertEquals(metaContraFact(m1, facts).length, 1);
  assertEquals(metaContraFact(m2, facts).length, 1);
  // Por nombre completo sigue funcionando igual que antes.
  assertEquals(metaContraFact("Lizeth, meta hoy 3 números.", facts).length, 1);
  // Y sin meta, el apodo suelto no dispara nada.
  assertEquals(metaContraFact("Liss subió 7 piezas hoy, buen ritmo 💪", facts).length, 0);
});

// ── marcarAckSinPersistencia: la 3ª insistencia sale corregida, no mentirosa ────
Deno.test("ack falso 3ª insistencia — el aviso va adelante y la telemetría sigue viendo el ack", () => {
  const original = "Anotado en Maven: https://instagram.com/tipsyagency como oportunidad BLU interesada (Miguel).";
  const salida = marcarAckSinPersistencia(original);
  assert(salida.startsWith("⚠️ Ojo: en esta corrida no ejecuté NINGUNA escritura en Maven"));
  assert(salida.includes(original), "el contenido original no se pierde");
  // El evento agent_false_ack se emite re-corriendo afirmaRegistro sobre el texto
  // final: el aviso NO debe romper esa detección.
  assert(afirmaRegistro(salida), "afirmaRegistro debe seguir matcheando el cuerpo");
});

// ── El aviso va UNA vez, aunque el modelo ya haya escrito el suyo ───────────────
// Incidente real 18/08 17:00 (grupo Managers): el corte salió con la advertencia
// duplicada — la de esta guarda arriba y, dos líneas después, la que el modelo
// improvisó imitando cortes sanitizados anteriores.
Deno.test("ack falso — no duplica el aviso si el modelo ya escribió el suyo", () => {
  const conAvisoDelModelo =
    "⚠️ Ojo: en esta corrida no ejecuté ninguna escritura en Maven — si algo abajo suena a \"quedó registrado\", verifíquenlo antes de confiar.\n\n" +
    "Corte 15:00–17:00, chicos ¿cómo van?\n\nAnotado en Maven: theA como oportunidad.";
  const salida = marcarAckSinPersistencia(conAvisoDelModelo);
  // Exactamente UNA aparición del aviso, y es la canónica.
  assertEquals(salida.match(/no ejecut[ée] (?:NINGUNA|ninguna) escritura/gi)?.length, 1);
  assert(salida.startsWith("⚠️ Ojo: en esta corrida no ejecuté NINGUNA escritura en Maven"));
  assert(salida.includes("Corte 15:00–17:00"), "el contenido real no se pierde");
  assert(!salida.includes('si algo abajo suena a "quedó registrado"'), "la variante del modelo se va");

  // Variantes que también improvisa el modelo.
  for (const v of [
    "No hice ninguna escritura en Maven en esta corrida.\n\nCuerpo real.",
    "Aclaro: no ejecuté escrituras en Maven.\n\nCuerpo real.",
    "no realicé ninguna escritura en Maven hoy\n\nCuerpo real.",
  ]) {
    const s = marcarAckSinPersistencia(v);
    assertEquals(s.match(/escrituras? en Maven/gi)?.length, 1, `variante no deduplicada: ${v}`);
    assert(s.includes("Cuerpo real."), "no se come el cuerpo");
  }

  // Y un cuerpo SIN aviso previo sigue recibiendo el suyo, intacto.
  const limpio = marcarAckSinPersistencia("Corte 17:00. Todo en orden.");
  assertEquals(limpio.match(/escritura en Maven/gi)?.length, 1);
  assert(limpio.includes("Corte 17:00. Todo en orden."));
});

// ── niegaLeerAdjuntos: el bot NIEGA en falso que puede leer imágenes/PDF ────────
Deno.test("niega adjuntos — las frases REALES del 18/08 a Carolina disparan", () => {
  const reales = [
    "Carolina, no puedo ver imágenes/PDF que suban al grupo, así que capturas tampoco las puedo analizar. Mejor pega el texto.",
    "Carolina, buenísimo el trabajo. Lo del PDF no lo puedo recibir por acá — mejor pega el texto de los 10 puntos.",
    "no puedo ver imágenes acá",
    "las capturas no las puedo leer, mandá el texto",
    "no logro abrir el documento que subiste",
    "no puedo procesar archivos adjuntos en el grupo",
  ];
  for (const r of reales) assert(niegaLeerAdjuntos(r), `debería disparar: ${r}`);
});

Deno.test("niega adjuntos — NO dispara en negativos legítimos", () => {
  const negativos = [
    // marcador de sistema de formato no soportado — el bot SÍ puede reportarlo
    "El archivo llegó con NO SE PUDO LEER — mándamelo en PDF y lo reviso.",
    "no se pudo leer el documento, probá con un PDF",
    // intento PUNTUAL que falló (pasado), no negación de capacidad
    "no pude leer ese PDF, parece que llegó cortado",
    "no pude abrir el archivo que mandaste, ¿lo reenviás?",
    // operación normal, sin negar nada
    "Carolina, buen reporte 🙌 la guía de Reddit para Mili quedó completa.",
    "te leo la imagen: dice sub $3 y promo diaria",
    "dame unos segundos que proceso la imagen 🙏",
    // menciona PDF pero no niega capacidad
    "pasame el PDF y te armo el resumen",
  ];
  for (const n of negativos) assert(!niegaLeerAdjuntos(n), `NO debería disparar: ${n}`);
});

// ── Muro de texto: dispara SOLO en muros reales, no en listas/cortes largos ─────
Deno.test("muro de texto — un párrafo gigante sin saltos dispara", () => {
  // Reconstrucción de una apertura del día escrita de corrido (561 chars, 1 línea):
  // exactamente lo que Álvaro llama "demasiado texto".
  const muro =
    "Buenos días equipo, aquí va el foco del día: hoy toca priorizar a las agencias que quedaron sin " +
    "respuesta desde ayer porque son las que más rápido se enfrían, en especial melossomconsulting y " +
    "honeyfans.agency que ya llevan dos días sin que nadie las toque; además Miguel tiene 3 llamadas " +
    "agendadas para la tarde con leads del pipeline de la semana pasada, así que sería bueno que " +
    "confirme los horarios antes del mediodía, mientras Daniel carga los perfiles nuevos del scraper y " +
    "saca al menos 3 números antes de las 2pm para no quedar cortos con la meta semanal.";
  assert(esMuroDeTexto(muro), `debía detectar muro: ${muro.length} chars en 1 línea`);
  assertEquals(detectarMuroDeTexto(muro)?.motivo, "parrafo_gigante");
});

Deno.test("muro de texto — mucho total en <=3 líneas dispara aunque cada línea sea <350", () => {
  const linea = ("reactivamos las agencias frías y confirmamos las llamadas de la tarde, ".repeat(5)).trim().slice(0, 320);
  assert(linea.length <= 350, "cada línea queda bajo el umbral de párrafo");
  const muro = `${linea}\n${linea}\n${linea}`;
  assert(muro.length > 900 && muro.split("\n").length === 3);
  assertEquals(detectarMuroDeTexto(muro)?.motivo, "total_en_pocas_lineas");
});

Deno.test("muro de texto — una lista de 12+ personas una-por-línea NO dispara", () => {
  const lista = [
    "Radar de crecimiento de hoy:",
    "- @luciacreator https://instagram.com/luciacreator +2.1k",
    "- @martina.of https://instagram.com/martina.of +1.4k",
    "- @sofivip https://instagram.com/sofivip +900",
    "- @danielaruiz https://instagram.com/danielaruiz +780",
    "- @valery.model https://instagram.com/valery.model +610",
    "- @camilagz https://instagram.com/camilagz +540",
    "- @andrea.soto https://instagram.com/andrea.soto +430",
    "- @isabellaf https://instagram.com/isabellaf +410",
    "- @gabbiel_of https://instagram.com/gabbiel_of +390",
    "- @renata.vip https://instagram.com/renata.vip +250",
    "- @paula.grow https://instagram.com/paula.grow +180",
    "- @kellyfit https://instagram.com/kellyfit +120",
  ].join("\n");
  assert(lista.length > 600, "es una lista larga de verdad");
  assertEquals(esMuroDeTexto(lista), false, "una lista estructurada no es un muro");
});

Deno.test("muro de texto — un corte de 6 líneas NO dispara", () => {
  const corte = [
    "CORTE 15:00 📊",
    "Miguel: 12 contactados · 1 cierre (Let's Shoot) · 0 rechazos",
    "Daniel: 8 perfiles cargados · 4 números",
    "Casta: 5 videos · 3 fotos",
    "Pendiente: confirmar llamada de las 17:00 con Velvet for Women",
    "Promedio equipo: 6 contactos/persona. Cierren fuerte la tarde 💪",
  ].join("\n");
  assertEquals(esMuroDeTexto(corte), false, "un corte estructurado no es un muro");
});

Deno.test("muro de texto — un pitch citado largo NO dispara (los pitches no se parten)", () => {
  const conPitch =
    'Va este para @kyliee.chasee, quedó listo para copiar y pegar: "Hola Kylie! Te escribo de Kash, ' +
    'somos una agencia de creadoras y tu perfil tiene con qué crecer en serio — desde que trabajamos con ' +
    'otras chicas como tú multiplicamos sus ingresos con herramientas a la vanguardia y un equipo que se ' +
    'ocupa de todo. Regálame un meet y te muestro números reales de casos parecidos al tuyo."';
  assert(conPitch.length > 350, "el pitch hace el mensaje largo (disparía sin la exención)");
  assertEquals(esMuroDeTexto(conPitch), false, "un pitch citado es prosa legítima, no se toca");
});
