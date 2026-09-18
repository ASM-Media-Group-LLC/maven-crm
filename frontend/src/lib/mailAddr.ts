/**
 * Parseo de direcciones de correo — funciones PURAS, sin React ni Supabase.
 *
 * Viven acá y no en `useMailbox` a propósito: deciden a quién le llega la
 * respuesta (sobre todo "responder a todos"), que es justo lo que NO se ve
 * mirando la pantalla. Sin cliente de Supabase encima se pueden testear en
 * jsdom (ver `mailAddr.test.ts`); cada caso ahí es un defecto que ya pasó.
 *
 * `useMailbox` las re-exporta, así el resto del código las sigue importando
 * desde ahí como siempre.
 */

/** Saca el nombre a mostrar de un `From:` tipo `Juan Pérez <j@x.com>`. */
export function nombreDe(direccion: string): string {
  const m = direccion.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  const nombre = m?.[1]?.trim();
  if (nombre) return nombre;
  return direccion.replace(/[<>]/g, "").trim() || "(sin remitente)";
}

/** Saca la dirección de un `From:`, para responder. */
export function correoDe(direccion: string): string {
  const m = direccion.match(/<([^>]+)>/);
  return (m?.[1] ?? direccion).trim();
}

/** Saca TODAS las direcciones de un encabezado `To:`/`Cc:`, que puede traer
 *  varias con nombre: `"Pérez, Juan" <j@x.com>, ana@y.com`. Para "responder a
 *  todos".
 *
 *  Parte por comas de PRIMER NIVEL: una coma dentro de comillas es parte del
 *  nombre (`"Pérez, Juan"`), no un separador — partir a lo bruto por `,` la
 *  trataría como dos direcciones y colaría basura en el Para. Devuelve el
 *  correo de cada una en minúscula, ya listo para deduplicar. */
export function direccionesDe(header: string): string[] {
  return partesDeHeader(header)
    .map((p) => correoDe(p).toLowerCase())
    .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
}

/** Parte un encabezado por comas de PRIMER NIVEL. Una coma dentro de comillas
 *  es parte del nombre (`"Pérez, Juan"`), no un separador: partir a lo bruto
 *  por `,` la trataría como dos direcciones y colaría basura. */
function partesDeHeader(header: string): string[] {
  if (!header) return [];
  const partes: string[] = [];
  let actual = "";
  let enComillas = false;
  for (const ch of header) {
    if (ch === '"') enComillas = !enComillas;
    if (ch === "," && !enComillas) {
      partes.push(actual);
      actual = "";
    } else {
      actual += ch;
    }
  }
  partes.push(actual);
  return partes;
}

/** Como `direccionesDe`, pero conserva el NOMBRE de cada uno. Para MOSTRAR la
 *  lista de destinatarios: en pantalla "Tatiana Vargas" dice más que
 *  "tatiana.vargas@maven-ai.me", y con veinte personas la diferencia entre leer
 *  y no leer es esa. No deduplica ni filtra: lo que se muestra tiene que ser
 *  exactamente lo que traía el encabezado. */
export function participantesDe(header: string): { nombre: string; email: string }[] {
  return partesDeHeader(header)
    .map((p) => ({ nombre: nombreDe(p), email: correoDe(p) }))
    .filter((x) => x.email);
}

export interface CamposOriginal {
  /** El `From:` del correo al que se responde. */
  from: string;
  /** El `To:` del original (encabezado crudo, puede traer varios). */
  to: string;
  /** El `Cc:` del original. */
  cc: string;
  /** Mi propia dirección: nunca me respondo a mí mismo. */
  yo: string;
}

/** Decide el Para y la Copia de una respuesta.
 *
 *  `aTodos` = false → solo el remitente, como el botón "Responder" de siempre.
 *  `aTodos` = true  → el remitente + el resto del Para + la Copia del original,
 *  como Gmail. En los dos casos me saco a mí mismo y quito repetidos (dos
 *  clientes escriben la misma dirección con mayúsculas distintas), y una
 *  dirección que ya va en Para no se repite en Copia.
 *
 *  Es PURO y está testeado aparte: mandar la respuesta a quien no era —o
 *  filtrar de más y dejar gente afuera— es el error más caro de esta pantalla,
 *  y no se ve mirando el compositor. */
export function destinatariosRespuesta(
  o: CamposOriginal,
  aTodos: boolean,
): { to: string; cc: string } {
  const yo = o.yo.toLowerCase();
  const remitente = correoDe(o.from).toLowerCase();
  const para = [remitente, ...(aTodos ? direccionesDe(o.to) : [])];
  const paraUnico = [...new Set(para)].filter((d) => d && d !== yo);
  const copiaUnica = aTodos
    ? [...new Set(direccionesDe(o.cc))].filter(
        (d) => d && d !== yo && !paraUnico.includes(d),
      )
    : [];
  return {
    // Si el correo era mío y quedé fuera del Para, al menos vuelve el
    // remitente: no tiene sentido abrir el compositor sin destinatario.
    to: (paraUnico.length ? paraUnico : [remitente]).join(", "),
    cc: copiaUnica.join(", "),
  };
}

/** ¿Hay más de una persona además de mí en el correo? Si no, "responder a
 *  todos" daría exactamente lo mismo que "responder", así que no se muestra. */
export function tieneVariosInvolucrados(o: CamposOriginal): boolean {
  const yo = o.yo.toLowerCase();
  const gente = new Set(
    [correoDe(o.from).toLowerCase(), ...direccionesDe(o.to), ...direccionesDe(o.cc)].filter(
      (d) => d && d !== yo,
    ),
  );
  return gente.size > 1;
}

/** El asunto de un reenvío.
 *
 *  No se apila: reenviar tres veces sigue diciendo "Fwd:" una sola vez, igual
 *  que "Re:" al responder. Se acepta también "RV:" porque es lo que escriben
 *  Outlook y Zoho en español, y un correo que ya viene reenviado desde ahí no
 *  tiene por qué quedar como "Fwd: RV: …". */
export function asuntoDeReenvio(asunto: string): string {
  return /^\s*(fwd|fw|rv):/i.test(asunto) ? asunto : `Fwd: ${asunto}`;
}
