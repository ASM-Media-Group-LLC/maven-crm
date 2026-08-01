// whisper-postfix.ts — corrección de vocabulario DESPUÉS de transcribir.
//
// POR QUÉ NO SE HACE ANTES (con prompt/hotwords, que es lo "estándar"):
// medido contra los audios reales de Álvaro el 01/08, con el A/B sin_glosario
// (mismo server, única variable el vocabulario). El glosario corregía lo suyo
// —"hopstab"→Hubstaff, "Lisette"→Lizeth, "shit"→sheet— pero ALTERABA el resto
// del audio, porque va dentro del contexto del decoder y sesga TODA la
// decodificación, no solo esas palabras:
//     sin glosario: "...me dice que ya lo hiciste... A Brian, presionarme igual."  ✅ fiel
//     con glosario: "Presioname... me DIRÉ que ya lo hiciste... presioname A igual" ✗
// Achicar la lista de 85 a 11 términos NO lo eliminó: es inherente al mecanismo.
//
// Acá el audio se transcribe LIMPIO (sin sesgo) y los errores conocidos se
// arreglan sobre el texto, de forma determinística: gratis, predecible y sin
// tocar ni una palabra que no esté en la tabla.
//
// REGLA PARA AGREGAR UNA ENTRADA: haber visto el error en un audio real. Y que
// el patrón no pueda pisar una palabra legítima — por eso "shit" solo se
// corrige precedido de artículo ("un shit" = un sheet), y no suelto.
//
// NO se corrigen los nombres que la gente PRONUNCIA distinto ("Brian" por
// Brayan, "Pachas"): eso no es un error de transcripción, es cómo hablan. De
// esa ambigüedad se ocupa team_name_aliases del lado del bot, que además
// pregunta cuando hay varios candidatos.

interface Regla {
  re: RegExp;
  a: string;
  nota: string;
}

const REGLAS: Regla[] = [
  // "el hop stop de Lizeth", "el hopstab", "el hostaf"
  { re: /\b(?:hop\s?stop|hopstab|hopstaff|hostaf{1,2}|jobstaff|up\s?stop)\b/gi, a: "Hubstaff", nota: "Hubstaff" },
  // "hágame un shit" / "pongan unos shits" → sheet. SOLO con artículo delante:
  // suelto podría ser la palabra en inglés dicha a propósito.
  { re: /\b(un|el|los|unos|una)\s+shits?\b/gi, a: "$1 sheet", nota: "sheet" },
  // "y a Isabel y al Ixep" → "...y a Lizeth" (se corrige también la preposición)
  { re: /\ba[lo]\s+ixep\b/gi, a: "a Lizeth", nota: "Lizeth" },
  { re: /\b(?:lisette|liseth|lizet|lisete|ixep)\b/gi, a: "Lizeth", nota: "Lizeth" },
  { re: /\bcalorina\b/gi, a: "Carolina", nota: "Carolina" },
];

/** Aplica las correcciones conocidas. Devuelve el texto y qué se cambió (para
 *  poder verlo en el evento y saber si la tabla sirve o hay que ajustarla). */
export function corregirTerminos(texto: string): { texto: string; cambios: string[] } {
  let out = texto;
  const cambios: string[] = [];
  for (const r of REGLAS) {
    if (!r.re.test(out)) { r.re.lastIndex = 0; continue; }
    r.re.lastIndex = 0;
    out = out.replace(r.re, r.a);
    cambios.push(r.nota);
  }
  return { texto: out, cambios: [...new Set(cambios)] };
}
