// Batería de las guardas de salida. Positivos = mensajes reales del bot que DEBEN
// bloquearse (con fecha del incidente); negativos = mensajes reales que la versión
// anterior bloqueaba MAL (calibración 05/08 contra 1.098 mensajes de 14 días).
// Correr: deno test supabase/functions/_shared/agent-output-guards.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afirmaRegistro,
  detectarVoseoEnPitch,
  esCausaDeFalloScan,
  esCorreccionDeEstilo,
  TIENE_PITCH_CITADO,
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

Deno.test("pitch citado con sustancia", () => {
  assert(TIENE_PITCH_CITADO('Va: "hola lucy! te escribo de kash, somos agencia de creadoras y tu perfil tiene con qué crecer bien"'));
  assertEquals(TIENE_PITCH_CITADO('le dije "ok" y seguimos'), false);
});
