// whisper-glossary.ts — el vocabulario mínimo que se le pasa a Whisper.
//
// POR QUÉ: Whisper transcribe fonéticamente lo que no conoce. En un día real
// (31/07, DM de Álvaro) eso produjo "hágame un shit" (dijo: sheet), "el hop stop"
// (Hubstaff) y "al Ixep" (a Lizeth) — y sobre esas palabras el bot decide.
// El campo `prompt`/`hotwords` de la API sesga la decodificación hacia el
// vocabulario esperado y corrige exactamente eso (medido: hopstab→Hubstaff,
// Lisette→Lizeth, shit→sheet).
//
// ⚠️ SOLO LO IMPRESCINDIBLE, A PROPÓSITO. La primera versión metía las 50
// creadoras activas + todos los miembros del grupo (85 términos). Medido contra
// audios reales el 01/08: corregía los nombres pero introducía derivas en el
// resto ("Presionarme"→"Presioname", puntuación perdida) — cuanto más
// vocabulario forzás, más empuja a Whisper a encajar esas palabras donde no van.
// Jhon pidió dejar lo mínimo. Regla para agregar un término acá: que se lo haya
// visto fallar EN UN AUDIO REAL, no por las dudas.

// Los que fallaron de verdad, con el error observado al lado.
const IMPRESCINDIBLE = [
  "Hubstaff",   // → "hop stop", "hopstab"
  "sheet",      // → "shit"
  "Lizeth",     // → "Lisette", "Ixep"
  "Carolina",   // → "calorina"
  "Fabiana",
  "Brayan",
  "Isabel",
  "Daniel",
  "Álvaro",
  "OnlyFans",
  "Maven",
];

export interface Glossary {
  /** Para el `prompt` estándar (Groq y cualquier server OpenAI-compatible). */
  prompt: string;
  /** Para `hotwords` de speaches (self-host). NUNCA junto al prompt: faster-whisper
   *  mete los dos en los 448 tokens del decoder (223 c/u) y con ambos revienta con
   *  "No position encodings are defined for positions >= 448". */
  hotwords: string;
}

/** Vocabulario mínimo. Fijo y chico: no depende de la DB, así que no hay query
 *  ni riesgo de que crezca solo cuando entran creadoras nuevas.
 *  (La firma mantiene sb/groupId por compatibilidad con los dos callers.) */
// deno-lint-ignore no-explicit-any
export function buildGlossary(_sb?: any, _groupId?: string | null): Glossary {
  const terms = IMPRESCINDIBLE.join(", ");
  return {
    // Redactado como oración, no como orden: Whisper trata el prompt como
    // "texto que vino justo antes del audio", no como una instrucción.
    prompt: `Nota de voz del equipo de la agencia Kash. Suelen nombrar a ${terms}.`,
    hotwords: terms,
  };
}

/** Compat: la firma vieja (solo el prompt). */
// deno-lint-ignore no-explicit-any
export function buildGlossaryPrompt(_sb?: any, _groupId?: string | null): string {
  return buildGlossary().prompt;
}
