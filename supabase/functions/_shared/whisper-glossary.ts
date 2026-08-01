// whisper-glossary.ts — el glosario que se le pasa a Whisper como `prompt`.
//
// POR QUÉ: Whisper transcribe fonéticamente lo que no conoce. En un día real
// (31/07, DM de Álvaro) eso produjo "hágame un shit" (dijo: sheet), "el hop stop"
// (Hubstaff), "arroba calorina" (Carolina) y "al Ixep" (a Lizeth) — y sobre esas
// palabras el bot toma decisiones. El campo `prompt` de la API (OpenAI-compatible;
// lo honran tanto faster-whisper-server como Groq) sesga la decodificación hacia
// el vocabulario esperado: es EL mecanismo estándar para jerga y nombres propios.
//
// Cómo funciona: Whisper lo trata como "texto que vino justo antes del audio", no
// como una instrucción. Por eso tiene forma de oración con los términos adentro,
// y no de comando. Tope práctico: Groq corta a 224 tokens — mantenerlo corto.
//
// Dos fuentes:
//   · FIJO: herramientas y jerga de la agencia + nombres del equipo. Nombres
//     nuevos que Whisper masacre → agregarlos ACÁ.
//   · DINÁMICO: los display names de los miembros del grupo del mensaje (en un
//     DM no aparece el equipo — por eso el fijo lleva los nombres igual).

// deno-lint-ignore-file no-explicit-any

const HERRAMIENTAS = [
  "Hubstaff", "Google Sheets", "un sheet", "OnlyFans", "Maven", "Clari",
  "Promolog", "BLU", "warming", "chatters", "closers", "Unlimited",
  "cloud phone", "Instagram", "Telegram", "TikTok",
];

// Nombres que aparecen en los audios del equipo. Whisper acierta mucho más si
// los vio en el prompt ("Lizeth" no es una palabra que su LM español espere).
const EQUIPO = [
  "Álvaro", "Jhon", "Brayan", "Lizeth", "Isabel", "Daniel", "Carolina",
  "Fabiana", "Juanse", "Julieth", "Miguel", "María", "Luis", "Kash",
];

/** Nombres de los miembros del grupo (para audios de grupos: quién habla y a
 *  quién nombran suele estar ahí). Falla en silencio: el glosario es una ayuda,
 *  nunca un motivo para no transcribir. */
async function memberNames(sb: any, groupId: string | null): Promise<string[]> {
  if (!groupId) return [];
  try {
    const { data } = await sb
      .from("whatsapp_members")
      .select("display_name")
      .eq("group_id", groupId)
      .eq("active", true)
      .limit(30);
    return (data ?? [])
      .map((m: any) => String(m.display_name ?? "").trim())
      // Sin números pelados ni strings vacíos; un display name telefónico no ayuda.
      .filter((n: string) => n && !/^\+?\d[\d\s-]*$/.test(n));
  } catch {
    return [];
  }
}

/** Arma el prompt de vocabulario para un audio de este grupo. */
export async function buildGlossaryPrompt(sb: any, groupId: string | null): Promise<string> {
  const extra = await memberNames(sb, groupId);
  // dedup case-insensitive conservando la primera forma
  const seen = new Set<string>();
  const all = [...EQUIPO, ...extra, ...HERRAMIENTAS].filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return `Nota de voz del equipo de la agencia Kash, sobre gestión de modelos. ` +
    `Suelen nombrar a ${all.slice(0, 40).join(", ")}.`;
}
