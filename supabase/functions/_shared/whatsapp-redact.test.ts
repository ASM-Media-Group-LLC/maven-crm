// Batería de redactPhones() — el enmascarador de teléfonos del borde de salida.
//
// Historia: el 31/07 la versión anterior destruyó dos cifras del pedido de escalada en
// Managers ("$10.478 (-48%)" → "$***7848%)") y entre el 01 y el 04/08 se comió cinco veces
// el handle "dani2603592" ("dani***3592"). El fix se diseñó con 3 propuestas independientes
// + ataque adversarial a cada una (workflow 05/08); esta batería es la unión de ese corpus:
// POSITIVOS y NEGATIVOS del relevamiento, los hallazgos de los ataques, y los casos reales.
//
// Correr: deno test --allow-all supabase/functions/_shared/whatsapp-redact.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactPhones } from "./whatsapp.ts";

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** El número no debe ser recuperable: su secuencia completa de dígitos no sobrevive. */
function asertaEnmascarado(input: string, ocultar: string[], nombre: string) {
  const out = redactPhones(input);
  for (const seq of ocultar) {
    assert(
      !soloDigitos(out).includes(seq),
      `FUGA en "${nombre}":\n  in : ${input}\n  out: ${out}`,
    );
  }
  assert(/\*{3,}\d{4}/.test(out), `sin máscara visible en "${nombre}": ${out}`);
}

function asertaIntacto(input: string, nombre: string) {
  assertEquals(redactPhones(input), input, `ROTO "${nombre}"`);
}

Deno.test("sanidad: los invisibles están de verdad en el código", () => {
  // La clase de TEL_CAND_RE lleva NBSP, U+2011 y los wrappers bidi como LITERALES.
  // Si un editor/format los normaliza, estos casos se rompen — mejor que truene acá.
  asertaEnmascarado("Tel: 300‑123‑4567 (copiado de la ficha).", ["3001234567"], "guion U+2011");
  asertaEnmascarado("Contacto guardado: (‪+57 300 1234567‬) confirmado.", ["573001234567"], "wrappers bidi");
  asertaEnmascarado("Tel: +57 300 123 4567.", ["573001234567"], "NBSP");
});

Deno.test("positivos: todo formato real de teléfono se enmascara", () => {
  const POS: Array<[string, string[], string]> = [
    ["El numero de la lead es +573001234567, ya cargado en Maven.", ["573001234567"], "E164 con +57"],
    ["Contacto: 573001234567 (Ora Miami).", ["573001234567"], "E164 sin +"],
    ["Andrea me pasó el 3001234567, lo cargo yo.", ["3001234567"], "local 10 dígitos"],
    ["Nuevo numero obtenido: +57 300 123 4567", ["573001234567"], "bloques por espacio"],
    ["La lead responde al (+57) 300 1234567.", ["573001234567"], "indicativo en paréntesis"],
    ["gestionado en wp\n(+573001234567)\nsigue el siguiente", ["573001234567"], "roster multilínea"],
    ["Telefono: 300-123-4567, contestó ayer.", ["3001234567"], "guiones ASCII"],
    ["El de Miami es (305) 555-0142, es de la agencia.", ["3055550142"], "indicativo US"],
    ["+1 (305) 555-0142 — el numero que dio en la call.", ["13055550142"], "US con 1"],
    ["Le escribi al +52 55 1234 5678 y no contesta.", ["525512345678"], "México 12"],
    ["Aparece como 5215512345678 en el JID.", ["5215512345678"], "México legacy 521"],
    ["El de Buenos Aires es +54 9 11 2345-6789.", ["5491123456789"], "Argentina con 9"],
    ["La creadora de Madrid: +34 612 345 678.", ["34612345678"], "España 9"],
    ["La de Madrid contesto, su numero es 612 34 56 78.", ["612345678"], "España pares 3-2-2-2"],
    ["+56 9 8765 4321 es el de Camila.", ["56987654321"], "Chile"],
    ["Escríbele por https://wa.me/573001234567 antes de las 6.", ["573001234567"], "wa.me con https"],
    ["Link directo: https://api.whatsapp.com/send?phone=573001234567", ["573001234567"], "api.whatsapp phone="],
    ["wa.me/573001234567 — ahi la ubicas.", ["573001234567"], "wa.me sin protocolo"],
    ["sigue por https://t.me/+573001234567 mejor", ["573001234567"], "t.me/+ (Telegram)"],
    ["prueba https://wa.me/%2B573001234567 si no abre", ["573001234567"], "wa.me con %2B"],
    ["el link https://wa.me/57-300-123-4567 que pasó ella", ["573001234567"], "wa.me malformado con guiones"],
    ["La conversacion es 573001234567@s.whatsapp.net.", ["573001234567"], "JID en prosa"],
    ["Dejo el tel 300.123.4567 por si lo necesitan.", ["3001234567"], "puntos terminando en 4"],
    ["Su wsp es 3001234567 y el fijo 6012345678.", ["3001234567", "6012345678"], "dos en la misma frase"],
    ["Me dio su numero: 3001234567.", ["3001234567"], "pegado al punto final"],
    ["Los tres son 3001234567, 3109876543 y 3204445566.", ["3001234567", "3109876543", "3204445566"], "enumeración"],
    ["Actualizados: 3001234567 / 3109876543 / 3204445566", ["3001234567", "3109876543", "3204445566"], "separados por barra"],
    ["La creadora de Madrid: 612.345.678.", ["612345678"], "España puntos 3-3-3"],
    ["ya te dio el WhatsApp 3134576868 — buen avance.", ["3134576868"], "histórico AI WARMING"],
    // Cursiva de WhatsApp: "_" es \w — el lookbehind (?<![\w@]) de la versión anterior
    // dejaba FUGAR este teléfono entero. El nuevo (?<![\p{L}@]) lo enmascara.
    ["confirmado _3001234567_ por interno", ["3001234567"], "teléfono en cursiva _..._"],
    ["código 3001234567% aplicado", ["3001234567"], "teléfono pegado a % (A17)"],
    ["anota 2026-07-31 3001234567 como quedó", ["3001234567"], "teléfono detrás de fecha ISO"],
  ];
  for (const [input, ocultar, nombre] of POS) asertaEnmascarado(input, ocultar, nombre);
});

