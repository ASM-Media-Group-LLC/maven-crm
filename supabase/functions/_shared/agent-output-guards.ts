// Guardas determinísticas de salida del bot + detectores compartidos.
// Doctrina de la casa: cuando una regla de prompt falla repetido, el chequeo va al
// borde de salida (mismo patrón que el enmascarado de teléfonos y el neutralizador
// de voseo). Tests: deno test supabase/functions/_shared/agent-output-guards.test.ts

// ── Ack falso (el "anotado" fantasma) ───────────────────────────────────────────
// Historia: 30/07 cuatro casos ("✓ Miguel registrado" con cero filas); 31/07 el
// "Anotado:" pelado que pasó los 5 patrones (#1032); 03/08 "ya lo tengo guardado";
// 04/08 "Gracias Carolina, la tengo" sobre un horario que nunca escribió.
//
// CALIBRADO el 05/08 contra 1.098 mensajes reales del bot (14 días): la versión
// anterior daba ~3 falsos positivos por día — "lo tengo presente/claro/abierto",
// "no lo tengo en mis tools", "pásame el handle y te lo dejo listo" (una OFERTA,
// no un ack) — y cada FP quema hasta 2 reintentos de LLM y empuja a una tercera
// redacción más floja.
export const PATRONES_ACK_FALSO: RegExp[] = [
  /(?:✓|✅)[^\n]{0,80}\b(?:registrad|anotad|agendad|marcad|gestionad|guardad)/i,
  /\b(?:qued[óo]|quedan|queda)\b[^\n]{0,40}\b(?:registrad|anotad|agendad|marcad|gestionad|guardad)/i,
  /\b(?:lo|la|los|las)\s+tengo\s+guardad/i,
  // "la tengo" SOLO si la frase termina ahí ([.,:!] o fin de línea): se queda el caso
  // real ("Gracias Carolina, la tengo.") y se sueltan "lo tengo presente/claro/
  // abierto/en mis tools" y "lo tengo — <dato>", que son lectura o cortesía.
  // El lookbehind suelta "no lo tengo".
  /(?<!\bno\s)\b(?:lo|la|los|las)\s+tengo\s*(?:[.:!,]|$)/im,
  /\b(?:lo|la|los|las)\s+(?:registr|anot|agend|guard)(?:é|e|amos|ó)\b/i,
  /\bya\s+(?:lo|la|los|las)\s+(?:registr|anot|agend|guard)/i,
  /\bte\s+lo\s+(?:registr|anot|agend)/i,
  // "dejé anotado" / "ya dejo anotado" — hecho consumado. El presente condicional
  // ("respondan por acá y lo dejo anotado", "te lo dejo listo si me pasas el handle")
  // es una PROMESA, no un ack — de eso se encarga la regla de PROMESAS FUTURAS.
  /\b(?:dej[ée]|ya\s+dej[oé])\s+(?:anotad|registrad|agendad|guardad|marcad)/i,
  /^\s*(?:listo[,!.]?\s+)?(?:anotad|registrad|agendad|apuntad|marcad|gestionad|guardad)[oa]s?\b/im,
  /\btom[oé]\s+nota\b/i,
];
export const afirmaRegistro = (s: string): boolean => PATRONES_ACK_FALSO.some((re) => re.test(s));

// ── Corrección de ESTILO de pitch ───────────────────────────────────────────────
// 05/08: OCHO correcciones de estilo en un día (argentino ×3, "muy genérico" ×2,
// "muy ghetto", "demasiado perfecto — tiene que sonar one on one", "sé más amable")
// y solo 1 regla guardada: el equipo re-entrena al bot todos los días. Este detector
// reconoce cuando el humano corrige CÓMO escribir (no QUÉ dato), para exigirle al
// bot que persista la lección antes de reenviar el pitch corregido.
export const CORRECCION_ESTILO_RE =
  /\b(?:argentin\w*|voseo|ghetto|rob[óo]tic\w*|gen[ée]ric\w*|demasiado\s+perfect\w*|one\s+on\s+one|m[áa]s\s+amigable|m[áa]s\s+amable|muy\s+informativo|no\s+engancha|agresividad\s+de\s+venta|hablando\s+muy|sonando\s+(?:a\s|muy|como)|suena[sn]?\s+(?:muy|a\s|como\s|gen[ée]ric|argentin|rob[óo]t)|no\s+(?:digas|hables|escribas)|mejora(?:r|ndo)?\s+(?:el|los|la)\s+(?:mensaje|texto|habla)|escrit\w+\s+(?:demasiado|muy)\s+perfect)/i;
export const esCorreccionDeEstilo = (s: string): boolean => CORRECCION_ESTILO_RE.test(s);

// Un pitch entregado de verdad = bloque citado con sustancia (≥40 chars).
export const TIENE_PITCH_CITADO = (s: string): boolean => /["“«][^"”»]{40,}["”»]/.test(s);

// ── Voseo residual DENTRO del pitch citado ──────────────────────────────────────
// El neutralizador (whatsapp.ts) corrige lo mapeado en TODO el mensaje al enviarlo.
// Esta lista caza conjugaciones dentro de comillas — el texto que el closer copia y
// pega a una creadora — por si se cuela una forma que el mapa no cubre. El 05/08 se
// fugaron "Vos ganás" y "pa que vos" tres veces en pitches.
const VOSEO_PITCH_RE =
  /\b(?:vos|sos|ganás|seguís|tenés|podés|querés|sabés|hacés|decís|venís|cobrás|facturás|entrás|vendés|llevás|pensás|necesitás|trabajás|manejás|respondés|escribís|subís|quedás)\b/i;
export function detectarVoseoEnPitch(s: string): string | null {
  for (const m of s.matchAll(/["“«]([^"”»]{20,})["”»]/g)) {
    const v = m[1].match(VOSEO_PITCH_RE);
    if (v) return v[0];
  }
  return null;
}
