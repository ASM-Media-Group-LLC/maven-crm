// Batería del neutralizador de voseo del borde de salida.
// Positivos = mensajes REALES del bot que salieron con voseo (con fecha del incidente);
// negativos = palabras que se le parecen y NO se deben tocar.
// Correr: deno test supabase/functions/_shared/whatsapp-voseo.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { neutralizarVoseo } from "./whatsapp.ts";

// El caso que destapó el agujero: el mapa corrigió "pasá" y dejó "coordiná" y
// "revisá" en la MISMA oración (Marketing/Ventas, 11/08 15:00).
Deno.test("11/08 15:00 — las tres formas de la misma oración quedan neutras", () => {
  const salida = neutralizarVoseo(
    "Miguel, coordiná con Michelle antes de las 5PM: revisá cómo está funcionando el CP, " +
      "en qué ha avanzado, y pasá el reporte acá para que llegues con info concreta a Velvet.",
  );
  assertEquals(
    salida,
    "Miguel, coordina con Michelle antes de las 5PM: revisa cómo está funcionando el CP, " +
      "en qué ha avanzado, y pasa el reporte acá para que llegues con info concreta a Velvet.",
  );
});

Deno.test("plantillas de los nudges del cron (20 de las 31 ocurrencias)", () => {
  assertEquals(neutralizarVoseo("¿Los avanzás hoy?"), "¿Los avanzas hoy?");
  assertEquals(neutralizarVoseo("arrancales el seguimiento"), "arráncales el seguimiento");
  assertEquals(neutralizarVoseo("¿Cuáles te asignás?"), "¿Cuáles te asignas?");
});

Deno.test("las fugas sueltas de AI WARMING", () => {
  assertEquals(neutralizarVoseo("che, mandame eso cuando puedas"), "oye, mándame eso cuando puedas");
  assertEquals(neutralizarVoseo("si no lo cerrás hoy perdés la ventana"), "si no lo cierras hoy pierdes la ventana");
  assertEquals(neutralizarVoseo("enfocate en los números"), "enfócate en los números");
});

Deno.test("no toca formas ambiguas que también son pasado de 1ª persona", () => {
  // El mapa evita a propósito los imperativos en -í: "yo seguí/subí/escribí/abrí" es
  // pasado válido y neutro. Cambiarlos rompería frases correctas.
  for (const s of ["ayer seguí el hilo", "ya subí las fotos", "le escribí el lunes", "abrí la cuenta el martes"]) {
    assertEquals(neutralizarVoseo(s), s, `no debió tocar: ${s}`);
  }
});

Deno.test("no toca palabras que solo se PARECEN al voseo", () => {
  for (
    const s of [
      "el reporte de la noche", // "noche" contiene "che"
      "Michelle confirmó la reunión", // "Michelle" contiene "che"
      "el coche está afuera", // "coche"
      "la fecha de corte",
      "vamos a Chercán", // mayúscula intermedia
    ]
  ) {
    assertEquals(neutralizarVoseo(s), s, `no debió tocar: ${s}`);
  }
});

Deno.test("SOS en mayúsculas es sigla, no voseo", () => {
  const s = "mandó un SOS al grupo";
  assertEquals(neutralizarVoseo(s), s);
  // pero en minúscula sí es voseo
  assert(neutralizarVoseo("vos sos el que decide").includes("eres"));
});

Deno.test("no toca handles ni menciones", () => {
  const s = "escribile a @vosconmigo y a @che.oficial";
  // el lookbehind protege lo que viene después de @
  assert(!neutralizarVoseo(s).includes("@tú"));
  assert(!neutralizarVoseo(s).includes("@oye"));
});

Deno.test("voseo — los que se fugaron el 17/08 (auditoría sáb/lun)", () => {
  // Las tres frases REALES que salieron al aire ese lunes:
  assertEquals(
    neutralizarVoseo("aún no veo números cargados hoy — la meta son 3. Priorizá unlok_official (203K, score 75)."),
    "aún no veo números cargados hoy — la meta son 3. Prioriza unlok_official (203K, score 75).",
  );
  assertEquals(neutralizarVoseo("Seguile la corriente a eso"), "Síguele la corriente a eso");
  assertEquals(
    neutralizarVoseo("Miguel, la lead está en tu vencidos… tocala hoy y avanza."),
    "Miguel, la lead está en tu vencidos… tócala hoy y avanza.",
  );
  // Hermanas de las fugadas, para no repetir "pasá corregido, coordiná intacto":
  assertEquals(neutralizarVoseo("tocá base con María y seguime contando"), "toca base con María y sígueme contando");
});