Deno.test("negativos: cifras, fechas, rangos y handles quedan byte a byte", () => {
  const NEG: Array<[string, string]> = [
    ["resumen: $20.277 -> $10.678 (-48%), promo floja", "bug reportado (flecha ASCII)"],
    ["· JulietaRodriguezok (julietarodriguezok) — $20.277 → $10.478 (-48%), promo solo 8 de 22 días", "radar 31/07 caso 1"],
    ["· javibelen (javibelen.sl) — $15.202 → $12.248 (-19%), CERO días de promo en 17 leídos", "radar 31/07 caso 2"],
    ["ingresos 1.234.567", "millones sin $"],
    ["top fan @luis gastó $12.450 (32% del total)", "paréntesis sin menos"],
    ["corte 2026-07-31 20:25 publicado", "fecha ISO + hora"],
    ["la reunión quedó para el 2026-08-05", "fecha ISO pura"],
    ["cita el 31-07-2026 con la agencia", "fecha latam dd-mm-yyyy"],
    ["corte del 2026‑07‑31 publicado", "fecha con U+2011"],
    ["· pau (pau.sl) — $9.202 → $7.848 (-61%), va mejorando", "survivor 6 dígitos"],
    ["$9.999 (-48%)", "umbral inferior"],
    ["$10.000 (-48%)", "umbral exacto 7 dígitos"],
    ["$120.478 (-48%)", "8 dígitos"],
    ["$1.234.567 (-48%)", "millones + caída"],
    ["cerró $10.678 (-48 %) este mes", "espacio RAE antes del %"],
    ["quedó $1.120.478 ( -48%) al cierre", "espacio tras el paréntesis"],
    ["cayó $10.478 (-48,5 %) al corte", "decimal coma + espacio"],
    ["$10.478 (-48,5%) contra junio", "decimal con coma"],
    ["$10.478 (-48.5%) contra junio", "decimal con punto"],
    ["· julieta — $10.478 48% de caída", "pct puenteado por espacio"],
    ["$10.478 (-1200%) es un glitch de BLU", "pct 4 dígitos puenteado"],
    ["crecimiento del 1200% en junio", "pct 4 dígitos suelto"],
    ["vendió $1234567 este mes", "$ pegado sin puntos"],
    ["$12.345.678 facturados en total", "millones 8 dígitos"],
    ["nómina total $115.702.919 del mes", "nómina COP 9 dígitos con $"],
    ["quedó en $1.234.567,89 el acumulado", "millonario con decimales"],
    ["resultado (1.234.567) en rojo", "negativo contable"],
    ["meta de 10.000-15.000 diarios", "rango con guion"],
    ["rango 1.000-15.000 en promos", "rango asimétrico"],
    ["entre 8.000 - 12.000 al día", "rango espaciado"],
    ["meta 10000-15000 fans", "rango sin puntos"],
    ["de 1.000‑15.000 según el plan", "rango con U+2011"],
    ["el patrón 1-3-5-8-15-29 de warming sigue igual", "serie warming"],
    ["cerró $3,443 este mes", "coma inglesa"],
    ["llegó a 1,234 followers", "followers con coma"],
    ["**33 leads** nuevos, **0 números** cargados, **245 registros**", "negrita markdown"],
    ["mira https://instagram.com/dani2603592 y confírmame", "URL con dígitos"],
    ["María, dani2603592 no es ex-creadora — es lead nueva", "handle con dígitos en prosa"],
    ["@143250161664036 revisa esto cuando puedas", "mención LID"],
    ["promo solo 8 de 22 días", "números cortos"],
    ["le puse 7/10 y a la otra 9/10", "notas"],
    ["el corte va de 14:00 a 16:00", "rango horario"],
    ["Top ingresos:\n20.277\n15.202\n30.100", "columna multilínea (\\n ya no puentea)"],
  ];
  for (const [input, nombre] of NEG) asertaIntacto(input, nombre);
});

