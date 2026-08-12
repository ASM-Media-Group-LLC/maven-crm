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
  tieneRespaldoDeJuicio,
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