Deno.test("mixtos: la plata queda, el teléfono no", () => {
  const o1 = redactPhones("cerró $1.234.567 y su tel es 3001234567");
  assert(o1.includes("$1.234.567") && !soloDigitos(o1).includes("3001234567") && o1.includes("******4567"), o1);

  const o2 = redactPhones("la lead del +573001234567 gastó $12.450 (32% del total)");
  assert(o2.includes("$12.450 (32% del total)") && !soloDigitos(o2).includes("573001234567"), o2);

  const o3 = redactPhones("mándale $50 al 3001234567 antes del corte");
  assert(o3.includes("$50") && !soloDigitos(o3).includes("3001234567"), o3);

  // El monto y el teléfono en el MISMO candidato: se enmascara entero. Se pierde el
  // "$500" — dirección elegida a propósito (PII > falso positivo de plata).
  const o4 = redactPhones("cobró $500 3001234567 es el número");
  assert(!soloDigitos(o4).includes("3001234567"), o4);
});

Deno.test("límites aceptados: quedan documentados para que un cambio sea consciente", () => {
  // Teléfono de 7-8 dígitos escrito con puntos de miles: indistinguible de un monto
  // es-CO por forma. En la base, TODOS los teléfonos con puntos terminan en grupo de 4
  // (se enmascaran); esto solo fugaría con un fijo escrito "12.345.678", inexistente
  // en la prosa real del bot. Si algún día aparece, este test truena y se re-decide.
  assertEquals(redactPhones("posible cliente 12.345.678, llámalo"), "posible cliente 12.345.678, llámalo");
  assertEquals(redactPhones("el fijo viejo 2.345.678 de la oficina"), "el fijo viejo 2.345.678 de la oficina");
  // "$" pegado a una corrida única de dígitos = plata. "$3001234567" (typo) fugaría.
  assertEquals(redactPhones("cóbrale al $3001234567 de ayer"), "cóbrale al $3001234567 de ayer");
  // Teléfono pegado a una LETRA (typo): el lookbehind bloquea el primer dígito pero el
  // motor re-arranca en el segundo → se enmascara desde ahí ("es3*****4567"). El número
  // NO es recuperable (solo se ve 1 dígito + los 4 finales). Los handles reales quedan a
  // salvo justamente por eso: sus corridas son de ≤7 dígitos y al saltar el primero
  // quedan en <7 ("dani2603592" intacto, ver negativos). Un handle con 8+ dígitos
  // seguidos se enmascararía parcialmente — no existe ninguno así en la base hoy.
  const glued = redactPhones("confírmalo es3001234567 tal cual");
  assertEquals(glued, "confírmalo es3*****4567 tal cual");
  assert(!soloDigitos(glued).includes("3001234567"), "el pegado a letra debe quedar irrecuperable");
});

Deno.test("idempotencia: enmascarar dos veces no cambia nada", () => {
  const casos = [
    "gestionado en wp\n(+573001234567)\nsigue — cerró $10.678 (-48%)",
    "Tel: 300-123-4567 y meta de 10.000-15.000 diarios",
  ];
  for (const c of casos) {
    const una = redactPhones(c);
    assertEquals(redactPhones(una), una, `no idempotente: ${c}`);
  }
});
